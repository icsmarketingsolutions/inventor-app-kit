# Empezá aquí (Windows)

La primera meta es abrir INVENTOR O.S. Command Center. No necesitás Supabase ni Docker para usar la
memoria, el grafo, Prompt Foundry o registrar proyectos.

## 1. Comprobá la computadora

Abrí PowerShell dentro de `inventor-app-kit`:

```powershell
pwsh -NoProfile -File ./scripts/check-machine.ps1
```

Si aparece `FALTA`, seguí la preparación mínima de [setup/COMPUTADORA_NUEVA.md](setup/COMPUTADORA_NUEVA.md)
y repetí el chequeo. WSL, Docker y Supabase son `INFO` opcional hasta que una app concreta los necesite.

## 2. Instalá y verificá el Command Center

```powershell
npm --prefix apps/command-center ci
npm run os:verify
npm run os:install
npm run os:start
```

Quedarán accesos directos en el Escritorio y el menú Inicio. La primera apertura crea una memoria
local privada a partir de `memory-seed/`; esa memoria no se guarda en este repo público.

Comandos para el día a día:

```powershell
npm run os:status
npm run os:start
npm run os:stop
```

Detener conserva las notas. Volver a abrir el acceso directo reutiliza una única instancia.

## 3. Registrá el primer proyecto

En `COMMAND DECK`, elegí **NUEVO PROYECTO** y pulsá **BUSCAR CARPETA**. Se abre el Explorador nativo
de Windows para elegir una carpeta Git local; también podés escribir la ruta. El servidor guarda la
ruta únicamente en la configuración privada de esta computadora; el HUD y los prompts muestran un
identificador relativo o seguro.

Después podés:

- capturar ideas en `MEMORIA` y abrir el mismo vault con Obsidian;
- explorar `MEMORY GRAPH`;
- elegir proyecto, agente, modo y objetivo en `PROMPT FOUNDRY`;
- copiar el contrato o lanzar un agente después de confirmar;
- conectar Ollama cuando quieras usar un modelo completamente local.

## 4. Voz local opcional

Para dictar ideas sin nube, instalá una sola vez el motor y el modelo multilingüe:

```powershell
npm run os:voice:install
npm run os:start
```

En `VOICE TRANSCRIPTION`, pulsá **GRABAR**, aceptá el micrófono, hablá y elegí **DETENER Y
TRANSCRIBIR**. El texto queda editable y puede enviarse a Foundry, Consola o Memoria. La grabación se
borra automáticamente. El flujo admite 120 segundos por toma y no requiere Supabase, Docker, Ollama,
Python ni FFmpeg.

## 5. Crear una aplicación es opcional y viene después

Cuando ya exista una idea concreta, el generador puede crear otro repo:

```powershell
pwsh -NoProfile -File ./scripts/New-InventorApp.ps1 `
  -Name "Mi aplicación" `
  -Slug "mi-aplicacion" `
  -Problem "Problema que quiero resolver" `
  -Audience "Personas que la usarán" `
  -FirstAction "Primera acción útil" `
  -PrimaryUse "balanced" `
  -OutputRoot "C:\Proyectos"
```

La app generada usa Vite + React + TypeScript. `PrimaryUse` define si prioriza móvil, escritorio o un
equilibrio, sin excluir otros tamaños. Supabase es un preset disponible para productos que necesiten
cuentas o datos compartidos; no es requisito del Command Center y nunca se conecta a producción de
forma automática.

## Cómo continuar mañana

Abrí **INVENTOR O.S. Command Center** desde el Escritorio, o ejecutá:

```powershell
Set-Location 'C:\Proyectos\inventor-app-kit'
npm run os:start
```
