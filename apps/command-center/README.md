# INVENTOR O.S. Command Center

Memory Atlas incorpora búsqueda, filtros, conexiones navegables, zoom, pausa y vista ampliada.
El cockpit añade profundidad, transiciones y foco visible, con soporte para movimiento reducido.

En Prompt Foundry elegí **Una sesión** o **Equipo**, seleccioná proyectos y forjá el contrato.
En equipo podés revisar e iniciar los prompts de orquestador, constructor e investigador y consultar
su bandeja de encargos y entregas. Cada lanzamiento requiere la confirmación de la vista previa.
Los modelos son preferencias editables: Astra/Sol/Terra o Fable 5.1/Opus/Sonnet. Para Fable indicá el
ID disponible en tu proveedor; vacío conserva el predeterminado. La bandeja persiste localmente y
no despierta sesiones inactivas; la mensajería automática depende de las herramientas del agente.

Centro local para memoria Obsidian, grafo de wikilinks, proyectos Git, Prompt Foundry, voz, Ollama y
agentes. Funciona sin Supabase y sin Docker.

## Desarrollo

```powershell
npm ci
npm run dev
```

Abre `http://127.0.0.1:5173`. La API local corre en `127.0.0.1:8322`.

## Escritorio Windows

```powershell
npm run desktop:install
npm run desktop:start
npm run desktop:status
npm run desktop:stop
```

La memoria se conserva al detener o desinstalar accesos directos. Ollama y Obsidian son integraciones
opcionales: el HUD explica su ausencia y continúa funcionando.

En `NUEVO PROYECTO`, `BUSCAR CARPETA…` abre el selector nativo de Windows delante de la app y carga
la ruta elegida. Es una capacidad local de Windows; el campo de ruta manual permanece como respaldo.

## Voz local opcional

En Windows, instalá una sola vez `whisper.cpp` y el modelo multilingüe `base`:

```powershell
npm run voice:install
```

El instalador usa descargas oficiales fijadas y verifica sus hashes. Después, `VOICE TRANSCRIPTION`
permite grabar hasta 120 segundos, detener, editar la transcripción y enviarla a Foundry, Consola o
Memoria. El audio no sale de la computadora ni se conserva. `npm run voice:smoke` ejecuta una frase
sintética fija contra la API local para comprobar el motor sin guardar audio.
