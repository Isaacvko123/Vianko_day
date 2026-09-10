import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { assertProjectAccess, getWorkspaceMemberLocalityIds } from './access-control.service.js';
import { AppError } from '../utils/app-error.js';
import { auditJson } from '../utils/audit-json.js';

type Access = Awaited<ReturnType<typeof assertProjectAccess>>;
export async function taskPeopleWhere(access: Access): Promise<Prisma.WorkspaceMemberWhereInput> {
  const { project, workspaceMember, permissions } = access;
  const broad = permissions.includes('workspace.manage') || permissions.includes('project.view_all');
  const actorLocalities = await getWorkspaceMemberLocalityIds(workspaceMember);
  const mayEnroll = workspaceMember.userType === 'INTERNAL' && permissions.includes('project.manage_members') && Boolean(project.areaId)
    && (broad || workspaceMember.areaId === project.areaId)
    && (broad || !actorLocalities.length || Boolean(project.localityId && actorLocalities.includes(project.localityId)));
  const targetLocalities: Prisma.WorkspaceMemberWhereInput = project.localityId ? {
    OR: [{ localityId: project.localityId }, { localityScopes: { some: { localityId: project.localityId } } }, { localityId: null, localityScopes: { none: {} } }]
  } : { localityId: null, localityScopes: { none: {} } };
  return { workspaceId: project.workspaceId, status: 'ACTIVE', user: { isActive: true },
    OR: [{ user: { projectMembers: { some: { projectId: project.id } } } },
      ...(mayEnroll ? [{ userType: 'INTERNAL' as const, areaId: project.areaId, ...targetLocalities }] : [])] };
}
export async function enrollTaskPeople(tx: Prisma.TransactionClient, access: Access, ids: string[], actorId: string, eligibleWhere: Prisma.WorkspaceMemberWhereInput) {
  if (!ids.length) return;
  if (!access.permissions.includes('task.assign')) throw new AppError(403, 'ASSIGNMENT_DENIED', 'Tu rol no permite asignar responsables.');
  const people = await tx.workspaceMember.findMany({ where: { AND: [eligibleWhere, { userId: { in: ids } }] }, select: { userId: true } });
  if (people.length !== ids.length) throw new AppError(403, 'ASSIGNEE_SCOPE_DENIED', 'Selecciona personas activas del proyecto o de su área y localidad. Para incorporar a otra área, solicita apoyo.');
  const existing = await tx.projectMember.findMany({ where: { projectId: access.project.id, userId: { in: ids } }, select: { userId: true } });
  const added = ids.filter(id => !existing.some(member => member.userId === id));
  if (!added.length) return;
  await tx.projectMember.createMany({ data: added.map(userId => ({ projectId: access.project.id, userId })), skipDuplicates: true });
  await tx.activityLog.create({ data: { workspaceId: access.project.workspaceId, projectId: access.project.id, actorId, entityType: 'PROJECT', entityId: access.project.id, action: 'project.members_added', after: auditJson({ userIds: added, reason: 'task_assignment' }) } });
}
export async function listTaskPeople(access: Access) {
  const people = await prisma.workspaceMember.findMany({ where: await taskPeopleWhere(access), orderBy: { user: { name: 'asc' } },
    select: { userId: true, userType: true, user: { select: { id: true, name: true, avatarUrl: true, projectMembers: { where: { projectId: access.project.id }, select: { id: true } } } }, area: { select: { name: true } }, position: { select: { name: true } } } });
  return people.map(person => ({ id: person.userId, name: person.user.name, avatarUrl: person.user.avatarUrl, area: person.area?.name, position: person.position?.name, inProject: person.user.projectMembers.length > 0, external: person.userType === 'EXTERNAL' }));
}
