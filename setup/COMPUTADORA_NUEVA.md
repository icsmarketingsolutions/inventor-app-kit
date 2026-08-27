# Preparar una computadora nueva (Windows)

Esta guía deja una computadora lista para crear aplicaciones con el kit. Está
escrita para alguien que no trabaja habitualmente con terminales.

No necesitás copiar contraseñas, tokens ni claves dentro de PowerShell, Codex o
este repositorio. Los inicios de sesión se hacen en las páginas oficiales que se
abren en el navegador.

## Qué vas a instalar

- PowerShell 7 para ejecutar los scripts del kit.
- Node.js **24 LTS** y npm para construir la aplicación.
- Git y GitHub CLI para guardar el historial y sincronizar el proyecto.
- WSL 2 y Docker Desktop para probar Supabase localmente.
- Codex para trabajar con la aplicación.
- La CLI de Supabase dentro de cada proyecto, no como instalación global.

## 1. Antes de empezar

1. Instalá todas las actualizaciones pendientes de Windows y reiniciá.
2. Confirmá que la virtualización está habilitada en el Administrador de tareas:
   `Rendimiento > CPU > Virtualización: Habilitada`.
3. Usá una cuenta de Windows con permiso para instalar aplicaciones.
4. Reservá al menos 15 GB libres para Docker y sus imágenes locales.

Si `winget` no existe, instalá o actualizá **App Installer** desde Microsoft
Store. No descargues instaladores desde anuncios o páginas no oficiales.

## 2. Instalá PowerShell 7

Seguí la guía oficial de Microsoft:
[Instalar PowerShell en Windows](https://learn.microsoft.com/powershell/scripting/install/installing-powershell-on-windows).

Después abrí **PowerShell 7** desde el menú Inicio y comprobá:

```powershell
$PSVersionTable.PSVersion
```

La primera cifra debe ser `7` o mayor. Los comandos de esta guía se ejecutan en
PowerShell 7, no en la consola antigua llamada “Windows PowerShell”.

## 3. Revisá el plan de instalación

Abrí PowerShell 7 dentro de la carpeta `inventor-app-kit` y ejecutá:

```powershell
pwsh -NoProfile -File ./scripts/bootstrap-windows.ps1
```

Ese comando es una **simulación**: muestra lo que haría y no cambia la
computadora. Leé la lista completa.

Para instalar las herramientas, cerrá PowerShell, abrilo de nuevo con
**Ejecutar como administrador**, volvé a la carpeta del kit y ejecutá:

```powershell
pwsh -NoProfile -File ./scripts/bootstrap-windows.ps1 -Install
```

El script instala únicamente herramientas del sistema. No crea cuentas, no inicia
sesión, no configura proyectos remotos y no solicita secretos.

Cuando termine, cerrá la consola administradora y reiniciá Windows. En una
PowerShell 7 normal (sin “Ejecutar como administrador”), instalá la versión de
Codex indicada por el kit:

```powershell
npm install --global @openai/codex@0.150.1
```

Separar este paso evita ejecutar scripts npm con privilegios elevados. Cuando
actualices Codex, verificá primero una versión oficial más reciente y cambiá el
pin de forma deliberada.

## 4. Terminá WSL 2 y Docker Desktop

1. Abrí Docker Desktop.
2. Aceptá usar el motor basado en WSL 2 si lo pregunta.
3. Esperá a que diga que el motor está funcionando.
4. En `Settings > General`, mantené activa la opción de WSL 2.

Guías oficiales:

- [Instalar WSL](https://learn.microsoft.com/windows/wsl/install)
- [Instalar Docker Desktop en Windows](https://docs.docker.com/desktop/setup/install/windows-install/)

Probá Docker. La primera ejecución puede descargar una imagen pequeña:

```powershell
docker run --rm hello-world
```

Debe terminar mostrando un mensaje de bienvenida de Docker. Si dice que no
puede conectarse al daemon, abrí Docker Desktop, esperá un minuto y repetí.

## 5. Comprobá la computadora

Desde la carpeta del kit:

```powershell
pwsh -NoProfile -File ./scripts/check-machine.ps1
```

Cada requisito aparece como `OK`, `FALTA` o `INFO`. Corregí todo lo marcado
`FALTA` y repetí el comando. En particular:

- Node debe ser 24 LTS y, como mínimo, `v24.18.1`; el bootstrap fija una revisión
  disponible más reciente.
- Git debe tener nombre y correo configurados, aunque el chequeo nunca los
  muestra.
- Docker Desktop debe estar abierto.
- GitHub CLI debe tener una sesión iniciada.
- Codex debe responder desde la terminal.

## 6. Configurá Git sin mostrar datos en pantalla

Elegí el nombre y correo que querés asociar a tus commits. Escribilos localmente;
no los pegues en un chat:

```powershell
git config --global user.name "TU NOMBRE"
git config --global user.email "TU_CORREO_NOREPLY_DE_GITHUB"
git config --global init.defaultBranch main
```

GitHub muestra el correo `noreply` en `Settings > Emails` cuando protegés tu
dirección. La configuración queda guardada en tu computadora. El chequeo solo informa si
existe; no imprime sus valores.

## 7. Creá y conectá las cuentas

Continuá en [MCP_Y_CUENTAS.md](MCP_Y_CUENTAS.md). Ahí vas a:

1. proteger GitHub con 2FA;
2. iniciar sesión en GitHub y Codex usando el navegador;
3. crear un proyecto **solo de desarrollo** en Supabase;
4. conectar el MCP de Supabase con OAuth, limitado a ese proyecto y en modo de
   solo lectura.

No conectes producción durante la preparación inicial.

## 8. Estado final esperado

La computadora está lista cuando:

- `check-machine.ps1` termina sin requisitos `FALTA`;
- `docker run --rm hello-world` funciona;
- GitHub tiene 2FA activa y `gh auth status` funciona;
- Codex abre y puede leer la carpeta del kit;
- el MCP de Supabase solo ve el proyecto de desarrollo y no puede escribir.

Después volvé a [START_HERE.md](../START_HERE.md) para crear la primera app.

## Si algo falla

- Copiá únicamente el mensaje de error, nunca una contraseña, token, cookie,
  archivo `.env` ni clave de recuperación.
- Ejecutá primero `check-machine.ps1`; su salida separa herramientas ausentes de
  cuentas todavía no conectadas.
- Si Node no es 24, desinstalá la versión equivocada desde “Aplicaciones
  instaladas” y repetí el bootstrap cuando Node 24 LTS sea la versión publicada
  por el paquete oficial.
- Si WSL pide reinicio, reiniciá antes de diagnosticar Docker.
