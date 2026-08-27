# Handoff

## Estado

La fundación fue generada. La interfaz puede abrir en modo demostración sin
cuentas. Supabase queda listo para validarse localmente siguiendo
`SUPABASE_LOCAL.md`. En Windows, `npm run desktop:install` crea accesos directos
que preparan Docker, Supabase local y Vite antes de abrir la app.

La prioridad inicial es __INVENTOR_PRIMARY_USE_LABEL__. Toda pantalla debe
seguir funcionando en móvil, tableta y escritorio.

## Continuar mañana

```powershell
npm run desktop:start
```

Si todavía no existe el acceso directo, ejecutá primero `npm ci` y
`npm run desktop:install`. `npm run desktop:status` diagnostica los tres
servicios sin mostrar credenciales.

Antes de una funcionalidad grande:

```powershell
node ./scripts/foundry.mjs --project . --mode plan --objective "Siguiente resultado" --out .foundry-output/PROMPT_ACTUAL.md
```
