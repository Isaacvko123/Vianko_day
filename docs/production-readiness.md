# Production Readiness

Este proyecto ya tiene una base funcional, pero produccion madura exige evidencia operativa. Este documento deja el checklist minimo para que el equipo no dependa de memoria o buena suerte.

## Gates obligatorios

- Backend compila con `npm run build`.
- Frontend compila con `npm run build`.
- Backend ejecuta pruebas con `npm test`.
- Los roles base se prueban para evitar que un cambio accidental eleve permisos.
- Las ramas productivas deben pasar `.github/workflows/quality.yml` antes de merge.
- Ningun secreto debe vivir en repo, logs o respuestas HTTP.

## Permisos

La fuente de verdad de permisos vive en backend. El frontend debe consumir `workspace.member.permissions` y transformar eso en capabilities de UI desde `front/src/lib/permissions.ts`.

Regla: no decidir acceso por nombre de rol en componentes. El nombre puede cambiar; el permiso no.

## Pruebas que faltan

- Pruebas de autorizacion negativa por endpoint: usuario sin permiso, usuario externo, usuario de otra area y usuario fuera del proyecto.
- Pruebas de aislamiento multi-workspace.
- Pruebas de realtime: sala correcta, rechazo por permiso, rate limit y reconexion.
- Pruebas de regresion para tareas terminadas, reapertura, menciones, subtareas y registro de tiempo.

## Observabilidad minima

- Request ID en cada peticion y evento realtime.
- Logs sin tokens, cookies ni passwords.
- Alertas por errores 5xx, fallos de login, cambios de rol, invitaciones y rechazos de autorizacion.
- Dashboard de latencia API, errores realtime, reconexiones socket y carga de base de datos.

## Backups y despliegue

- Backups cifrados de PostgreSQL con prueba de restauracion periodica.
- Rollback documentado para backend y frontend.
- Variables de entorno por ambiente, sin valores productivos en `.env.example`.
- Node LTS soportado en runtime, CI y servidores.
