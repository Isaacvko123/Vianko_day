# Ciclo de una request

Flujo normal de una request privada:

```txt
Cliente
  -> Express app
  -> requestContext
  -> Helmet / CORS / rate limit / hpp
  -> body parser
  -> route
  -> authenticate
  -> validate(schema)
  -> controller
  -> service de autorizacion
  -> Prisma
  -> ActivityLog si cambia negocio
  -> response JSON
```

## Autenticacion

`authenticate` lee `Authorization: Bearer <token>`.

Si el token es valido:

- Verifica que el usuario exista.
- Verifica que este activo.
- Guarda `req.auth.userId`.

Si falla, devuelve `401`.

## Autorizacion

El login no alcanza. Cada accion privada debe validar recurso:

- Workspace: `assertWorkspaceMember`.
- Permiso de workspace: `assertWorkspacePermission`.
- Proyecto: `assertProjectAccess`.
- Permiso de proyecto: `assertProjectPermission`.
- Tarea: `assertTaskPermission`.

Esto evita que un usuario cambie IDs en la URL para leer datos de otra empresa.

## Validacion

Zod valida antes del controlador.

Los controladores no deben aceptar campos libres ni confiar en datos no declarados.

## Auditoria

Si una accion cambia estado de negocio, crea `ActivityLog`.

Ejemplos:

- Crear tarea.
- Mover tarea de estado.
- Asignar usuario.
- Crear comentario.
- Registrar tiempo.
- Invitar usuario.
