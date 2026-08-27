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

Copiá el comando y cambiá únicamente los cinco textos entre comillas:

```powershell
pwsh -NoProfile -File ./scripts/New-InventorApp.ps1 `
  -Name "Mis inventos" `
  -Slug "mis-inventos" `
  -Problem "Quiero ordenar ideas y convertirlas en prototipos" `
  -Audience "Mi familia y yo" `
  -FirstAction "Registrar un invento" `
  -OutputRoot "C:\Proyectos"
```

`Slug` es el nombre técnico de la carpeta: minúsculas, números y guiones, sin
espacios ni tildes. Los cinco textos se guardan en archivos que después podrán
subirse a Git: describí el producto, pero no incluyás nombres de personas, datos
de clientes, correos, teléfonos ni secretos. El generador nunca sobrescribe una
carpeta existente.

## 4. Instalá y abrí la app

El generador muestra la ruta exacta al terminar. Entrá en ella:

```powershell
Set-Location 'C:\Proyectos\mis-inventos'
npm ci
npm run dev
```

Abrí la URL que muestra Vite, normalmente `http://localhost:5173`. Para detener
el servidor, volvé a PowerShell y presioná `Ctrl+C`.

## 5. Dale contexto a la IA

Abrí la carpeta de la app en Codex o Claude y pegá el contenido de
`PROMPT_INICIO.md`. Desde ese momento, la IA debe leer los índices del proyecto,
usar el plan y alimentar su memoria propia.

Para un cambio grande, primero generá un prompt de plan:

```powershell
node ./scripts/foundry.mjs `
  --project 'C:\Proyectos\mis-inventos' `
  --mode plan `
  --objective 'Describí aquí el siguiente cambio'
```

## Cómo continuar mañana

```powershell
Set-Location 'C:\Proyectos\mis-inventos'
npm run dev
```

Leé `HANDOFF.md` para recordar qué quedó listo y qué sigue.
