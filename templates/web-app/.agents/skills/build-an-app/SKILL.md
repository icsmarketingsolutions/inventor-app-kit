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

- Mantené Vite + React como fundación web salvo que la persona responsable
  apruebe explícitamente cambiarla.
- Reutilizá y parametrizá antes de copiar lógica.
- Una función pura nueva en `src/lib/` lleva una prueba enfocada.
- No dejes exports, archivos o dependencias sin consumidores.
- Nunca uses una llave `service_role` en el frontend.
- Cada tabla expuesta debe tener RLS, grants mínimos y políticas por operación.
- En políticas usá `(select auth.uid())`; en un `default` usá `auth.uid()` porque PostgreSQL no admite subconsultas en esa expresión.

## Experiencia multidispositivo

Leé `src/project.generated.json.primaryUse` antes de cambiar una interfaz. Esa
preferencia define dónde priorizar navegación, densidad y acciones frecuentes;
nunca convierte el otro contexto en secundario no soportado.

- `mobile`: priorizá tacto, una mano, espacio limitado y acciones esenciales.
- `desktop`: priorizá teclado, mouse, información visible y tareas prolongadas.
- `balanced`: conservá la misma jerarquía esencial en ambos.

Verificá el flujo a 360, 768 y 1440 píxeles, sin desbordamiento horizontal, con
foco visible, orden de tabulación útil y controles táctiles cómodos. No aceptés
una captura como sustituto de recorrer el flujo.

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
