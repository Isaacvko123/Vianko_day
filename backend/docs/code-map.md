# Mapa del codigo

Este backend esta organizado por responsabilidad, no por ocurrencia.

## Carpetas principales

- `src/app.ts`: arma Express y monta middlewares/rutas.
- `src/server.ts`: abre el puerto, maneja apagado limpio y errores de servidor.
- `src/config`: variables de entorno y controles HTTP de seguridad.
- `src/routes`: declara URLs y conecta validadores/controladores.
- `src/validators`: contratos Zod para `params`, `query` y `body`.
- `src/controllers`: flujo HTTP de cada recurso.
- `src/services`: reglas reutilizables de negocio y seguridad.
- `src/utils`: helpers pequenos, sin conocimiento fuerte del dominio.
- `src/db/prisma.ts`: cliente Prisma compartido.
- `prisma/schema.prisma`: modelo de base de datos.
- `security-policies`: decisiones y gates de seguridad.

## Como leer una ruta

Ejemplo: crear una actividad.

1. `src/routes/task.routes.ts` define `POST /boards/:boardId/tasks`.
2. `validate(createTaskSchema)` valida datos de entrada.
3. `authenticate` exige JWT valido.
4. `createTask` en `src/controllers/task.controller.ts` ejecuta el flujo.
5. `assertProjectPermission` confirma acceso y permiso.
6. Prisma crea la tarea y sus asignados.
7. `ActivityLog` guarda auditoria.

## Regla de mantenimiento

Antes de agregar una ruta nueva, responde:

- Que permiso requiere.
- Que recurso autoriza la operacion.
- Que esquema Zod valida la entrada.
- Que evento de auditoria necesita.
- Que respuesta publica debe devolver.
