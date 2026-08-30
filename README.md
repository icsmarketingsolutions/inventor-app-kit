# Inventor App Kit

Un sistema local y portable para pensar, organizar memoria y construir aplicaciones con agentes de IA.
El producto principal es **INVENTOR O.S. Command Center**: un centro de mando inspirado en V.A.U.L.T.
que funciona en la computadora sin Supabase, Docker ni una cuenta en la nube.

## Qué incluye

1. **Command Center:** proyectos Git, estado del sistema, directivas y actividad en una sola ventana.
2. **Memoria Markdown:** notas, capturas y `[[wikilinks]]` sobre los mismos archivos que abre Obsidian.
3. **Memory Graph:** grafo interactivo de relaciones, con mouse y teclado.
4. **Prompt Foundry:** contratos verificables para Codex o Claude en siete modos.
5. **IA local opcional:** consola y refinador con Ollama; el resto sigue funcionando si no está instalado.
6. **Voz local opcional:** grabación y transcripción offline con `whisper.cpp`, sin nube ni audio guardado.
7. **Agent Ops:** lanzamiento explícito y seguro de agentes dentro de proyectos registrados.
8. **Generador de apps:** starter secundario Vite + React + TypeScript, con Supabase solo cuando la app lo
   necesita.

El repositorio público no contiene cuentas, credenciales, proyectos personales ni memoria privada. La
memoria real se crea fuera de Git al abrir el Command Center por primera vez.

## Empezar

En Windows con Node.js 24 y PowerShell 7:

```powershell
git clone https://github.com/icsmarketingsolutions/inventor-app-kit.git
Set-Location inventor-app-kit
npm --prefix apps/command-center ci
npm run os:verify
npm run os:install
npm run os:start
```

El instalador crea accesos directos en el Escritorio y el menú Inicio. El Command Center abre como
ventana independiente, levanta únicamente su servidor local y conserva la memoria entre reinicios.

- **Computadora completamente nueva:** pegá el
  [primer prompt completo](setup/PROMPT_COMPUTADORA_NUEVA.md) en Codex.
- **Herramientas ya instaladas:** seguí [START_HERE.md](START_HERE.md).
- **Arquitectura y método:** leé [docs/COMO_FUNCIONA.md](docs/COMO_FUNCIONA.md).
- **Referencia del Command Center:** leé
  [apps/command-center/README.md](apps/command-center/README.md).

## Crear una app nueva

Esto es un paso posterior e independiente. El generador produce otro repo con Vite + React +
TypeScript, memoria, Foundry, pruebas y un preset Supabase. Que Supabase se use o no depende del
producto que se decida construir.

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

`PrimaryUse` puede ser `mobile`, `desktop` o `balanced`. Define prioridades de diseño, pero toda app
debe funcionar con tacto, mouse y teclado a 360, 768 y 1440 píxeles.

## Principios

- Las decisiones viven en archivos, no en la memoria de un chat.
- Cambios grandes empiezan con un plan aprobado.
- Compilar no basta: cada flujo se prueba funcionando.
- Los agentes reciben solo proyectos registrados y confirmación explícita.
- Supabase remoto, producción, deploy y DNS nunca se modifican sin aprobación explícita.
- Secretos solo en `.env`; jamás en Git, memoria ni prompts.

## Alcance de `v0.5.0`

El Command Center, su memoria, Foundry, integración opcional con Ollama, Agent Ops y el acceso directo
Windows están implementados. La voz local permite grabar, detener y transcribir offline; se instala
una sola vez con `npm run os:voice:install`. Obsidian, Ollama y voz son integraciones opcionales: su
ausencia no bloquea memoria, grafo ni Foundry.

## Licencia

[MIT](LICENSE). Podés forkear, adaptar y compartir el kit.
