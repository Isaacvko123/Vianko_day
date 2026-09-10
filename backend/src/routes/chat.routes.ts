import { Router, raw } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { AppError } from '../utils/app-error.js';
import { encryptText, decryptText } from '../utils/crypto.js';
import { chatProjectAccess, chatAccess, lockActiveChat, chatDurationMs, encryptFile, decryptFile, maxChatFileBytes, maxChatStorageBytes } from '../services/project-chat.service.js';
import { emitRealtimeEvent } from '../services/realtime.service.js';
import type { Prisma } from '@prisma/client';
const uuid=z.string().uuid();
const fileSelect={id:true,name:true,size:true,mimeType:true,uploadedById:true} as const;
const messageInclude={user:{select:{id:true,name:true}},files:{select:fileSelect}} as const;
function messageJson(message: Prisma.ChatMessageGetPayload<{include:typeof messageInclude}>,userId:string,moderate:boolean){return {id:message.id,chatId:message.chatId,clientId:message.clientId,body:message.deletedAt?'':decryptText(message),createdAt:message.createdAt,deletedAt:message.deletedAt,user:message.user,files:message.files,canDelete:!message.deletedAt&&(moderate||message.userId===userId)};}
async function audit(tx:Prisma.TransactionClient,project:{id:string;workspaceId:string},chatId:string,userId:string,action:string,metadata?:Prisma.InputJsonObject){await tx.activityLog.create({data:{workspaceId:project.workspaceId,projectId:project.id,actorId:userId,entityType:'PROJECT',entityId:chatId,action,metadata}});}
export const chatRouter=Router();chatRouter.use(authenticate);
chatRouter.get('/projects/:projectId/chat',asyncHandler(async(req,res)=>{
  const access=await chatProjectAccess(req.auth!.userId,uuid.parse(req.params.projectId));
  const chat=await prisma.projectChat.findFirst({where:{projectId:access.project.id,expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'},include:{createdBy:{select:{name:true}}}});
  const participants=await prisma.workspaceMember.findMany({where:{workspaceId:access.project.workspaceId,status:'ACTIVE',userType:'INTERNAL',user:{isActive:true,projectMembers:{some:{projectId:access.project.id}}}},select:{user:{select:{id:true,name:true}}},orderBy:{user:{name:'asc'}}});
  res.json({chat,canCreate:access.canModerate&&access.canWrite,canWrite:access.canWrite,canModerate:access.canModerate,participants:participants.map(item=>item.user),serverTime:new Date(),maxFileBytes:maxChatFileBytes});
}));
chatRouter.post('/projects/:projectId/chat',asyncHandler(async(req,res)=>{
  const userId=req.auth!.userId;const access=await chatProjectAccess(userId,uuid.parse(req.params.projectId));
  if(!access.canModerate||!access.canWrite)throw new AppError(403,'CHAT_CREATE_DENIED','Coordinación o administración puede iniciar un chat de seguimiento.');
  const result=await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${access.project.id} FOR UPDATE`;
    const existing=await tx.projectChat.findFirst({where:{projectId:access.project.id,expiresAt:{gt:new Date()}}});if(existing)return {chat:existing,created:false};
    const chat=await tx.projectChat.create({data:{projectId:access.project.id,createdById:userId,expiresAt:new Date(Date.now()+chatDurationMs)}});
    await audit(tx,access.project,chat.id,userId,'chat.started');return {chat,created:true};
  });
  if(result.created)emitRealtimeEvent({type:'chat.started',workspaceId:access.project.workspaceId,projectId:access.project.id,chatId:result.chat.id,actorId:userId,title:'Chat de seguimiento abierto',message:`El equipo de «${access.project.name}» tiene un chat durante siete días.`});
  res.status(result.created?201:200).json(result);
}));
chatRouter.get('/chats/:chatId/messages',asyncHandler(async(req,res)=>{
  const userId=req.auth!.userId;const access=await chatAccess(userId,uuid.parse(req.params.chatId));
  const before=req.query.before?uuid.parse(req.query.before):undefined;
  const cursor=before?await prisma.chatMessage.findFirst({where:{id:before,chatId:access.chat.id},select:{id:true,createdAt:true}}):undefined;
  if(before&&!cursor)throw new AppError(400,'CHAT_CURSOR_INVALID','La posición del historial ya no existe. Vuelve al chat.');
  const messages=await prisma.chatMessage.findMany({where:{chatId:access.chat.id,...(cursor?{OR:[{createdAt:{lt:cursor.createdAt}},{createdAt:cursor.createdAt,id:{lt:cursor.id}}]}:{})},orderBy:[{createdAt:'desc'},{id:'desc'}],take:51,include:messageInclude});
  const page=messages.slice(0,50);res.json({messages:page.reverse().map(item=>messageJson(item,userId,access.canModerate)),hasMore:messages.length>50,expiresAt:access.chat.expiresAt});
}));
chatRouter.post('/chats/:chatId/messages',asyncHandler(async(req,res)=>{
  const userId=req.auth!.userId;const access=await chatAccess(userId,uuid.parse(req.params.chatId),true);
  const input=z.object({clientId:uuid,body:z.string().trim().max(10000).default(''),fileIds:z.array(uuid).max(3).default([])}).strict().refine(value=>Boolean(value.body)||value.fileIds.length>0,'Escribe un mensaje o adjunta un archivo.').parse(req.body);
  const result=await prisma.$transaction(async tx=>{
    await lockActiveChat(tx,access.chat.id);
    const existing=await tx.chatMessage.findUnique({where:{chatId_userId_clientId:{chatId:access.chat.id,userId,clientId:input.clientId}},include:messageInclude});if(existing)return {message:existing,created:false};
    const ids=[...new Set(input.fileIds)];
    const files=await tx.chatFile.count({where:{id:{in:ids},chatId:access.chat.id,uploadedById:userId,messageId:null}});
    if(files!==ids.length)throw new AppError(400,'CHAT_FILE_INVALID','Algún archivo ya no está disponible. Vuelve a adjuntarlo.');
    const message=await tx.chatMessage.create({data:{chatId:access.chat.id,userId,clientId:input.clientId,...encryptText(input.body)}});
    await tx.chatFile.updateMany({where:{id:{in:ids},chatId:access.chat.id,uploadedById:userId,messageId:null},data:{messageId:message.id}});
    await audit(tx,access.project,access.chat.id,userId,'chat.message',{messageId:message.id});
    return {message:(await tx.chatMessage.findUniqueOrThrow({where:{id:message.id},include:messageInclude})),created:true};
  });
  if(result.created)emitRealtimeEvent({type:'chat.message',workspaceId:access.project.workspaceId,projectId:access.project.id,chatId:access.chat.id,actorId:userId,title:'Mensaje en el chat de seguimiento',message:`${result.message.user.name} envió ${input.fileIds.length?'un mensaje con archivos':'un mensaje'} en «${access.project.name}».`});
  res.status(result.created?201:200).json({message:messageJson(result.message,userId,access.canModerate)});
}));
chatRouter.post('/chats/:chatId/files/:fileId',raw({type:'application/octet-stream',limit:maxChatFileBytes}),asyncHandler(async(req,res)=>{
  const userId=req.auth!.userId;const access=await chatAccess(userId,uuid.parse(req.params.chatId),true);const fileId=uuid.parse(req.params.fileId);
  const input=z.object({name:z.string().trim().min(1).max(180),mimeType:z.string().max(120).default('application/octet-stream')}).parse(req.query);
  if(!Buffer.isBuffer(req.body)||!req.body.length||req.body.length>maxChatFileBytes)throw new AppError(400,'CHAT_FILE_SIZE','Adjunta un archivo de hasta 10 MB.');
  const name=input.name.replace(/[\x00-\x1f\x7f/\\]/g,'_');
  const file=await prisma.$transaction(async tx=>{
    await lockActiveChat(tx,access.chat.id);
    const existing=await tx.chatFile.findUnique({where:{id:fileId},select:{...fileSelect,chatId:true}});
    if(existing){if(existing.chatId!==access.chat.id||existing.uploadedById!==userId)throw new AppError(409,'CHAT_FILE_CONFLICT','Vuelve a adjuntar el archivo.');return existing;}
    const storage=await tx.chatFile.aggregate({where:{chatId:access.chat.id},_sum:{size:true}});
    if((storage._sum.size??0)+req.body.length>maxChatStorageBytes)throw new AppError(400,'CHAT_STORAGE_LIMIT','El chat llegó a 100 MB. Elimina archivos que ya no necesiten para liberar espacio.');
    return tx.chatFile.create({data:{id:fileId,chatId:access.chat.id,uploadedById:userId,name,mimeType:input.mimeType,size:req.body.length,...encryptFile(req.body,access.chat.id,fileId)},select:fileSelect});
  });res.status(201).json({file});
}));
chatRouter.get('/chats/:chatId/files/:fileId',asyncHandler(async(req,res)=>{
  const access=await chatAccess(req.auth!.userId,uuid.parse(req.params.chatId));const file=await prisma.chatFile.findFirst({where:{id:uuid.parse(req.params.fileId),chatId:access.chat.id,message:{deletedAt:null}}});
  if(!file)throw new AppError(404,'CHAT_FILE_NOT_FOUND','El archivo fue eliminado o ya no está disponible.');
  res.set({'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.send(decryptFile(file));
}));
chatRouter.delete('/chats/:chatId/files/:fileId',asyncHandler(async(req,res)=>{
  const userId=req.auth!.userId;const access=await chatAccess(userId,uuid.parse(req.params.chatId),true);
  await prisma.$transaction(async tx=>{await lockActiveChat(tx,access.chat.id);const file=await tx.chatFile.findFirst({where:{id:uuid.parse(req.params.fileId),chatId:access.chat.id},select:{id:true,uploadedById:true,messageId:true}});
    if(!file || (req.query.pending === 'true' && file.messageId))return;if(file.uploadedById!==userId&&!access.canModerate)throw new AppError(403,'CHAT_DELETE_DENIED','Solo el autor o coordinación puede eliminar este archivo.');
    await tx.chatFile.delete({where:{id:file.id}});await audit(tx,access.project,access.chat.id,userId,'chat.file_deleted');
  });emitRealtimeEvent({type:'chat.updated',workspaceId:access.project.workspaceId,projectId:access.project.id,chatId:access.chat.id,actorId:userId,title:'Archivo eliminado',message:'Se actualizó el chat de seguimiento.'});res.status(204).send();
}));
chatRouter.delete('/chats/:chatId/messages/:messageId',asyncHandler(async(req,res)=>{
  const userId=req.auth!.userId;const access=await chatAccess(userId,uuid.parse(req.params.chatId),true);
  await prisma.$transaction(async tx=>{await lockActiveChat(tx,access.chat.id);const message=await tx.chatMessage.findFirst({where:{id:uuid.parse(req.params.messageId),chatId:access.chat.id}});if(!message||message.deletedAt)return;
    if(message.userId!==userId&&!access.canModerate)throw new AppError(403,'CHAT_DELETE_DENIED','Solo el autor o coordinación puede eliminar este mensaje.');
    await tx.chatFile.deleteMany({where:{messageId:message.id}});await tx.chatMessage.update({where:{id:message.id},data:{deletedAt:new Date(),bodyCiphertext:'',bodyNonce:'',bodyAuthTag:''}});await audit(tx,access.project,access.chat.id,userId,'chat.message_deleted');
  });emitRealtimeEvent({type:'chat.updated',workspaceId:access.project.workspaceId,projectId:access.project.id,chatId:access.chat.id,actorId:userId,title:'Mensaje eliminado',message:'Se actualizó el chat de seguimiento.'});res.status(204).send();
}));
chatRouter.post('/chats/:chatId/read',asyncHandler(async(req,res)=>{
  const userId=req.auth!.userId;const access=await chatAccess(userId,uuid.parse(req.params.chatId));const ids=z.object({messageIds:z.array(uuid).max(100)}).parse(req.body).messageIds;
  const events=await prisma.activityLog.findMany({where:{projectId:access.project.id,entityType:'PROJECT',entityId:access.chat.id,OR:[{action:'chat.started'},{action:'chat.message',OR:ids.map(id=>({metadata:{path:['messageId'],equals:id}}))}]},select:{id:true}});
  await prisma.notificationRead.createMany({data:events.map(item=>({userId,activityId:item.id})),skipDuplicates:true});
  emitRealtimeEvent({type:'notification.read',workspaceId:access.project.workspaceId,actorId:userId,recipientUserIds:[userId],visibility:'recipients',title:'Lectura sincronizada',message:''});res.json({read:true});
}));
chatRouter.delete('/chats/:chatId',asyncHandler(async(req,res)=>{
  const userId=req.auth!.userId;const access=await chatAccess(userId,uuid.parse(req.params.chatId));if(!access.canModerate)throw new AppError(403,'CHAT_CLOSE_DENIED','Solo coordinación puede cerrar este chat.');
  await prisma.$transaction(async tx=>{await lockActiveChat(tx,access.chat.id);await audit(tx,access.project,access.chat.id,userId,'chat.closed');await tx.projectChat.delete({where:{id:access.chat.id}});});
  emitRealtimeEvent({type:'chat.closed',workspaceId:access.project.workspaceId,projectId:access.project.id,chatId:access.chat.id,actorId:userId,title:'Chat de seguimiento cerrado',message:'Los mensajes y archivos de este chat se eliminaron.'});res.status(204).send();
}));
