import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { assertWorkspaceMember, assertProjectAccess, projectVisibilityFilter, getRolePermissions, getWorkspaceMemberLocalityIds } from './access-control.service.js';
import { canManageProjectTasks } from '../models/business-policy.js';

export async function notificationScope(userId: string, workspaceId: string): Promise<Prisma.ActivityLogWhereInput> {
  const member = await assertWorkspaceMember(userId, workspaceId);
  const projects = await prisma.project.findMany({ where: { workspaceId, deletedAt: null, ...await projectVisibilityFilter(userId, member) }, select: { id: true } });
  const contexts = await Promise.all(projects.map((project) => assertProjectAccess(userId, project.id)));
  const managedIds = contexts.filter((access) => canManageProjectTasks(access.permissions)).map((access) => access.project.id);
  const sharedIds = contexts.filter((access) => access.permissions.includes('task.view_all')).map((access) => access.project.id);
  const permissions = await getRolePermissions(member.roleId ?? undefined, workspaceId);
  const localities = await getWorkspaceMemberLocalityIds(member);
  const staffing = member.userType === 'INTERNAL' ? await prisma.projectStaffingRequest.findMany({ where: {
    workspaceId, OR: [{ requesterId: userId }, { assignments: { some: { userId } } }, ...(permissions.includes('workspace.manage') ? [{}] : permissions.includes('staffing.respond') && member.areaId ? [{ targetAreaId: member.areaId, ...(localities.length ? { OR: [{ targetLocalityId: null }, { targetLocalityId: { in: localities } }] } : {}) }] : [])]
  }, select: { id: true } }) : [];
  const chats = member.userType === 'INTERNAL' ? await prisma.projectChat.findMany({where:{projectId:{in:sharedIds},expiresAt:{gt:new Date()}},select:{id:true}}) : [];
  return { workspaceId, createdAt: member.joinedAt ? { gte: member.joinedAt } : undefined,
    AND: [
      { OR: [{ actorId: null }, { actorId: { not: userId } }] },
      { OR: [
        { task: { deletedAt: null, OR: [{ projectId: { in: managedIds } }, { projectId: { in: sharedIds }, OR: [
          { createdById: userId }, { assignees: { some: { userId } } }, { mentions: { some: { userId } } }
        ] }] } },
        { taskId: null, entityType: 'PROJECT', projectId: { in: managedIds }, NOT:{action:{startsWith:'chat.'}} },
        { entityType:'PROJECT', entityId:{in:chats.map(chat=>chat.id)}, action:{in:['chat.started','chat.message']} },
        { entityType: 'STAFFING_REQUEST', entityId: { in: staffing.map((request) => request.id) } }
      ] },
      ...(member.userType === 'EXTERNAL' ? [{ NOT: { action: 'comment.created', after: { path: ['isInternal'], equals: true } } }] : [])
    ]
  };
}
const labels: Record<string, string> = {
  'chat.message': 'Mensaje en chat de seguimiento', 'chat.started': 'Chat de seguimiento abierto',
  'task.created': 'Nueva tarea', 'task.updated': 'Tarea actualizada', 'task.assigned': 'Asignación actualizada',
  'task.mentioned': 'Te compartieron una tarea', 'task.completed': 'Tarea terminada', 'task.reopened': 'Tarea reabierta',
  'task.status_changed': 'Nuevo estado', 'task.unassigned': 'Responsables actualizados', 'comment.created': 'Nuevo comentario',
  'time.logged': 'Avance registrado', 'staffing.requested': 'Solicitud de personal', 'staffing.approved': 'Personal aprobado',
  'staffing.rejected': 'Solicitud respondida', 'project.created': 'Nuevo proyecto', 'project.updated': 'Proyecto actualizado'
};
export function notificationTitle(action: string) { return labels[action] ?? 'Nueva actividad'; }
export function notificationUrl(event: { workspaceId: string; projectId?: string | null; taskId?: string | null; entityType: string; entityId: string; action?: string }, staffingView = true) {
  const query = new URLSearchParams({ workspace: event.workspaceId });
  if (event.entityType === 'STAFFING_REQUEST' && staffingView) { query.set('request', event.entityId); return `/management?${query}`; }
  if (event.projectId) query.set('project', event.projectId);
  if (event.action?.startsWith('chat.')) { query.set('chat',event.entityId); return `/board?${query}`; }
  if (event.taskId) query.set('task', event.taskId);
  if (event.action === 'comment.created') { query.set('tab', 'conversation'); query.set('comment', event.entityId); }
  return `/board?${query}`;
}

export async function notificationUrlForUser(event: Parameters<typeof notificationUrl>[0], userId: string) {
  if (event.entityType !== 'STAFFING_REQUEST') return notificationUrl(event);
  const member = await assertWorkspaceMember(userId, event.workspaceId);
  const permissions = await getRolePermissions(member.roleId ?? undefined, event.workspaceId);
  return notificationUrl(event, member.userType === 'INTERNAL' && permissions.some(key => ['workspace.manage', 'project.request_staffing', 'staffing.respond'].includes(key)));
}

export function notificationPresentation(event: { action: string; after: unknown; actor?: { name: string } | null; task?: { title: string } | null; project?: { name: string } | null }, userId: string) {
  const after = event.after && typeof event.after === 'object' && !Array.isArray(event.after) ? event.after as Record<string, unknown> : {};
  const actor = event.actor?.name ?? 'Tu equipo';
  const actions: Record<string, string> = {
    'chat.started': 'abrió un chat de seguimiento por siete días', 'chat.message': 'envió un mensaje en el chat de seguimiento',
    'task.created': 'creó una tarea', 'task.updated': 'actualizó la tarea', 'task.assigned': after.userId === userId ? 'te asignó esta tarea' : 'actualizó los responsables',
    'task.mentioned': after.userId === userId ? 'te compartió el seguimiento' : 'compartió el seguimiento', 'task.completed': 'terminó la tarea', 'task.reopened': 'reabrió la tarea',
    'task.status_changed': 'cambió el estado de la tarea', 'task.unassigned': 'retiró a un responsable', 'comment.created': after.isInternal ? 'envió un mensaje interno' : 'envió un mensaje',
    'time.logged': 'registró tiempo de trabajo', 'staffing.requested': 'solicitó apoyo de otra área', 'staffing.approved': 'aprobó la solicitud de apoyo', 'staffing.rejected': 'rechazó la solicitud de apoyo',
    'project.created': 'creó el proyecto', 'project.updated': 'actualizó el proyecto', 'project.members_added': 'incorporó personas al proyecto', 'project.member_added': 'incorporó una persona al proyecto'
  };
  const isComment = event.action === 'comment.created';
  const isChat = event.action.startsWith('chat.');
  return { title: isComment ? after.isInternal ? 'Mensaje interno' : 'Nuevo mensaje' : notificationTitle(event.action),
    message: `${actor} ${actions[event.action] ?? 'registró una actualización'}.`, actorName: actor,
    context: event.task?.title ?? event.project?.name ?? 'Trabajo del equipo', projectName: event.project?.name,
    category: isComment || isChat ? 'messages' : event.action.startsWith('staffing.') ? 'requests' : 'tasks',
    actionLabel: isChat ? 'Abrir chat' : isComment ? 'Ver conversación' : event.action.startsWith('staffing.') ? 'Ver solicitud' : event.task ? 'Ver tarea' : 'Ver proyecto' };
}
