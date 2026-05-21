# Variables de entorno

Archivo local: `.env`.

Ejemplo publico: `.env.example`.

## Servidor

- `NODE_ENV`: `development`, `test` o `production`.
- `HOST`: interfaz donde escucha el servidor. Local recomendado: `127.0.0.1`.
- `PORT`: puerto HTTP.
- `DATABASE_URL`: conexion PostgreSQL usada por Prisma.

## Bootstrap inicial

Estas variables crean o actualizan la base operativa al levantar el backend:

- `INITIAL_WORKSPACE_NAME`: nombre visible de la empresa inicial.
- `INITIAL_WORKSPACE_SLUG`: slug del workspace inicial.
- `INITIAL_ADMIN_NAME`: nombre del primer administrador.
- `INITIAL_ADMIN_EMAIL`: correo del primer administrador.
- `INITIAL_ADMIN_PASSWORD`: password inicial si el usuario aun no existe.
- `INITIAL_DEFAULT_AREA_NAME`: area inicial, por default `TI`.

El bootstrap no sobrescribe la contrasena si el usuario ya existe con password configurado.

## JWT y sesiones

- `JWT_ACCESS_SECRET`: firma access tokens.
- `JWT_REFRESH_SECRET`: reservado para refresh/session policy.
- `TOKEN_HASH_SECRET`: HMAC para refresh tokens e invitaciones.
- `JWT_ISSUER`: emisor esperado en access tokens.
- `ACCESS_TOKEN_TTL_SECONDS`: vida del access token. Recomendado: 5-15 min.
- `REFRESH_TOKEN_TTL_DAYS`: vida maxima del refresh token.

Importante: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` y `TOKEN_HASH_SECRET` deben ser distintos.

## CORS

- `CORS_ORIGINS`: lista separada por comas.
- En desarrollo puede usar `http://localhost` o `http://127.0.0.1`.
- En produccion no expongas el backend directo al navegador por HTTP. Sirve el frontend y `/api/v1` bajo el mismo dominio HTTPS mediante reverse proxy o API gateway.

Ejemplo:

```txt
CORS_ORIGINS="http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173"
```

## Cifrado

- `COMMENT_ENCRYPTION_KEY`: llave AES-256-GCM en base64.

Generar:

```bash
openssl rand -base64 32
```

Los comentarios se guardan cifrados. Las contrasenas no se cifran: se hashean con Argon2id.

## Logs

- `LOG_HASH_SECRET`: HMAC para guardar huellas no reversibles, por ejemplo IP hash.

Nunca loguear:

- Passwords.
- Tokens.
- Cookies.
- Comentarios descifrados.
