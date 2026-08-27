# Cuentas y MCP, paso a paso

Esta guía conecta las cuentas necesarias sin copiar secretos al repositorio, a
PowerShell ni a una conversación con IA.

## Regla principal

Durante el primer uso solo se conecta un proyecto de **desarrollo** de Supabase.
El MCP queda limitado a ese proyecto, con consultas de solo lectura y una lista
reducida de herramientas. Producción queda fuera.

## 1. GitHub con autenticación de dos factores

1. Creá una cuenta en [github.com](https://github.com/) si todavía no tenés una.
2. Abrí `Settings > Password and authentication`.
3. Activá 2FA con una app autenticadora (TOTP) como método principal.
4. Agregá una passkey como respaldo resistente a phishing, si tu dispositivo la permite.
5. Guardá los códigos de recuperación en un gestor de contraseñas o en un lugar
   físico seguro. No los guardes en este repo ni en una captura compartida.

Luego iniciá sesión desde GitHub CLI usando el navegador:

```powershell
gh auth login --web
```

Elegí `GitHub.com` y `HTTPS`. El navegador completa la autorización; no hace
falta crear ni pegar un token personal.

Comprobá sin mostrar credenciales:

```powershell
gh auth status
```

## 2. Codex

Abrí Codex y seguí el inicio de sesión que muestra la aplicación o la terminal.
Completalo personalmente en el navegador. No pegues una API key en el kit para
usar el inicio de sesión normal de Codex.

Comprobá la instalación:

```powershell
codex --version
```

Documentación oficial:
[Codex CLI](https://learn.chatgpt.com/docs/codex/cli).

## 3. Cuenta y proyecto de desarrollo en Supabase

1. Creá o abrí tu cuenta en [supabase.com](https://supabase.com/).
2. Creá una organización personal.
3. Creá un proyecto nuevo cuyo nombre termine en `DEV`, por ejemplo
   `mi-primera-app-dev`.
4. Usá únicamente datos inventados o de prueba.
5. Guardá la contraseña de la base de datos en un gestor de contraseñas. No la
   pongas en Markdown, Git, Codex ni PowerShell.
6. En la configuración del proyecto, localizá el **Project Ref**. No es una
   contraseña, pero identifica el proyecto: tratá de no publicarlo sin motivo.

No crees todavía el proyecto de producción. Primero terminá y probá el flujo
local de la app.

## 4. Prepará la configuración de Codex

La configuración personal de Codex vive en:

```text
%USERPROFILE%\.codex\config.toml
```

Codex también admite `.codex/config.toml` dentro de un proyecto confiable. Para
Supabase, este kit recomienda esa configuración **por aplicación**: reduce el
riesgo de usar el proyecto DEV equivocado y el archivo ya está fuera de Git.

1. Abrí [examples/codex-config.toml.example](examples/codex-config.toml.example).
2. Dentro del repo de la app, creá `.codex/config.toml` y copiá únicamente el
   bloque del servidor `supabase_dev`.
3. Reemplazá `REEMPLAZA_CON_REF_DEL_PROYECTO_DEV` por el Project Ref del proyecto
   DEV.
4. No agregues tokens ni cabeceras `Authorization`.
5. Abrí esa carpeta como proyecto confiable en Codex y reinicialo para recargar
   la configuración. La configuración global es opcional solo para MCPs que no
   pertenezcan a una app específica.

La URL combina tres barreras:

- `project_ref=...`: el MCP solo ve ese proyecto y deshabilita herramientas de
  cuenta/organización.
- `read_only=true`: las consultas usan un rol de Postgres de solo lectura.
- `features=database,docs`: solo habilita base de datos y documentación.

Codex usa OAuth por defecto para servidores HTTP autenticados. Revisá cada
aprobación en la interfaz y mantené escrituras denegadas; no agregues cabeceras
ni tokens al TOML.

## 5. Autenticá Supabase MCP con OAuth

Desde PowerShell:

```powershell
codex mcp list
codex mcp login supabase_dev
```

Codex abre el navegador. Iniciá sesión directamente en Supabase y revisá el
consentimiento antes de aprobar. OAuth guarda la sesión en el almacén local de
Codex; no copies el resultado ni busques sus archivos internos.

Después reiniciá Codex y comprobá:

```powershell
codex mcp list
```

Dentro de Codex también podés escribir `/mcp` para ver los servidores activos.

Documentación oficial:

- [MCP en Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [MCP de Supabase](https://supabase.com/docs/guides/ai-tools/mcp)

## 6. Prueba segura

Pedile a Codex:

```text
Usá supabase_dev para listar los nombres de las tablas y las migraciones visibles.
No ejecutes escrituras ni cambios de configuración.
```

La prueba pasa si:

- solo aparece el proyecto DEV elegido;
- puede leer información del esquema;
- no aparecen herramientas para crear, pausar o borrar proyectos;
- una solicitud de escritura no se ejecuta. No hace falta intentar una escritura
  real para comprobarlo: revisá la configuración y mantené el test en lectura.

## 7. Si OAuth falla

1. Confirmá que la URL empieza exactamente por
   `https://mcp.supabase.com/mcp`.
2. Ejecutá `codex mcp list` y verificá que el nombre sea `supabase_dev`.
3. Cerrá otras ventanas de inicio de sesión antiguas.
4. Ejecutá de nuevo `codex mcp login supabase_dev`.
5. Reiniciá Codex después de autenticar.

Un `401` al abrir la URL del MCP sin iniciar sesión puede indicar que el servidor
está accesible y exige autenticación; no intentes solucionarlo pegando tokens.

## 8. Qué nunca conectar

- Un proyecto con datos reales de clientes durante el aprendizaje.
- Un MCP sin `project_ref`.
- Un MCP de producción con permisos de escritura.
- Un token personal guardado en `config.toml` o `.mcp.json`.
- La cuenta de otra persona.

Activá MFA también en Supabase, Cloudflare y el registrador del dominio antes de
usar recursos de producción.
