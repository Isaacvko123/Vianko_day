import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { assertWorkspacePermission, getRolePermissions } from '../services/access-control.service.js';
import { emitRealtimeEvent } from '../services/realtime.service.js';
import { AppError } from '../utils/app-error.js';

export const updateOrganizationSchema = z.object({ params: z.object({ workspaceId: z.string().uuid(), kind: z.enum(['areas', 'localities', 'positions']), recordId: z.string().uuid() }),
  body: z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(500), code: z.string().trim().min(2).max(24).transform(value => value.toUpperCase()).optional(), expectedUpdatedAt: z.string().datetime() }).strict() });

export async function updateOrganization(req: Request, res: Response) {
  const { params: { workspaceId, kind, recordId }, body } = updateOrganizationSchema.parse({ params: req.params, body: req.body });
  const key = kind === 'areas' ? 'area.manage' : kind === 'localities' ? 'locality.manage' : 'position.manage';
  const member = await assertWorkspacePermission(req.auth!.userId, workspaceId, key);
  const permissions = await getRolePermissions(member.roleId ?? undefined, workspaceId);
  if (member.userType !== 'INTERNAL') throw new AppError(403, 'INTERNAL_REQUIRED', 'La estructura solo puede administrarla el equipo interno.');
  const record = await prisma.$transaction(async tx => {
    const where = { id: recordId, workspaceId };
    const current = kind === 'areas' ? await tx.area.findFirst({ where }) : kind === 'localities' ? await tx.locality.findFirst({ where }) : await tx.position.findFirst({ where });
    if (!current) throw new AppError(404, 'STRUCTURE_NOT_FOUND', 'No se encontró el registro en esta empresa.');
    const areaId = 'areaId' in current ? current.areaId : current.id;
    if (!permissions.includes('workspace.manage') && areaId !== member.areaId) throw new AppError(403, 'AREA_SCOPE_DENIED', 'Solo puedes editar la estructura de tu área.');
    const guarded = { ...where, updatedAt: new Date(body.expectedUpdatedAt) };
    const data = { name: body.name, description: body.description };
    const saved = kind === 'areas' ? await tx.area.update({ where: guarded, data }) : kind === 'localities' ? await tx.locality.update({ where: guarded, data: { ...data, ...(body.code ? { code: body.code } : {}) } }) : await tx.position.update({ where: guarded, data });
    await tx.activityLog.create({ data: { workspaceId, actorId: req.auth!.userId, entityType: 'WORKSPACE', entityId: recordId, action: 'organization.updated', before: { name: current.name }, after: { kind, name: saved.name } } });
    return saved;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  emitRealtimeEvent({ type: kind === 'areas' ? 'workspace.area_saved' : kind === 'localities' ? 'workspace.locality_saved' : 'workspace.position_saved', workspaceId, actorId: req.auth!.userId, title: 'Organización actualizada', message: `Se actualizó ${record.name}.` });
  res.json({ record });
}
