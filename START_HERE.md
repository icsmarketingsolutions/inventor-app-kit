# Empezá aquí (Windows)

Esta ruta crea una app nueva sin modificar el kit.

## 1. Comprobá la computadora

Abrí PowerShell dentro de la carpeta `inventor-app-kit` y ejecutá:

```powershell
pwsh -NoProfile -File ./scripts/check-machine.ps1
```

Si aparece algo como `FALTA`, seguí
[setup/COMPUTADORA_NUEVA.md](setup/COMPUTADORA_NUEVA.md) y repetí el chequeo.

## 2. Elegí una carpeta para tus proyectos

En Windows, una opción simple es `C:\Proyectos`. Creala si todavía no existe:

```powershell
New-Item -ItemType Directory -Path 'C:\Proyectos' -Force
```

El kit se queda donde está. Cada app aparecerá como una carpeta hermana dentro
de esa ubicación.

## 3. Creá la primera app

Copiá el comando y cambiá los cinco textos libres y la preferencia de uso:

```powershell
pwsh -NoProfile -File ./scripts/New-InventorApp.ps1 `
  -Name "Mis inventos" `
  -Slug "mis-inventos" `
  -Problem "Quiero ordenar ideas y convertirlas en prototipos" `
  -Audience "Mi familia y yo" `
  -FirstAction "Registrar un invento" `
  -PrimaryUse "balanced" `
  -OutputRoot "C:\Proyectos"
```

`Slug` es el nombre técnico de la carpeta: minúsculas, números y guiones, sin
espacios ni tildes y con un máximo de 50 caracteres. En `PrimaryUse` elegí
`mobile`, `desktop` o `balanced` según
dónde se usará más. Esto cambia qué experiencia se prioriza, pero la app siempre
debe seguir funcionando en móvil, tableta y escritorio.

Los cinco textos libres se guardan en archivos que después podrán
subirse a Git: describí el producto, pero no incluyás nombres de personas, datos
de clientes, correos, teléfonos ni secretos. El generador nunca sobrescribe una
carpeta existente.

## 4. Instalá y abrí la app

El generador muestra la ruta exacta al terminar. Entrá en ella:

```powershell
Set-Location 'C:\Proyectos\mis-inventos'
npm ci
npm run desktop:install
npm run desktop:start
```

En Windows quedarán accesos directos en el Escritorio y el menú Inicio. Al
abrirlos, la app espera a Docker, inicia el Supabase local y Vite, y aparece en
una ventana independiente de Chrome o Edge. La primera apertura puede tardar
varios minutos; las siguientes reutilizan los servicios y la ventana existentes.

Para conocer, detener o desinstalar únicamente los accesos directos:

```powershell
npm run desktop:status
npm run desktop:stop
npm run desktop:uninstall
```

`desktop:stop` conserva los datos locales y deja Docker Desktop disponible para
otras apps. La ruta manual `npm run dev` sigue disponible, pero no inicia
Supabase. Leé [DESKTOP_WINDOWS.md](templates/web-app/DESKTOP_WINDOWS.md) para el
comportamiento completo.

## 5. Dale contexto a la IA

Abrí la carpeta de la app en Codex o Claude y pegá el contenido de
`PROMPT_INICIO.md`. Desde ese momento, la IA debe leer los índices del proyecto,
usar el plan y alimentar su memoria propia.

Para un cambio grande, primero generá un prompt de plan:

```powershell
node ./scripts/foundry.mjs `
  --project 'C:\Proyectos\mis-inventos' `
  --mode plan `
  --objective 'Describí aquí el siguiente cambio' `
  --out .foundry-output/PROMPT_ACTUAL.md
```

## Cómo continuar mañana

```powershell
Set-Location 'C:\Proyectos\mis-inventos'
npm run desktop:start
```

Leé `HANDOFF.md` para recordar qué quedó listo y qué sigue.
