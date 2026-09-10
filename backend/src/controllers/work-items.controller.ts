import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { assertWorkspaceMember, getRolePermissions, projectVisibilityFilter } from '../services/access-control.service.js';
import { effectivePermissions } from '../models/business-policy.js';
import { getParam } from '../utils/request.js';

const querySchema = z.object({
  state: z.enum(['active', 'completed']).default('active'),
  mine: z.enum(['true', 'false']).default('true'),
  category: z.enum(['REVIEW', 'BLOCKED']).optional(),
  focus: z.enum(['today', 'overdue']).optional(),
  today: z.string().datetime().optional(),
  tomorrow: z.string().datetime().optional(),
  search: z.string().trim().max(150).default(''),
  projectId: z.string().uuid().optional(),
  completedFrom: z.string().datetime().optional(),
  completedTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25)
}).refine(q => !q.completedFrom || !q.completedTo || q.completedFrom <= q.completedTo, 'La fecha inicial debe ser anterior a la final.');

export async function listWorkItems(req: Request, res: Response) {
  const workspaceId = getParam(req, 'workspaceId');
  const userId = req.auth!.userId;
  const member = await assertWorkspaceMember(userId, workspaceId);
  const query = querySchema.parse(req.query);
  const workspacePermissions = await getRolePermissions(member.roleId ?? undefined, workspaceId);
  const projects = await prisma.project.findMany({ where: { workspaceId, deletedAt: null, ...await projectVisibilityFilter(userId, member) },
    select: { id: true, name: true, color: true, members: { where: { userId }, select: { roleId: true } } }, orderBy: { name: 'asc' } });
  const permissions = await Promise.all(projects.map(async project => ({ project, keys: effectivePermissions(workspacePermissions,
    project.members[0]?.roleId ? await getRolePermissions(project.members[0].roleId, workspaceId) : undefined, member.userType) })));
  const visible = permissions.filter(item => item.keys.includes('task.view_all'));
  const fullIds = visible.filter(item => item.keys.some(key => ['workspace.manage', 'task.create', 'task.assign'].includes(key))).map(item => item.project.id);
  const limitedIds = visible.filter(item => !fullIds.includes(item.project.id)).map(item => item.project.id);
  const where: Prisma.TaskWhereInput = { workspaceId, deletedAt: null, board: { deletedAt: null },
    AND: [
      { OR: [{ projectId: { in: fullIds } }, { projectId: { in: limitedIds }, OR: [{ assignees: { some: { userId } } }, { mentions: { some: { userId } } }, { createdById: userId }] }] },
      ...(query.projectId ? [{ projectId: query.projectId }] : []),
      ...(query.mine === 'true' ? [{ assignees: { some: { userId } } }] : []),
      ...(query.search ? [{ OR: [{ title: { contains: query.search, mode: 'insensitive' as const } }, { assignees: { some: { user: { name: { contains: query.search, mode: 'insensitive' as const } } } } }] }] : [])
    ],
    status: query.state === 'completed' ? { countsAsDone: true } : { countsAsDone: false, category: query.category ?? { not: 'CANCELLED' } },
    ...(query.completedFrom || query.completedTo ? { completedAt: { ...(query.completedFrom ? { gte: new Date(query.completedFrom) } : {}), ...(query.completedTo ? { lt: new Date(query.completedTo) } : {}) } } : {}) };
  const today = query.today ? new Date(query.today) : new Date(new Date().setUTCHours(0, 0, 0, 0));
  const tomorrow = query.tomorrow ? new Date(query.tomorrow) : new Date(today.getTime() + 86400000);
  const scope = { ...where };
  const focusFilter = query.focus === 'today' ? { dueAt: { gte: today, lt: tomorrow } } : query.focus === 'overdue' ? { dueAt: { lt: today } } : {};
  Object.assign(where, focusFilter);
  const [total, tasks, activeTotal, dueToday, overdue] = await prisma.$transaction([
    prisma.task.count({ where }),
    prisma.task.findMany({ where, take: query.limit, skip: (query.page - 1) * query.limit,
      orderBy: query.state === 'completed' ? [{ completedAt: 'desc' }, { id: 'asc' }] : [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
      select: { id: true, projectId: true, title: true, priority: true, dueAt: true, completedAt: true, progress: true,
        status: { select: { name: true, color: true, category: true } }, project: { select: { id: true, name: true, color: true } },
        assignees: { select: { user: { select: { id: true, name: true } } } } } }),
    prisma.task.count({ where: scope }),
    prisma.task.count({ where: { ...scope, dueAt: { gte: today, lt: tomorrow } } }),
    prisma.task.count({ where: { ...scope, dueAt: { lt: today } } })
  ], { isolationLevel: 'RepeatableRead' });
  res.json({ tasks, total, summary: { total: activeTotal, today: dueToday, overdue }, page: query.page, pages: Math.max(1, Math.ceil(total / query.limit)), projects: visible.map(({ project: { members: _members, ...project } }) => project) });
}
