# Reglas de negocio de Vianko Day

Versión: 10 de septiembre de 2026. La autoridad ejecutable está en `src/models/business-policy.ts`, `permissions.ts` y `access-control.service.ts`. La interfaz recibe capacidades por proyecto y tarea; ocultar un botón nunca sustituye la comprobación del servidor.

## Organización

- **Empresa:** frontera de datos, membresías y permisos. Una persona puede pertenecer a varias empresas; cada acceso se comprueba por separado.
- **Área:** equipo de origen de una persona y equipo responsable de un proyecto.
- **Localidad:** sede dentro de un área. Una persona puede tener varias localidades autorizadas. Sin localidades específicas, el alcance comprende su área; no todas las empresas.
- **Puesto:** función organizativa. La marca de gerencia del puesto no concede permisos.
- **Rol:** acciones permitidas. La membresía debe estar activa, al igual que la cuenta y la empresa.
- **Proyecto:** contexto de colaboración. Un proyecto privado requiere membresía explícita, salvo administración. La visibilidad compartida permite acceso a gerencia de su área/localidades, no a cualquier empleado.
- **Tablero → tarea → subtarea:** cada tablero tiene sus propios estados. Solo se permite un nivel de subtareas, dentro del mismo tablero. Una tarea no adquiere visibilidad simplemente por aparecer en una URL.

## Roles del sistema

| Rol | Alcance | Trabajo | Personas y apoyo |
| --- | --- | --- | --- |
| Admin / Admin TI | Todos los proyectos de su empresa, incluidos privados | Crear, editar, asignar, cerrar, reabrir; pueden corregir una tarea cerrada | Administrar roles, estructura y miembros; aprobar apoyo |
| Gerente | Proyectos compartidos de su área/localidades y aquellos donde es miembro | Crear, editar, asignar, revisar, cerrar y reabrir | Invitar/aprobar personas de su ámbito; administrar puestos; responder solicitudes dirigidas a su área/localidades |
| Coordinador / Lider TI | Proyectos donde participa | Crear proyectos, tareas, subtareas, editar, asignar, revisar, cerrar y reabrir | Agregar personas de la misma área al proyecto; solicitar apoyo de otras áreas |
| Developer / Colaborador | Tareas asignadas, creadas o compartidas dentro de sus proyectos | Si está asignado: avance, estados de trabajo y tiempo. Puede comentar tareas abiertas visibles | Sin administración, cierre, reapertura ni solicitudes de personal |
| Invitado externo | Tareas explícitamente relacionadas dentro de proyectos donde participa | Avance, estados de trabajo y tiempo si está asignado; comentarios públicos | Sin estructura, directorio interno, solicitudes, reportes globales ni comentarios internos |
| Cliente | Tareas explícitamente relacionadas en sus proyectos | Consulta y comentarios públicos | Sin administración ni cambios de estado |
| Solo lectura | Tareas explícitamente relacionadas en sus proyectos | Consulta | Ninguna modificación, aunque esté asignado |

El **tipo EXTERNAL** limita el acceso adicionalmente al rol. Solo admite permisos de consulta, comentario público, avance, estados de trabajo y tiempo. Una configuración externa con permisos de administración se rechaza hasta que administración la corrija. Los externos no entran en Personas ni en colaboración entre áreas.

Un rol opcional de proyecto **restringe** el rol de la empresa; nunca lo eleva. Si se omite, hereda el rol vigente de la persona. Administración conserva sus facultades de administración. Dar acceso a un proyecto no convierte a un colaborador en coordinador. Un gerente no puede conceder Admin, Gerente u otro rol superior; esos cambios corresponden a administración. No se permite elevar el propio rol cambiando la membresía.

Los nombres anteriores se conservan por compatibilidad con empresas existentes. Los permisos canónicos se resuelven desde el código para los roles de sistema, incluso antes del siguiente proceso de sincronización de catálogos.

## Tareas y transiciones

Flujo recomendado: **Por hacer → En proceso → En revisión → Terminado**. Bloqueado indica que hace falta resolver un impedimento.

- Crear: título de 2–240 caracteres, estado de trabajo, cero o más responsables activos que ya pertenezcan al proyecto. No se crea directamente como terminada/cancelada.
- Coordinar: crear/editar detalles y asignar exige permisos de coordinación en ese proyecto. Mencionar comparte seguimiento con un miembro del proyecto; no lo convierte en responsable ni concede acceso a otros proyectos.
- Ejecutar: ser responsable permite avance, tiempo y estados de trabajo únicamente si el rol lo permite. Estar mencionado permite consulta y, cuando el rol lo permite, comentarios; no ejecución.
- Cerrar: requiere `task.complete` y todas las subtareas terminadas. El servidor admite cierre desde un estado de trabajo a quien tiene esta facultad; la revisión previa es el flujo recomendado, no una transición obligatoria oculta.
- Reabrir: requiere `task.reopen`. Limpia la fecha de cierre. Coordinación debe reabrir antes de editar una tarea terminada; administración puede corregirla directamente.
- Una tarea principal terminada bloquea mutaciones de sus subtareas. No se crean subtareas de subtareas.
- El estado determina si está terminada; 100% de avance por sí solo no cierra la tarea. Las terminadas permanecen 24 horas en el tablero y se consultan en Terminadas.
- El fin no puede preceder al inicio. Las fechas de planificación son fechas de calendario, no horas locales. Vaciar fecha o estimación usa `clearFields`; omitir un campo lo conserva.
- La edición usa `expectedUpdatedAt`. Un cambio concurrente devuelve 409 y conserva el formulario para revisión; no sobreescribe silenciosamente los cambios ajenos.
- Cambios principales, asignaciones, comentarios y tiempo se guardan con su evento de auditoría en una transacción. El cierre y la creación de subtareas usan transacciones serializables para detectar conflictos.

