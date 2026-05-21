# Reglas de dominio

## Workspace

Una empresa vive como `Workspace`.

Un usuario no pertenece directo a una empresa: pertenece mediante `WorkspaceMember`.

Esto permite que el mismo usuario este en varias empresas con roles distintos.

Al arrancar el backend se asegura el workspace inicial `vianko`, el area `TI`, los puestos base y el usuario
`isaac.serrano@vianko.com.mx` como `Admin`.

## Areas, puestos y aprobacion

`Area` agrupa personas y proyectos. `Position` describe el puesto operativo dentro de un area.

Reglas:

- Un registro publico entra como `WorkspaceMember.status = PENDING_APPROVAL`.
- Un gerente solo aprueba miembros de su propia area.
- `Admin` y `Admin TI` pueden gestionar areas, puestos y miembros del workspace.
- `Lider TI` puede gestionar soporte, usuarios y puestos, pero no crea proyectos.
- `Developer` solo actualiza progreso, estado, comentarios y tiempo; no crea tareas.
- `Gerente` crea proyectos, actividades y aprueba personal de su area.
- La API omite campos vacios en JSON para evitar contratos llenos de valores nulos.

## Proyecto

`ProjectMember` decide quien entra a un proyecto.

Reglas:

- Interno puede ver proyectos `WORKSPACE` de su misma area.
- Proyecto `PRIVATE` requiere `ProjectMember`.
- Externo siempre requiere `ProjectMember`.
- `project.view_all` permite ver todos los proyectos del workspace.

## Tarea

Una tarea pertenece a:

- Workspace.
- Proyecto.
- Board.
- Estado.

Una tarea puede tener varios asignados mediante `TaskAssignee`.

## Estado terminado

Una tarea se considera terminada solo si su `BoardStatus.countsAsDone = true`.

Cuando una tarea entra a estado terminado:

- `completedAt = now()`.

Cuando sale de estado terminado:

- se limpia `completedAt`.

Los reportes deben usar `completedAt`, no `updatedAt`.

## Tiempo real

La estimacion vive en `Task.estimateMinutes`.

El tiempo real viene de sumar `TimeLog.minutes`.

No guardar un solo campo `actualMinutes` como fuente de verdad al inicio.

## Comentarios internos

`Comment.isInternal = true` solo es visible para usuarios internos.

Externos no pueden crear comentarios internos.
