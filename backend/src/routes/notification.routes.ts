import { emitRealtimeEvent } from "../services/realtime.service.js";
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { notificationScope, notificationPresentation, notificationUrlForUser } from '../services/notification.service.js';
import { getParam, getQueryString } from '../utils/request.js';
import { paginationQuery, uuidParam } from '../validators/common.schemas.js';
import { AppError } from '../utils/app-error.js';

export const notificationRouter = Router();
notificationRouter.use(authenticate);
notificationRouter.get('/notifications', validate(z.object({ query: paginationQuery.extend({ workspaceId: uuidParam, unread: z.enum(['true','false']).default('false'), category: z.enum(['all','messages','requests','tasks']).default('all') }) })), asyncHandler(async (req, res) => {
  const userId = req.auth!.userId;
  const scope = await notificationScope(userId, getQueryString(req, 'workspaceId'));
  const category = req.query.category;
  const categoryFilter = category === 'messages' ? { OR:[{action:'comment.created'},{action:{startsWith:'chat.'}}] } : category === 'requests' ? { action: { startsWith: 'staffing.' } } : category === 'tasks' ? { NOT: { OR: [{action:'comment.created'}, {action:{startsWith:'chat.'}}, {action:{startsWith:'staffing.'}}] } } : {};
  const filteredScope = { AND: [scope, categoryFilter, ...(req.query.unread === 'true' ? [{ notificationReads: { none: { userId } } }] : [])] };
  const [items, unreadCount, total] = await Promise.all([
    prisma.activityLog.findMany({ where: filteredScope, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: Number(req.query.limit), skip: Number(req.query.offset),
      include: { actor: { select: { name: true } }, task: { select: { title: true } }, project: { select: { name: true } }, notificationReads: { where: { userId }, select: { readAt: true } } } }),
    prisma.activityLog.count({ where: { AND: [scope, { notificationReads: { none: { userId } } }] } }),
    prisma.activityLog.count({ where: filteredScope })
  ]);
  res.json({ notifications: await Promise.all(items.map(async (item) => ({ id: item.id, ...notificationPresentation(item, userId),
    createdAt: item.createdAt, readAt: item.notificationReads[0]?.readAt, url: await notificationUrlForUser(item, userId) }))), unreadCount, total, serverTime: new Date().toISOString() });
}));
notificationRouter.post('/notifications/read', validate(z.object({ body: z.object({ workspaceId: uuidParam, ids: z.array(uuidParam).min(1).max(100) }) })), asyncHandler(async (req, res) => {
  const userId = req.auth!.userId;
  const scope = await notificationScope(userId, req.body.workspaceId);
  const events = await prisma.activityLog.findMany({ where: { AND: [scope, { id: { in: req.body.ids } }] }, select: { id: true } });
  await prisma.notificationRead.createMany({ data: events.map((event) => ({ userId, activityId: event.id })), skipDuplicates: true });
  emitRealtimeEvent({ type: "notification.read", workspaceId: req.body.workspaceId, actorId: userId, recipientUserIds: [userId], visibility: "recipients", title: "Lectura sincronizada", message: "" });
  res.json({ readIds: events.map((event) => event.id) });
}));
notificationRouter.get('/push/config', (_req, res) => res.json({ publicKey: process.env.VAPID_PUBLIC_KEY, enabled: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) }));
const pushEndpoint = z.string().url().max(2048).refine((value) => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
    && ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}, 'Proveedor de notificaciones no admitido.');
notificationRouter.post('/push/subscriptions/status', validate(z.object({ body: z.object({ endpoint: pushEndpoint }) })), asyncHandler(async (req, res) => {
  const subscription = await prisma.pushSubscription.findFirst({ where: { userId: req.auth!.userId, endpoint: req.body.endpoint }, select: { id: true } });
  res.json({ subscribed: Boolean(subscription) });
}));
notificationRouter.post('/push/subscriptions', validate(z.object({ body: z.object({ endpoint: pushEndpoint, keys: z.object({ p256dh: z.string().min(16).max(256), auth: z.string().min(8).max(256) }) }) })), asyncHandler(async (req, res) => {
  const userId = req.auth!.userId;
  const count = await prisma.pushSubscription.count({ where: { userId } });
  if (count >= 10 && !await prisma.pushSubscription.findUnique({ where: { endpoint: req.body.endpoint } })) throw new AppError(400, 'DEVICE_LIMIT', 'Ya tienes diez dispositivos registrados.');
  await prisma.pushSubscription.upsert({ where: { endpoint: req.body.endpoint }, update: { userId, ...req.body.keys }, create: { userId, endpoint: req.body.endpoint, ...req.body.keys } });
  res.status(201).json({ subscribed: true });
}));
notificationRouter.delete('/push/subscriptions', validate(z.object({ body: z.object({ endpoint: pushEndpoint }) })), asyncHandler(async (req, res) => {
  await prisma.pushSubscription.deleteMany({ where: { userId: req.auth!.userId, endpoint: req.body.endpoint } }); res.status(204).send();
}));
