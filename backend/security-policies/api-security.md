# Politica de seguridad API

## Controles actuales

- Helmet para headers de seguridad.
- `x-powered-by` deshabilitado.
- CORS con allowlist.
- Rate limit solo en `/api/v1`: identidad JWT verificada por usuario, con 1200 consultas/minuto y 300 escrituras/minuto en contadores separados. Sin token válido: 600 solicitudes/minuto por IP.
- Login: solo fallos de credenciales/validación, hasta 15 por correo + IP en 15 minutos y 100 por IP en 5 minutos. Sesiones válidas no consumen intentos fallidos.
- Refresh e invitaciones usan contadores independientes: 200 y 100 fallos por IP en 5 minutos, respectivamente. Respuestas 429 de otro limitador y fallos del servidor no consumen esos intentos.
- Nginx local es el proxy de confianza (`loopback`). `/health`, archivos de la PWA y conexiones Socket.IO no consumen la cuota HTTP de la API. Socket.IO conserva su protección propia de cambios de sala.
- Un 429 real incluye JSON en español y `Retry-After`; el cliente evita reintentos inmediatos y respeta la espera al renovar la sesión.
- Body limit de 1 MB.
- `hpp` contra parameter pollution.
- Request id por respuesta.
- Error handler centralizado.
- Validacion Zod en rutas.
- JWT access token con algoritmo allowlist `HS256`.
- Refresh token con rotacion y deteccion de reuse.

## Reglas para nuevas rutas

Toda ruta nueva debe declarar:

- Si es publica o privada.
- Esquema Zod de `params`, `query` y `body`.
- Permiso requerido.
- Recurso principal que autoriza la operacion.
- Evento de auditoria si cambia estado de negocio.

## Nunca hacer

- No aceptar `workspaceId` como unica prueba de acceso.
- No confiar en IDs del cliente sin consultar pertenencia.
- No devolver modelos Prisma completos si tienen campos sensibles.
- No meter `res.redirect()` con URL controlada por usuario sin allowlist.
- No guardar tokens, passwords o comentarios descifrados en logs.
