# INVENTOR O.S. Command Center

Centro local para memoria Obsidian, grafo de wikilinks, proyectos Git, Prompt Foundry, Ollama y
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
