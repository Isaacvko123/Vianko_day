import 'dotenv/config';
import { spawn } from 'node:child_process';
import { access, mkdir, open, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import net from 'node:net';

const port = 5173;
const url = `http://127.0.0.1:${port}`;
const directory = fileURLToPath(new URL('../', import.meta.url));
const privateDirectory = fileURLToPath(new URL('../../private/', import.meta.url));

async function isRunning() {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    const body = await response.json();
    return response.ok && body.service === 'vianko-day-backend' && body.ok === true;
  } catch { return false; }
}

if (await isRunning()) {
  console.log('Vianko Day ya está activo en http://localhost:5173');
  process.exit(0);
}

await access(new URL('../../front/dist/index.html', import.meta.url));
await access(new URL('../dist/src/app.js', import.meta.url));
// Fail on an occupied port; never close an unrelated process implicitly.
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', () => reject(new Error('El puerto 5173 está ocupado. Cierra su servidor antes de iniciar Vianko.')));
  probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});

await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
const log = await open(`${privateDirectory}/local-server.log`, 'a', 0o600);
let child;
try {
  child = spawn(process.execPath, ['scripts/preview.mjs'], {
    cwd: directory,
    env: { ...process.env, PREVIEW_PORT: String(port) },
    detached: true,
    stdio: ['ignore', log.fd, log.fd]
  });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  child.unref();
} finally { await log.close(); }

for (let attempt = 0; attempt < 30; attempt++) {
  if (await isRunning()) {
    await writeFile(`${privateDirectory}/local-server.json`, JSON.stringify({ pid: child.pid, port, startedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    console.log('Vianko Day activo: http://localhost:5173');
    console.log('Web, API y sockets juntos. El servidor sigue activo al cerrar esta terminal.');
    process.exit(0);
  }
  if (child.exitCode !== null || child.signalCode !== null) break;
  await delay(300);
}
try { process.kill(child.pid, 'SIGTERM'); } catch {}
throw new Error(`No se pudo iniciar Vianko. Consulta ${privateDirectory}/local-server.log`);
