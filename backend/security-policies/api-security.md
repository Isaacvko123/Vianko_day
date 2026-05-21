# Politica de seguridad API

## Controles actuales

- Helmet para headers de seguridad.
- `x-powered-by` deshabilitado.
- CORS con allowlist.
- Rate limit global y rate limit mas estricto en auth.
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
