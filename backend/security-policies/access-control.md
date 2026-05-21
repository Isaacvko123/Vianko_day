# Politica de acceso

## Principios

- Default deny: si no hay permiso explicito, se bloquea.
- Un usuario solo entra a workspaces donde tenga `WorkspaceMember.status = ACTIVE`.
- Un externo solo entra a proyectos donde tenga `ProjectMember`.
- Las rutas no deciden solas: los servicios vuelven a verificar permisos por recurso.
- Los comentarios internos no se entregan a usuarios externos.

## Modelo aplicado

- `WorkspaceMember`: pertenencia a empresa y rol base.
- `ProjectMember`: acceso fino por proyecto.
- `Area`: limite operativo para gerentes, proyectos y aprobaciones.
- `Position`: puesto dentro del area; no reemplaza al rol de seguridad.
- `RolePermission`: permisos por clave, no booleanos fijos.

## Permisos base

- `workspace.manage`
- `workspace.invite_users`
- `workspace.view_reports`
- `area.manage`
- `area.approve_members`
- `position.manage`
- `member.manage`
- `project.create`
- `project.update`
- `project.delete`
- `project.view_all`
- `project.manage_members`
- `board.create`
- `board.update`
- `task.create`
- `task.update`
- `task.update_progress`
- `task.delete`
- `task.assign`
- `task.change_status`
- `task.comment`
- `task.log_time`
- `task.view_all`
- `report.view_project`
- `report.view_workspace`

## Pruebas obligatorias

- Usuario de workspace A no puede leer workspace B.
- Externo sin `ProjectMember` no puede ver proyecto privado ni workspace.
- Usuario con solo lectura no puede crear, asignar ni mover tareas.
- Developer no puede crear tareas ni editar campos base; solo progreso, estado, comentarios y tiempo.
- Gerente sin permiso global solo aprueba usuarios y ve proyectos de su area.
- Externo no puede crear comentarios internos.
- Usuario suspendido no puede consumir rutas privadas.
