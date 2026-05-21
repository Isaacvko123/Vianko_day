# Politica de proteccion de datos

## Datos sensibles

- Passwords: Argon2id.
- Refresh tokens: hash HMAC-SHA256 con `TOKEN_HASH_SECRET`, nunca token crudo.
- Invitation tokens: hash HMAC-SHA256 con `TOKEN_HASH_SECRET`, nunca token crudo.
- Comentarios: AES-256-GCM en base de datos.
- IP en sesiones: hash HMAC-SHA256 para correlacion sin guardar IP plana.

## Comentarios cifrados

La tabla `Comment` no tiene columna `body` en texto plano. Usa:

- `bodyCiphertext`
- `bodyNonce`
- `bodyAuthTag`

El backend descifra solamente cuando:

1. El usuario esta autenticado.
2. Tiene acceso a la tarea.
3. El comentario no es interno o el usuario es interno.

## Llaves

`COMMENT_ENCRYPTION_KEY` debe ser distinta por ambiente y generarse asi:

```bash
openssl rand -base64 32
```

Rotacion recomendada: cada 90 dias o inmediatamente despues de incidente.

La rotacion real requiere versionado de llaves; para el MVP queda documentado como pendiente antes de produccion regulada.
