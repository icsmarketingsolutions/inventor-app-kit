# Aplicación de escritorio en Windows

La app sigue siendo Vite + React: el modo escritorio no crea una copia ni una
base de datos aparte. Instala dos accesos directos que llaman el repo local y
preparan sus servicios antes de abrir una ventana independiente.

## Instalar

Con Docker Desktop, Node.js 24 y PowerShell 7 instalados:

```powershell
npm ci
npm run desktop:install
```

Queda un acceso directo en el Escritorio y otro en el menú Inicio. Ambos apuntan
al puente `scripts/desktop/start-app.vbs`; no contienen contraseñas ni llaves.

## Qué pasa al abrir

1. Comprueba Docker y abre Docker Desktop si todavía no responde.
2. Inicia el stack Supabase de esta app si está detenido.
3. Acepta únicamente la URL HTTP local y la llave publicable devuelta por la CLI.
4. Inicia Vite en `http://127.0.0.1:5173` y comprueba la identidad de la app.
5. Abre Chrome o Edge en modo aplicación, o enfoca la ventana existente.

La primera apertura puede tardar mientras Docker descarga o prepara imágenes.
No cierres Docker durante ese proceso. Si el puerto 5173 pertenece a otra app,
el lanzador se detiene sin abrir el sitio equivocado.
Cada repo recibe un `project_id` derivado de su slug; sus contenedores y datos no
se comparten con otras apps generadas. La sesión web y el perfil Chromium también
quedan aislados dentro de `.desktop/`.

## Operar y diagnosticar

```powershell
npm run desktop:start
npm run desktop:status
npm run desktop:stop
npm run desktop:uninstall
```

- `desktop:start` hace lo mismo que el acceso directo.
- `desktop:status` informa únicamente `listo` o `detenido`; no imprime llaves.
- `desktop:stop` cierra la ventana, detiene Vite y este stack Supabase, conserva
  los datos y deja Docker Desktop abierto para no interrumpir otras apps.
- `desktop:uninstall` elimina solo los dos accesos directos validados. No borra
  el código ni la base local.

Los diagnósticos quedan en `.desktop/`, una carpeta ignorada por Git. La salida
de Supabase se redacta antes de entrar al log. No compartas esa carpeta sin
revisarla, aunque su diseño evita guardar credenciales.

## Instalar como PWA desde el navegador

La app incluye `manifest.webmanifest`, icono y service worker. En `localhost` o
en un dominio HTTPS compatible, Chrome o Edge puede mostrar **Instalar
aplicación** en su menú. Esa instalación del navegador y los accesos directos
locales son complementarios: para desarrollo local, el lanzador sigue siendo el
responsable de encender Docker, Supabase y Vite.

## Límites deliberados

- Solo hay soporte automatizado para Windows en esta versión.
- Solo una app que use el puerto 5173 puede estar activa a la vez. Detené la
  anterior con `npm run desktop:stop` antes de abrir otra.
- El acceso directo nunca conecta Supabase remoto, despliega, cambia DNS ni
  ejecuta migraciones en producción.
