# Politicas de seguridad del backend

Este backend nace con una regla simple: seguridad verificable antes que promesas bonitas.

Objetivo operativo:

- 100% de rutas privadas con autenticacion declarada.
- 100% de operaciones sobre recursos con autorizacion por workspace/proyecto/tarea.
- 100% de entradas validadas por esquema.
- 0 contrasenas en texto plano.
- 0 comentarios sensibles guardados en texto plano.
- 0 stack traces expuestos al cliente.
- Auditoria para cambios importantes de negocio.

Estandares guia:

- OWASP ASVS nivel alto como lista de verificacion.
- OWASP API Security Top 10 para riesgos de API.
- NIST SSDF para ciclo de desarrollo seguro.
- NIST 800-53 como catalogo de controles cuando el proyecto escale.

## Cifrado y hashing

Las contrasenas usan Argon2id. Una contrasena no debe poder descifrarse.

Los comentarios usan AES-256-GCM. Esto si es cifrado reversible: la app guarda ciphertext, nonce y auth tag, y solo descifra despues de autenticar y autorizar al usuario.

No confundas ambos conceptos:

- Hash: no reversible. Ideal para contrasenas y tokens.
- Cifrado: reversible con llave. Ideal para texto que la app debe mostrar despues.

## Gates minimos antes de produccion

- Migraciones revisadas.
- `npm audit --audit-level=high` sin findings high/critical aceptados.
- Variables de entorno reales, no valores dev.
- `COMMENT_ENCRYPTION_KEY` generada con `openssl rand -base64 32`.
- `TOKEN_HASH_SECRET` distinto a los secretos JWT.
- TLS obligatorio en el proxy/gateway.
- Logs sin tokens, passwords, cookies ni comentarios descifrados.
- Backups cifrados y restauracion probada.
