# Gates de produccion

No desplegar si falla cualquiera de estos puntos:

1. Node en version LTS soportada.
2. Dependencias instaladas con lockfile.
3. 0 vulnerabilidades critical conocidas.
4. 0 secretos en repositorio o logs.
5. 100% rutas privadas con autenticacion.
6. 100% operaciones sensibles con autorizacion por objeto.
7. 100% input validado por schema.
8. CORS sin wildcard cuando haya credenciales.
9. TLS obligatorio en gateway/proxy.
10. Errores sin stack trace para clientes.
11. Comentarios sensibles cifrados en reposo.
12. Passwords con Argon2id.
13. Refresh tokens rotados y revocables.
14. Backups cifrados.
15. Restauracion de backup probada.
16. Rollback probado.
17. Threat model de rutas criticas.
18. ADR de autenticacion, autorizacion, cifrado y auditoria.
