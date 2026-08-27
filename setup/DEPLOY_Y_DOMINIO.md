# Publicar una app y conectar un dominio

Usá esta guía únicamente cuando la aplicación ya funcione localmente y sus
pruebas estén verdes. Publicar no forma parte del primer arranque del kit.

El starter `v0.1.0` es apto para prototipo o beta privada. No abras registro a
público hasta implementar recuperación de contraseña, SMTP, confirmación de
correo y protecciones contra abuso, y probarlas en el dominio final.

Todos los nombres entre `<...>` son placeholders. Reemplazalos en tu computadora;
no escribas valores reales dentro de esta guía.

## Puertas antes de publicar

No continúes hasta confirmar:

- `npm run lint`, `npm test` y `npm run build` terminan sin errores ni warnings;
- el flujo principal fue probado en el navegador con datos de prueba;
- no hay `.env`, tokens, contraseñas ni claves privadas en Git;
- la app tiene un repo propio, separado de `inventor-app-kit`;
- sabés cuál es DEV y cuál será PROD.

## 1. Guardá el proyecto en GitHub

Creá un repositorio **privado** desde GitHub o con GitHub CLI. Un ejemplo:

```powershell
Set-Location '<RUTA_DE_LA_APP>'
git status
git add .
git commit -m "chore: preparar primera publicación"
gh repo create '<NOMBRE_DEL_REPO>' --private --source . --remote origin --push
```

Antes de `git add .`, revisá `git status`. Si aparece `.env`, detenete y corregí
`.gitignore`; no lo commitees aunque el repositorio sea privado.

Protegé GitHub con 2FA y mantené la rama `main` como fuente del despliegue.

## 2. Separá Supabase DEV y PROD

El proyecto DEV conserva datos falsos y el MCP de desarrollo. Para producción:

1. Creá un proyecto Supabase distinto con nombre terminado en `PROD`.
2. Guardá su contraseña en un gestor de contraseñas.
3. Verificá primero la reconstrucción local completa y pgTAP con Docker.
4. Revisá que todas las tablas expuestas tengan RLS y políticas allow/deny.
5. No conectes el MCP de escritura a PROD. Si alguna auditoría exige acceso,
   creá una entrada separada con `project_ref` explícito y `read_only=true`.

Nunca uses producción para sustituir una prueba local fallida.

### Runbook explícito de migraciones PROD

Los comandos siguientes cambian infraestructura remota. Ejecutalos solo después
de una aprobación que nombre exactamente `<PROJECT_REF_PROD>`:

```powershell
npx supabase link --project-ref '<PROJECT_REF_PROD>'
npx supabase db push --dry-run
# Revisá línea por línea el SQL/migraciones que muestra el dry-run.
npx supabase db push
npx supabase migration list
```

La lista final debe mostrar la misma cadena local y remota. No uses el editor SQL
del dashboard para “completar” diferencias: corregí una migración reproducible en
el repo, validala de cero en Docker y repetí el runbook con nueva aprobación.

## 3. Creá el sitio en Cloudflare Pages

1. Creá o abrí una cuenta en
   [Cloudflare](https://dash.cloudflare.com/).
2. Entrá a `Workers & Pages` y elegí crear una aplicación de Pages conectada a
   Git.
3. Autorizá solo el repositorio de la app, no todos tus repositorios si no es
   necesario.
4. Elegí la rama `main`.
5. Usá la configuración del proyecto. Para el starter habitual:
   - comando de build: `npm run build`;
   - carpeta de salida: `dist`;
   - versión de Node: `24`.
6. Guardá variables siguiendo `.env.example`. Los valores se ingresan en el
   panel de Cloudflare, nunca en Git ni en un prompt.

Las variables públicas del frontend pueden terminar dentro del bundle. Nunca
uses ahí una clave secreta o `service_role`. Para Supabase en el navegador usá
únicamente la URL y la clave publicable indicada por el proyecto.

Cloudflare crea primero una dirección parecida a:

```text
https://<PROYECTO_PAGES>.pages.dev
```

Probala antes de conectar el dominio.

## 4. Verificá el despliegue temporal

En la URL `pages.dev` comprobá:

- la página principal carga sin errores de consola;
- una ruta conocida funciona al abrirla directamente;
- un asset inexistente devuelve 404 y no HTML con estado 200;
- registro, login y logout usan exclusivamente PROD;
- crear, editar y borrar un dato de prueba respeta RLS;
- recargar no pierde la sesión de manera inesperada;
- el build desplegado corresponde al commit esperado.

El estado verde del panel no sustituye esta prueba en el navegador.

## 5. Agregá el dominio a Cloudflare

Si todavía no tenés dominio, compralo en un registrador de confianza. La compra
tiene costo y debe confirmarla el propietario.

Si el dominio aún no usa Cloudflare DNS:

1. agregalo como zona en Cloudflare;
2. copiá los nameservers que Cloudflare muestra;
3. reemplazá los nameservers en el registrador;
4. esperá a que Cloudflare marque la zona como activa.

Después, dentro del proyecto de Pages:

1. abrí `Custom domains`;
2. agregá `<APP.TU-DOMINIO.COM>`;
3. permití que Cloudflare cree el registro DNS recomendado;
4. esperá a que dominio y certificado TLS aparezcan como activos.

No crees registros DNS duplicados para el mismo hostname. No desactives el proxy
sin una razón documentada.

## 6. Alineá Supabase Auth con el dominio

En el proyecto Supabase PROD:

1. configurá `Site URL` como `https://<APP.TU-DOMINIO.COM>`;
2. agregá solo las rutas de redirección que la app realmente usa;
3. evitá comodines amplios;
4. actualizá proveedores OAuth externos con el callback exacto si corresponde;
5. probá registro, confirmación, recuperación y logout desde el dominio final.

Además, en Auth de Supabase PROD:

- exigí al menos 12 caracteres y activá Leaked Password Protection;
- mantené confirmación de correo y secure password change habilitados;
- configurá SMTP propio y probá entrega, expiración y uso único de enlaces;
- revisá duración/rotación de sesiones y rate limits según el riesgo de la app;
- recordá que los valores relajados de `supabase/config.toml` son solo para local.

No borres la URL temporal hasta terminar la transición y saber cómo volver atrás.

## 7. Verificación final observable

La publicación está terminada cuando:

- DNS público resuelve el hostname correcto;
- HTTPS muestra un certificado válido;
- no hay errores ni secretos en consola o bundle;
- el dominio final usa Supabase PROD, nunca DEV;
- Auth vuelve al dominio final después del login;
- una cuenta A no puede leer datos de una cuenta B;
- los checks de GitHub siguen verdes;
- quedó anotado el commit desplegado y el procedimiento de rollback.

## 8. Rollback sencillo

Si el despliegue nuevo falla:

1. no cambies la base de datos a mano;
2. identificá el último deployment verificado en Cloudflare Pages;
3. restauralo o revertí el commit mediante un commit nuevo;
4. repetí las pruebas de la sección anterior;
5. documentá el síntoma, la causa y la solución antes de intentar otro deploy.

Nunca borres el proyecto DEV ni PROD para “empezar de nuevo” sin un respaldo y
una decisión explícita.
