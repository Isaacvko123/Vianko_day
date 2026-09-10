import { AppError } from "../utils/app-error.js";
import webpush from 'web-push';
import { prisma } from '../db/prisma.js';
import { notificationScope, notificationUrlForUser } from './notification.service.js';
import { permissionContext } from './permission-context.js';

let working = false;
export function startPushDelivery() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return () => {};
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:soporte@vianko.com.mx', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  async function tick() {
    if (working) return;
    working = true;
    try {
      const events = await prisma.activityLog.findMany({ where: { pushProcessedAt: null, pushNextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 10 });
      for (const event of events) {
        const claim = await prisma.activityLog.updateMany({ where: { id: event.id, pushProcessedAt: null, pushNextAttemptAt: event.pushNextAttemptAt },
          data: { pushAttempts: { increment: 1 }, pushNextAttemptAt: new Date(Date.now() + 900_000) } });
        if (!claim.count) continue;
        let retry = false;
        const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { not: event.actorId ?? '' }, user: { isActive: true, memberships: { some: { workspaceId: event.workspaceId, status: 'ACTIVE' } } } } });
        const authorized = new Map<string, boolean>();
        for (const subscription of subscriptions) {
          if (!authorized.has(subscription.userId)) {
            try {
              const scope = await permissionContext.run(new Map(), () => notificationScope(subscription.userId, event.workspaceId));
              authorized.set(subscription.userId, Boolean(await prisma.activityLog.count({ where: { AND: [scope, { id: event.id }] } })));
            } catch (error) { authorized.set(subscription.userId, false); if (!(error instanceof AppError && error.statusCode < 500)) retry = true; }
          }
          if (!authorized.get(subscription.userId)) continue;
          try {
            await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
              JSON.stringify({ id: event.id, title: 'Vianko Day', body: 'Tienes una nueva notificación. Toca para consultar.', url: await notificationUrlForUser(event, subscription.userId) }),
              { TTL: 86400, timeout: 8000 });
          } catch (error) {
            const statusCode = typeof error === 'object' && error && 'statusCode' in error ? error.statusCode : undefined;
            if (statusCode === 404 || statusCode === 410) await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
            else retry = true;
          }
        }
        const exhausted = event.pushAttempts >= 9 || Date.now() - event.createdAt.getTime() > 7 * 86400000;
        await prisma.activityLog.update({ where: { id: event.id }, data: {
          pushProcessedAt: !retry || exhausted ? new Date() : null,
          pushNextAttemptAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** event.pushAttempts)),
          pushLastError: retry ? exhausted ? 'DELIVERY_RETRIES_EXHAUSTED' : 'DELIVERY_RETRY_PENDING' : null
        } });
      }
    } catch { console.error('Push delivery temporarily unavailable; the persisted inbox remains the source of truth.'); }
    finally { working = false; }
  }
  const timer = setInterval(() => void tick(), 5000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
