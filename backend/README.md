# Vianko Day Backend

Backend base para gestion de actividades tipo Monday, enfocado en:

- Workspaces.
- Usuarios internos y externos.
- Invitaciones.
- Roles y permisos por clave.
- Proyectos privados o visibles al workspace.
- Tableros y estados configurables.
- Actividades con multiples asignados.
- Comentarios cifrados con AES-256-GCM.
- Passwords con Argon2id.
- Registro real de tiempo.
- Auditoria de cambios importantes.
- Reportes iniciales.

## Requisitos

- Node local: funciona desde `20.19`.
- Produccion recomendada: Node 22 LTS o superior soportado.
- PostgreSQL.

La version sugerida para produccion queda en `.nvmrc`.

## Instalacion

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run build
npm run dev
```

`npm run dev` compila TypeScript y arranca el JS generado en `dist/src/server.js`. No usa `ts-node/esm` ni loaders experimentales.

Si vienes de una instalacion fallida con `tsx/esbuild`, elimina `node_modules` y vuelve a correr `npm install`. El `package-lock.json` actual ya no debe incluir `tsx` ni `esbuild`.

Si tu shell tiene una variable `PORT` exportada, Node la usara antes que `.env`. Puedes revisar con:

```bash
echo $PORT
```

## Variables importantes

`COMMENT_ENCRYPTION_KEY` debe ser una llave base64 de 32 bytes:

```bash
openssl rand -base64 32
```

`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TOKEN_HASH_SECRET` y `LOG_HASH_SECRET` deben ser distintos por ambiente.

## Rutas base

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/accept-invitation`
- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`
- `GET /api/v1/workspaces/:workspaceId/members`
- `POST /api/v1/workspaces/:workspaceId/invitations`
- `GET /api/v1/projects?workspaceId=...`
- `POST /api/v1/projects`
- `GET /api/v1/projects/:projectId`
- `POST /api/v1/projects/:projectId/members`
- `GET /api/v1/projects/:projectId/boards`
- `POST /api/v1/projects/:projectId/boards`
- `POST /api/v1/boards/:boardId/statuses`
- `GET /api/v1/boards/:boardId/tasks`
- `POST /api/v1/boards/:boardId/tasks`
- `PATCH /api/v1/tasks/:taskId`
- `PATCH /api/v1/tasks/:taskId/status`
- `POST /api/v1/tasks/:taskId/assignees`
- `DELETE /api/v1/tasks/:taskId/assignees/:userId`
- `GET /api/v1/tasks/:taskId/comments`
- `POST /api/v1/tasks/:taskId/comments`
- `GET /api/v1/tasks/:taskId/time-logs`
- `POST /api/v1/tasks/:taskId/time-logs`
- `GET /api/v1/reports/project/:projectId/progress`
- `GET /api/v1/reports/workspace/:workspaceId/summary`

## Nota de alcance

Archivos, PDFs e imagenes quedan omitidos en esta primera fase, como pediste. La estructura permite agregarlos despues sin romper actividades, auditoria ni permisos.

## Documentacion interna

- `docs/code-map.md`: como esta organizado el codigo.
- `docs/request-lifecycle.md`: que pasa desde HTTP hasta Prisma.
- `docs/environment.md`: variables de entorno explicadas.
- `docs/domain-rules.md`: reglas de negocio que no se deben romper.
- `security-policies/`: politicas y gates de seguridad.
