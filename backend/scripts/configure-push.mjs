import { readFile, writeFile, copyFile, mkdir, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import webpush from 'web-push';

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const appUrl = new URL(process.argv[2] || 'https://vianko-day.vianko.cloud');
if (appUrl.protocol !== 'https:') throw new Error('La dirección publicada debe usar HTTPS.');
let source = await readFile(envPath, 'utf8');
const current = dotenv.parse(source);
let publicKey = current.VAPID_PUBLIC_KEY;
let privateKey = current.VAPID_PRIVATE_KEY;
if (!publicKey && !privateKey) ({ publicKey, privateKey } = webpush.generateVAPIDKeys());
const curve = crypto.createECDH('prime256v1');
try {
  curve.setPrivateKey(Buffer.from(privateKey || '', 'base64url'));
  if (!curve.getPublicKey().equals(Buffer.from(publicKey || '', 'base64url'))) throw new Error();
} catch { throw new Error('El par VAPID existente está incompleto o no coincide. No se modificó ni regeneró.'); }

const values = {
  VAPID_PUBLIC_KEY: publicKey,
  VAPID_PRIVATE_KEY: privateKey,
  VAPID_SUBJECT: current.VAPID_SUBJECT || 'mailto:soporte@vianko.com.mx',
  PUBLIC_APP_URL: appUrl.origin,
  CORS_ORIGINS: [...new Set([...(current.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean), appUrl.origin])].join(',')
};
webpush.setVapidDetails(values.VAPID_SUBJECT, publicKey, privateKey);
const backupDir = path.join(os.homedir(), '.vianko-day-backups');
await mkdir(backupDir, { recursive: true, mode: 0o700 });
const backup = path.join(backupDir, `env-before-push-${Date.now()}`);
await copyFile(envPath, backup);
await chmod(backup, 0o600);
for (const [key, value] of Object.entries(values)) {
  const line = `${key}=${JSON.stringify(value)}`;
  const expression = new RegExp(`^${key}=.*$`, 'gm');
  source = expression.test(source) ? source.replace(expression, () => line) : `${source.trimEnd()}\n${line}\n`;
}
await writeFile(envPath, source, { mode: 0o600 });
await chmod(envPath, 0o600);
console.log(`Avisos configurados para ${appUrl.origin}. Claves privadas conservadas en el servidor.`);
console.log('Reinicia únicamente vianko-day-backend para aplicar la configuración.');
