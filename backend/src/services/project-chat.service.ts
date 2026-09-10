import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { assertProjectAccess } from './access-control.service.js';
import { AppError } from '../utils/app-error.js';
export const chatDurationMs = 7 * 86400000;
export const maxChatFileBytes = 10 * 1024 * 1024;
export const maxChatStorageBytes = 100 * 1024 * 1024;
export async function chatProjectAccess(userId: string, projectId: string) {
  const access = await assertProjectAccess(userId, projectId);
  if (access.workspaceMember.userType !== 'INTERNAL' || !access.permissions.includes('task.view_all')) throw new AppError(403,'CHAT_INTERNAL_ONLY','Este chat es exclusivo del equipo interno con acceso al proyecto.');
  return {...access, canWrite: access.permissions.includes('task.comment'), canModerate: access.permissions.includes('project.manage_members') || access.permissions.includes('workspace.manage')};
}
export async function chatAccess(userId: string, chatId: string, write = false) {
  const chat = await prisma.projectChat.findFirst({where:{id:chatId,expiresAt:{gt:new Date()}}});
  if(!chat) throw new AppError(410,'CHAT_EXPIRED','Este chat ya terminó. Sus mensajes y archivos dejaron de estar disponibles.');
  const access=await chatProjectAccess(userId,chat.projectId);
  if(write&&!access.canWrite)throw new AppError(403,'CHAT_READ_ONLY','Tu rol permite consultar este chat, pero no enviar mensajes.');
  return {chat,...access};
}
export async function lockActiveChat(tx: Prisma.TransactionClient, chatId: string) {
  await tx.$queryRaw`SELECT "id" FROM "ProjectChat" WHERE "id" = ${chatId} FOR UPDATE`;
  const chat=await tx.projectChat.findFirst({where:{id:chatId,expiresAt:{gt:new Date()}}});
  if(!chat)throw new AppError(410,'CHAT_EXPIRED','El chat terminó antes de guardar. No se envió el contenido.');
  return chat;
}
export function encryptFile(data: Buffer, chatId: string, fileId: string) {
  const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',env.commentEncryptionKey,iv);
  cipher.setAAD(Buffer.from(`${chatId}:${fileId}`));
  return {ciphertext:Buffer.concat([cipher.update(data),cipher.final()]),nonce:iv.toString('base64'),authTag:cipher.getAuthTag().toString('base64')};
}
export function decryptFile(file:{id:string;chatId:string;ciphertext:Uint8Array;nonce:string;authTag:string}) {
  const decipher=crypto.createDecipheriv('aes-256-gcm',env.commentEncryptionKey,Buffer.from(file.nonce,'base64'));
  decipher.setAAD(Buffer.from(`${file.chatId}:${file.id}`));decipher.setAuthTag(Buffer.from(file.authTag,'base64'));
  return Buffer.concat([decipher.update(file.ciphertext),decipher.final()]);
}
export function startChatExpiry() {
  let busy=false;
  async function purge(){if(busy)return;busy=true;try{
    await prisma.projectChat.deleteMany({where:{expiresAt:{lte:new Date()}}});
    await prisma.chatFile.deleteMany({where:{messageId:null,createdAt:{lt:new Date(Date.now()-3600000)}}});
  }catch{console.error('No se pudo completar la limpieza de chats temporales. Se reintentará.');}finally{busy=false;}}
  void purge();const timer=setInterval(()=>void purge(),60000);timer.unref();return()=>clearInterval(timer);
}
