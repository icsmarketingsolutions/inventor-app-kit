# __INVENTOR_APP_NAME__

__INVENTOR_APP_PROBLEM__

## Instalar y abrir en Windows

```powershell
npm ci
npm run desktop:install
npm run desktop:start
```

El acceso directo espera a Docker, inicia el Supabase local y Vite, y abre una
ventana independiente. Leé [DESKTOP_WINDOWS.md](DESKTOP_WINDOWS.md) para conocer
el estado, detener servicios, desinstalar accesos directos o instalarla como PWA.

Para una prueba rápida sin base de datos, `npm run dev` mantiene disponible el
modo demostración. Para validar Supabase manualmente, seguí
[SUPABASE_LOCAL.md](SUPABASE_LOCAL.md).

La fundación usa Vite + React. La experiencia inicial prioriza
__INVENTOR_PRIMARY_USE_LABEL__, pero debe mantenerse responsive y accesible en
móvil, tableta y escritorio.

## Comandos

```powershell
npm run dev
npm run desktop:install
npm run desktop:start
npm run desktop:status
npm run desktop:stop
npm run desktop:uninstall
npm run lint
npm test
npm run build
```

## Trabajar con IA

Abrí este repo como proyecto y pegá [PROMPT_INICIO.md](PROMPT_INICIO.md). Para un
cambio grande, usá Prompt Foundry:

```powershell
node ./scripts/foundry.mjs --project . --mode plan --objective "Describí el cambio" --out .foundry-output/PROMPT_ACTUAL.md
```

Nunca pegues secretos en un prompt ni conectes una IA a producción.
