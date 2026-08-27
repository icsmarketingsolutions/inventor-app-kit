# __INVENTOR_APP_NAME__

__INVENTOR_APP_PROBLEM__

## Empezar sin base de datos

```powershell
npm ci
npm run dev
```

La interfaz abre en modo demostración y permite probar el primer flujo. Para
guardar cuentas y datos con Supabase, seguí [SUPABASE_LOCAL.md](SUPABASE_LOCAL.md).

La fundación usa Vite + React. La experiencia inicial prioriza
__INVENTOR_PRIMARY_USE_LABEL__, pero debe mantenerse responsive y accesible en
móvil, tableta y escritorio.

## Comandos

```powershell
npm run dev
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
