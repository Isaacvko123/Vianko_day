import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
try {
  const columns = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='ActivityLog' AND column_name IN ('pushProcessedAt','pushNextAttemptAt','pushAttempts','pushLastError')`;
  const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('NotificationRead','PushSubscription')`;
  if (columns.length === 4 && tables.length === 2) console.log('La migración de notificaciones ya está aplicada.');
  else if (columns.length || tables.length) throw new Error('Hay una migración parcial. Revisa el esquema antes de continuar; no se modificó nada.');
  else {
    const sql = await readFile(new URL('../prisma/migrations/20260910120000_notification_inbox/migration.sql', import.meta.url), 'utf8');
    await prisma.$transaction(async tx => { for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement); }, { timeout: 30000 });
    console.log('Migración aditiva aplicada en una transacción.');
  }
} finally { await prisma.$disconnect(); }
