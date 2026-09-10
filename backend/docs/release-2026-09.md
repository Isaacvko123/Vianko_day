# Entrega y operación

## Cambios

Tablero consultable por texto, persona, prioridad, vencimiento y estado; vistas Kanban/lista coherentes; creación y asignación en un formulario; edición desde el detalle; capacidades de servidor para cada acción; navegación móvil inferior; solicitudes de apoyo con autorización del área destino; bandeja persistente; PWA y cola Web Push.

Las reglas y la matriz completa están en [domain-rules.md](domain-rules.md).

## Preparar una instalación existente

1. Respalda la base de datos antes del despliegue habitual.
2. En `backend`: `npm ci`, `npm run prisma:generate`, `npm run migrate:notifications`, `npm run migrate:chat`, `npm run build`.
3. En `front`: `npm ci`, `npm run build`.
4. Configura `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` en los secretos del servidor. Genera el par una sola vez con `web-push.generateVAPIDKeys()` y consérvalo; regenerarlo invalida suscripciones. Nunca pongas la clave privada en variables VITE.
5. Reinicia el proceso del backend y sirve `front/dist` por HTTPS con rutas SPA. Mantén `/api/v1` y `/socket.io` en el mismo origen o configura CORS explícitamente. El proxy debe permitir Upgrade de WebSocket.
6. Sirve `/sw.js` y `/index.html` sin caché permanente. El manifest y ambos iconos deben ser accesibles desde la raíz.

La base de datos encontrada en este proyecto no tenía historial `_prisma_migrations`. Se aplicó únicamente la migración aditiva de notificaciones en una transacción, sin reconstruir tablas existentes. El comando `migrate:notifications` es idempotente para ese entorno: detecta la migración completa o falla ante una aplicación parcial. No usar `prisma migrate reset` ni `migrate dev` sobre esa base.

La cuenta inicial ya no tiene contraseña predeterminada en código. Una instalación nueva requiere `INITIAL_ADMIN_PASSWORD` de al menos doce caracteres. Las cuentas existentes conservan su contraseña.

## Chat de seguimiento

Disponible en Proyecto → Chat de seguimiento. Un chat activo por proyecto durante siete días, texto y hasta tres archivos de 10 MB por mensaje, con 100 MB de capacidad por chat. Autor y coordinación pueden eliminar contenido según su alcance; coordinación puede cerrar la conversación completa. La bandeja y los eventos Socket.IO abren directamente el chat correspondiente. Los acuerdos permanentes deben registrarse en tareas.

La migración `migrate:chat` agrega únicamente `ProjectChat`, `ChatMessage` y `ChatFile` con sus índices y relaciones. Se aplicó a la base local conservando sus datos. El backend debe estar activo para limpiar físicamente el contenido vencido; cada solicitud bloquea de inmediato el acceso a un chat vencido, aunque la limpieza esté pendiente. Esta entrega del chat se compiló, sin ejecutar pruebas automatizadas ni pruebas en navegador.

## Vista local y cuenta genérica

Para mostrar la versión compilada fuera de Codex: desde la raíz, `npm --prefix backend run local:start`. Deja un único proceso independiente en `http://localhost:5173`, con frontend, API y Socket.IO en el mismo origen; comprueba la conexión a la base antes de servir. El proceso continúa al cerrar la terminal y guarda su registro en `private/local-server.log`. Repetir el comando detecta si ya está activo. El acceso corresponde a esta computadora; cada navegador requiere iniciar su propia sesión.

En desarrollo separado, el backend usa 3013 y Vite 5173 con proxy a 3013. El puerto 3012 pertenece a otro proyecto; no debe configurarse como API de Vianko. Vite falla si 5173 está ocupado para evitar abrir accidentalmente otra versión en un puerto diferente.

Después de compilar ambos proyectos, desde `backend`: `npm run preview:app`. Abre `http://127.0.0.1:4173` y sirve frontend, API, sockets y service worker juntos. Esta vista es local y no cambia las cuentas iniciales mediante bootstrap.

`npm run demo:create` crea una cuenta genérica solo si no existe. Sus credenciales aleatorias se guardan en `private/acceso-demo.txt`, con permisos 600 y fuera de Git. La cuenta pertenece exclusivamente a **Vianko Demo**, tiene Admin en esa empresa y no obtiene membresía en empresas existentes. No distribuir una cuenta compartida con acceso a operaciones reales.

## PWA móvil

En Android utiliza Instalar/Agregar a pantalla de inicio. En iPhone, Safari → Compartir → Agregar a pantalla de inicio; abre la app instalada y pulsa Activar avisos. Web Push en iPhone requiere iOS 16.4 o posterior y la app en pantalla de inicio ([Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)).

Se requiere HTTPS fuera de localhost y consentimiento de notificaciones. Sin conexión se muestra una pantalla explícita; no se simulan escrituras guardadas ni se almacenan páginas privadas en la caché del service worker. Al volver la conexión, la bandeja recupera sus registros. El despliegue HTTPS y una entrega real con el teléfono bloqueado deben verificarse en el dispositivo final; la vista localhost del ordenador no equivale a esa prueba.

## Verificación

- `npm test` en backend: matriz de permisos, roles, ámbitos y planificación.
- `npm test` en front: filtros, orden, paginación, permisos de estado y limpieza de valores.
- `npm run test:integration` en backend: usa DATABASE_URL, crea una empresa temporal aislada y elimina exclusivamente esos fixtures en `finally`. Requiere instalar también las dependencias de front para el cliente Socket.IO de prueba. Incluye denegaciones por rol/área/externo, cierre con subtareas, edición concurrente, aprobación de personal, persistencia de lectura y entrega de eventos por socket.
- `npm run build` en ambos proyectos. Frontend orientado a ES2022, Chrome 110, Firefox 115, Safari 16.4 o posteriores.
- `npm audit`: las dependencias se actualizaron y ambas auditorías terminaron con cero vulnerabilidades conocidas en esta revisión. No es una garantía permanente.

Se verificó en navegador: acceso genérico, contador de avisos, abrir tarea desde aviso, crear con responsable, editar descripción/avance sin recargar y navegación móvil. No se realizó una prueba de carga de producción ni una entrega física de Web Push en iPhone/Android.

La cola push actual vive en PostgreSQL y usa exclusión al reclamar eventos. Para varias instancias de API, Socket.IO necesita un adaptador compartido; la configuración entregada usa una instancia de sockets. Monitoriza los fallos `DELIVERY_RETRIES_EXHAUSTED`, latencia de consultas y reconexiones antes de escalar.
