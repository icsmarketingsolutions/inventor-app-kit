# Plan — INVENTOR O.S. Command Center

## Objetivo

Reemplazar la apertura principal de registro de inventos por un centro local útil y portable con
paridad funcional y visual respecto a V.A.U.L.T., sin copiar datos privados ni exigir Supabase.

## Fases

- [x] F0 — contrato de producto corregido y CRUD anterior declarado plantilla opcional.
- [x] F1 — HUD React y escritorio local sin Docker/Supabase.
- [x] F2 — memoria Markdown/Obsidian, búsqueda, directivas y grafo.
- [x] F3 — Prompt Foundry visual para uno o varios proyectos y Claude/Codex.
- [x] F4 — Ollama local opcional: salud, modelos, consola y refinador.
- [x] F5 — System Vitals, Agent Ops y lanzamiento seguro.
- [x] F6 — voz local opcional: grabar, detener, transcribir offline y reutilizar el texto.
- [ ] F6.1 — dictado incremental con ventanas, VAD y reconciliación de solapamiento.
- [ ] F7 — presets futuros de apps locales o con Supabase.
- [x] Paridad Command Center — Atlas con filtros, vecinos, pausa y expansión; cockpit animado.
- [x] Foundry de misiones — sesión única/equipo, roles, bandeja privada y lanzamiento con contexto fijo.

Cada fase marcada tiene pruebas automatizadas y su flujo determinista verificado en vivo. Las
integraciones externas opcionales se reportan por separado cuando la herramienta no está instalada.

F6 usa `whisper.cpp` y el modelo multilingüe `base`, instalados fuera de Git con hashes fijados. El
flujo estable es grabar y detener; el dictado incremental queda separado porque Whisper no ofrece
streaming palabra por palabra y requiere reconciliar fragmentos.

F4 queda completa como integración opcional y degradación honesta; una conversación real requiere
que la persona instale Ollama y descargue un modelo. F5 verifica el contrato seguro y el registro de
sesiones; ejecutar un agente real queda bajo confirmación explícita porque puede modificar el proyecto.
