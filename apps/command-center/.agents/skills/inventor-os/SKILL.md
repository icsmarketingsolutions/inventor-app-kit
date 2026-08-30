---
name: inventor-os
description: Construye y verifica INVENTOR O.S. Command Center, su memoria Markdown/Obsidian, grafo, Prompt Foundry, Ollama local, proyectos Git y lanzamiento seguro de agentes.
---

# INVENTOR O.S.

## Entrada dirigida

Leé `CLAUDE.md`, `PLAN.md` y la rama necesaria de `docs/ARBOL_CONOCIMIENTO.md`. Revisá Git y el
reporte más reciente de la memoria de desarrollo antes de tocar código.

## Arquitectura no negociable

- React + TypeScript + Vite para el HUD; Canvas encapsulado para el grafo.
- Node 24 para el servicio local de archivos, Git, Foundry, voz, Ollama y agentes.
- Memoria en Markdown + frontmatter + `[[wikilinks]]`; sin base de datos obligatoria.
- Servicio enlazado únicamente a loopback, con `Host`/`Origin`, tamaño y rutas validados.
- Ollama acepta solamente loopback. Su ausencia no bloquea memoria ni Foundry.
- Voz usa únicamente WAV PCM mono 16 kHz/16-bit y `whisper.cpp` bajo datos locales; nunca Web Speech
  API ni fallback cloud. El audio temporal siempre se elimina.
- Proyectos explícitamente registrados. Git usa `execFile` con argumentos y timeout, nunca shell.
- Lanzar un agente exige proyecto registrado, herramienta permitida, preview y confirmación explícita.
- Supabase y Docker no son dependencias del Command Center.

## Privacidad

El repositorio público contiene solo código, configuración de ejemplo y una semilla vacía. No leas ni
copies el vault privado de V.A.U.L.T. La memoria real vive en `INVENTOR_OS_HOME` o en la carpeta local
de datos del sistema. Nunca registres rutas completas, contenido de notas ni prompts en errores públicos.

## Experiencia

Conservá el lenguaje visual del cockpit: negro, ámbar, mono, estados y densidad informativa. Debe ser
usable con teclado, tacto y mouse a 360, 768 y 1440 px. Respetá `prefers-reduced-motion`.

## Definición de terminado

```powershell
npm run lint
npm test
npm run build
```

Además, levantá `npm run dev` y recorré en navegador memoria, grafo, Foundry y estado Ollama. Para
cambios del lanzador verificá instalación, primera y segunda apertura, estado, apagado y desinstalación.
Una segunda apertura no puede duplicar servicio ni ventana; el apagado conserva la memoria.
Para voz, verificá por separado `npm run voice:smoke` y el micrófono real: permiso al gesto,
grabar/detener, reutilizar texto, cancelar durante procesamiento y ausencia de WAV temporales. La
última verificación completa del micrófono real fue el 2026-08-29.

## Gotchas

- El V.A.U.L.T. privado documentaba React/Vite, pero su HUD real es HTML/JS monolítico. Este proyecto
  busca paridad funcional y visual con una implementación React explícita; mantené el árbol fiel.
- Desarrollo usa Vite `:5173` y API `:8322`; escritorio sirve `dist` y API juntos en `:8421`. No
  reutilicés `:8321`: V.A.U.L.T. ya ocupa ese puerto y el conflicto solo aparece en la prueba real.
- Los IDs del grafo son rutas relativas sin extensión, no solo el nombre del archivo: dos notas con el
  mismo nombre en carpetas distintas no pueden colisionar.
- El perfil Chromium de escritorio vive en `.runtime/desktop/browser-profile` y debe permanecer ignorado.
- Un permiso de micrófono pendiente no se puede cancelar desde `getUserMedia`; la UI invalida la
  solicitud y detiene cualquier stream que llegue después. Nunca permitás doble solicitud por doble click.
- El selector de proyectos usa `IFileOpenDialog` y debe recibir siempre el HWND exacto del HUD como
  propietario. Sin dueño, Windows puede abrirlo detrás; no agregués fallbacks que muestren un diálogo
  huérfano. Ruta inicial por stdin, ejecutable/script absolutos y un solo selector activo.
- `ScriptProcessorNode` mantiene hoy la captura compatible, pero está deprecado; una fase futura debe
  migrar a `AudioWorklet` sin perder limpieza, remuestreo ni soporte del acceso directo.
