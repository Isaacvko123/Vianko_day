# Politica de auditoria e incidentes

## Eventos auditables

- `workspace.created`
- `project.created`
- `board.created`
- `task.created`
- `task.updated`
- `task.status_changed`
- `task.completed`
- `task.reopened`
- `task.assigned`
- `task.unassigned`
- `comment.created`
- `time.logged`
- `user.invited`
- `user.joined`

## Campos minimos

- `workspaceId`
- `projectId` cuando aplique
- `taskId` cuando aplique
- `actorId`
- `entityType`
- `entityId`
- `action`
- `before`
- `after`
- `createdAt`

## Runbook inicial

Robo de token:

1. Revocar sesiones del usuario.
2. Rotar secretos si hay sospecha de fuga.
3. Revisar `ActivityLog` por acciones anormales.
4. Forzar cambio de contrasena si aplica.
5. Documentar alcance y acciones.

Fuga de llave de cifrado:

1. Sacar ambiente afectado de rotacion.
2. Rotar `COMMENT_ENCRYPTION_KEY`.
3. Re-cifrar comentarios con nueva version de llave cuando exista key versioning.
4. Revisar accesos a DB, backups y logs.
5. Notificar segun contrato/legal.

Dependencia critica vulnerable:

1. Bloquear despliegues.
2. Actualizar o hacer rollback.
3. Ejecutar pruebas de regresion.
4. Registrar excepcion solo con fecha de vencimiento y owner.
