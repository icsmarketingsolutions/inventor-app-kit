---
name: build-an-app
description: Construye o modifica esta aplicación desde su contexto vivo. Úsala cuando se pida planificar, implementar, corregir, revisar o documentar funciones del producto; incluye Supabase, memoria y verificación del flujo real.
---

# Build an app

## Entrada dirigida

1. Leé `CLAUDE.md`, `PLAN.md`, `HANDOFF.md` y `memory/INDEX.md`.
2. Desde el índice, abrí las directivas, decisiones relevantes y el reporte más reciente.
3. Abrí solo la rama relevante de `docs/ARBOL_CONOCIMIENTO.md`.
4. Revisá estado Git antes de editar y preservá trabajo concurrente.
5. Si la tarea es grande, generá o seguí un plan aprobado con fases verificables.

## Construcción

- Reutilizá y parametrizá antes de copiar lógica.
- Una función pura nueva en `src/lib/` lleva una prueba enfocada.
- No dejes exports, archivos o dependencias sin consumidores.
- Nunca uses una llave `service_role` en el frontend.
- Cada tabla expuesta debe tener RLS, grants mínimos y políticas por operación.
- En políticas usá `(select auth.uid())`; en un `default` usá `auth.uid()` porque PostgreSQL no admite subconsultas en esa expresión.

## Migraciones

Antes de tocar `supabase/migrations/`, consultá la ayuda de la CLI instalada y
creá el archivo con `npx supabase migration new <nombre>`. Para terminar:

```powershell
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase stop --no-backup
```

Leé la salida completa. Si Docker falla, reportalo; nunca uses producción como
sustituto. Cualquier cambio remoto requiere aprobación explícita con project ref.

## Definición de terminado

```powershell
npm run lint
npm test
npm run build
```

Además, probá en vivo el flujo afectado. Si cambia arquitectura, tablas o flujos,
actualizá `docs/ARBOL_CONOCIMIENTO.md`. Registrá decisiones duraderas, directivas
y un reporte de sesión donde corresponda, y dejá `HANDOFF.md` fiel al estado real.
