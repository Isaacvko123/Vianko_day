# Vianko Day Front

Frontend React + Vite + TypeScript para la gestion de actividades.

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Variables

Crea `.env` desde `.env.example`:

```txt
VITE_API_URL=/api/v1
API_PROXY_TARGET=http://127.0.0.1:3012
```

En desarrollo, el navegador llama `/api/v1` y Vite lo reenvia a `API_PROXY_TARGET`. Si el backend esta en otra maquina, solo cambia `API_PROXY_TARGET`, por ejemplo `http://192.168.1.50:3012`.

En produccion, `VITE_API_URL` debe quedarse como ruta relativa detras de HTTPS y reverse proxy/API gateway; no uses una URL absoluta `http://` en el navegador.

## Flujo principal

- Login / registro.
- Seleccion de workspace.
- Layout con sidebar.
- Proyectos.
- Tablero kanban/lista.
- Detalle de actividad.
- Miembros e invitaciones.
- Reportes basicos.

## Reglas de codigo

- Sin SCSS: CSS normal con variables.
- Tipos explicitos en `src`; nada de tipos dinamicos flojos.
- Usar `undefined` para ausencia de dato.
- Comentarios solo donde explican reglas de negocio o integracion.