## Apoyo entre áreas

1. Coordinación abre **Pedir apoyo** desde el proyecto: área destino distinta del área del proyecto, cantidad de 1–25, localidad/puesto opcionales y contexto.
2. Solo administración o gerencia autorizada del área/localidad destino responde. El solicitante puede seguir la solicitud, no aprobarse personal ajeno.
3. Quien responde selecciona personas **internas activas**, del área, localidad y puesto solicitados. Puede aprobar entre una y la cantidad solicitada; rechazo requiere motivo.
4. Una aprobación agrega a las personas al proyecto conservando su área y rol de origen. El rol opcional solicitado nunca eleva permisos. Después se asignan tareas concretas en el tablero.
5. Cada solicitud se resuelve una vez: dos respuestas simultáneas no pueden agregar personal dos veces. Se rechaza responder sobre un proyecto archivado.
6. Solicitante y gerencia autorizada consultan las solicitudes. Las personas aprobadas reciben aviso que abre el proyecto; no obtienen acceso al módulo de gerencia.

## Notificaciones y tiempo real

La bandeja se deriva del registro de actividad persistente y aplica el mismo ámbito de acceso que las tareas. `NotificationRead` conserva la lectura por persona/aviso y la sincroniza entre dispositivos. El contador corresponde a la empresa activa y excluye la actividad realizada por uno mismo.

Cada evento Socket.IO se autoriza de nuevo para cada destinatario. Los eventos llegan también mientras se está en otra pantalla del mismo espacio. Las actualizaciones se agrupan durante 220 ms para evitar recargar repetidamente los mismos datos. Una reconexión consulta nuevamente la bandeja y el contexto activo; una comprobación periódica de bandeja cada 60 segundos ofrece recuperación adicional. La interfaz muestra En vivo/Conectando/Reconectando.

Web Push es complementario: las suscripciones quedan ligadas a la cuenta, se eliminan al cerrar sesión en ese dispositivo y los endpoints expirados se retiran. La cola persistente reintenta fallos con espera creciente, hasta diez intentos o siete días. Un mismo identificador agrupa duplicados en el sistema operativo. Una entrega fallida no borra el aviso de la bandeja. El sistema operativo, permisos o conectividad pueden demorar o impedir un push; no se promete entrega absoluta.

Las sesiones se renuevan con exclusión entre pestañas mediante Web Locks. La rotación del token es transaccional. Cambiar o cerrar sesión se propaga a otras pestañas; los sockets expiran con su token. Una invitación a una cuenta existente exige su contraseña y no puede rehabilitar una membresía suspendida ni reemplazar un acceso ya activo.

## Chat temporal del proyecto

- Cada proyecto admite un chat activo. Coordinación o administración con acceso al proyecto lo abre por siete días; abrirlo de nuevo mientras está activo devuelve el mismo chat y no extiende su vigencia.
- Participan personas internas activas con acceso al proyecto y permiso de consulta de tareas. El permiso para comentar permite enviar mensajes y archivos. Personas externas no pueden consultar, descargar ni recibir eventos del chat.
- Los mensajes admiten texto y hasta tres archivos de 10 MB cada uno. El chat dispone de 100 MB. Las descargas requieren sesión y autorización vigente; el contenido se guarda cifrado y no se incluye en notificaciones.
- Los envíos tienen un identificador estable para reintentar sin duplicar. La carga de archivos y el envío comprueban la vigencia del chat dentro de una transacción con bloqueo. Un archivo pendiente solo puede adjuntarlo quien lo cargó en ese mismo chat.
- Cada autor puede eliminar sus mensajes y archivos; coordinación puede moderar y cerrar el chat completo. Eliminar un mensaje destruye su contenido y adjuntos y deja una indicación de eliminación. Cerrar un chat destruye todos sus mensajes y archivos.
- El acceso termina al vencer los siete días. Una limpieza automática cada minuto elimina los datos vencidos; los archivos que quedan sin enviar se limpian después de una hora. Los registros de auditoría conservan acciones y actores, sin contenido de mensajes ni archivos.
- Socket.IO informa de nuevas conversaciones, mensajes y eliminaciones. La interfaz recupera el estado al reconectar y conserva el borrador si un envío falla. La lectura en el chat actualiza la bandeja del usuario entre dispositivos.
- Los acuerdos que deben conservarse se registran como tareas antes del vencimiento. El chat no sustituye el historial permanente de trabajo.
