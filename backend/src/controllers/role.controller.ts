import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { assertWorkspacePermission, getRolePermissions } from '../services/access-control.service.js';
import { emitRealtimeEvent } from '../services/realtime.service.js';
import { AppError } from '../utils/app-error.js';
import { getParam } from '../utils/request.js';
import { ROLE_DEFINITIONS } from '../models/permissions.js';
import { ROLE_PROFILES, identifyRoleProfile, profilePermissions, reservedRoleNames, type RoleProfileId } from '../models/role-profiles.js';

async function admin(req: Request) {
  const workspaceId = getParam(req, 'workspaceId');
  const member = await assertWorkspacePermission(req.auth!.userId, workspaceId, 'workspace.manage');
  if (member.userType !== 'INTERNAL') throw new AppError(403, 'ROLE_ADMIN_REQUIRED', 'Solo administración interna puede gestionar roles.');
  return workspaceId;
}
const counts = { members: true, projectMembers: true, invitations: true, projectStaffingRequests: true } as const;

export async function roleCatalog(req: Request, res: Response) {
  const workspaceId = await admin(req);
  const rows = await prisma.role.findMany({ where: { workspaceId }, include: { _count: { select: counts } }, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] });
  const roles = await Promise.all(rows.map(async role => {
    const permissions = await getRolePermissions(role.id, workspaceId);
    return { ...role, description: (role.isSystem ? ROLE_DEFINITIONS.find(item => item.name === role.name)?.description : undefined) ?? role.description,
      permissions, profileId: identifyRoleProfile(permissions), canDelete: !role.isSystem && Object.values(role._count).every(count => count === 0) };
  }));
  res.json({ roles, profiles: ROLE_PROFILES });
}

function validateName(name: string) {
  if (reservedRoleNames.has(name.toLocaleLowerCase('es'))) throw new AppError(409, 'ROLE_NAME_RESERVED', 'Ese nombre identifica un rol predefinido. Elige un nombre distinto.');
}
async function audit(tx: Prisma.TransactionClient, req: Request, workspaceId: string, roleId: string, action: string, after: Prisma.InputJsonValue) {
  await tx.activityLog.create({ data: { workspaceId, actorId: req.auth!.userId, entityType: 'WORKSPACE', entityId: roleId, action, after } });
}
function notify(req: Request, workspaceId: string) {
  emitRealtimeEvent({ type: 'workspace.role_saved', workspaceId, actorId: req.auth!.userId, title: 'Roles actualizados', message: 'El catálogo de accesos está actualizado.' });
}

export async function createRole(req: Request, res: Response) {
  const workspaceId = await admin(req);
  const { name, description, profileId } = req.body as { name: string; description: string; profileId: RoleProfileId };
  validateName(name);
  const role = await prisma.$transaction(async tx => {
    if (await tx.role.findFirst({ where: { workspaceId, name: { equals: name, mode: 'insensitive' } } })) throw new AppError(409, 'ROLE_NAME_EXISTS', 'Ya existe un rol con ese nombre.');
    const keys = profilePermissions(profileId);
    const permissions = await Promise.all(keys.map(key => tx.permission.upsert({ where: { workspaceId_key: { workspaceId, key } }, create: { workspaceId, key }, update: {} })));
    const created = await tx.role.create({ data: { workspaceId, name, description, permissions: { create: permissions.map(permission => ({ permissionId: permission.id })) } } });
    await audit(tx, req, workspaceId, created.id, 'role.created', { name, profileId, permissions: keys });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  notify(req, workspaceId);
  res.status(201).json({ role });
}

export async function updateRole(req: Request, res: Response) {
  const workspaceId = await admin(req);
  const roleId = getParam(req, 'roleId');
  const { name, description, expectedUpdatedAt } = req.body;
  validateName(name);
  const role = await prisma.$transaction(async tx => {
    const current = await tx.role.findFirst({ where: { id: roleId, workspaceId } });
    if (!current) throw new AppError(404, 'ROLE_NOT_FOUND', 'No se encontró el rol.');
    if (current.isSystem) throw new AppError(403, 'SYSTEM_ROLE_PROTECTED', 'Los roles predefinidos están protegidos. Crea un rol personalizado.');
    if (await tx.role.findFirst({ where: { workspaceId, id: { not: roleId }, name: { equals: name, mode: 'insensitive' } } })) throw new AppError(409, 'ROLE_NAME_EXISTS', 'Ya existe un rol con ese nombre.');
    // Access is immutable: rename the role, or create another profile and explicitly reassign people.
    const updated = await tx.role.update({ where: { id: roleId, updatedAt: new Date(expectedUpdatedAt) }, data: { name, description } });
    await audit(tx, req, workspaceId, roleId, 'role.updated', { name, description });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  notify(req, workspaceId);
  res.json({ role });
}

export async function deleteRole(req: Request, res: Response) {
  const workspaceId = await admin(req);
  const roleId = getParam(req, 'roleId');
  await prisma.$transaction(async tx => {
    const role = await tx.role.findFirst({ where: { id: roleId, workspaceId }, include: { _count: { select: counts } } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'No se encontró el rol.');
    if (role.isSystem) throw new AppError(403, 'SYSTEM_ROLE_PROTECTED', 'No se pueden eliminar roles predefinidos.');
    if (Object.values(role._count).some(count => count > 0)) throw new AppError(409, 'ROLE_IN_USE', 'Este rol está en uso. Reasigna sus personas, proyectos e invitaciones antes de eliminarlo.');
    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.role.delete({ where: { id: roleId } });
    await audit(tx, req, workspaceId, roleId, 'role.deleted', { name: role.name });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  notify(req, workspaceId);
  res.status(204).end();
}
