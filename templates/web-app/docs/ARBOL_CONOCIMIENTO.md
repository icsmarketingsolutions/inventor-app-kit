# Árbol de conocimiento

## Producto

- Nombre: `__INVENTOR_APP_NAME__`
- Problema: `__INVENTOR_APP_PROBLEM__`
- Primer flujo: crear cuenta o usar demo -> registrar invento -> cambiar estado -> eliminar.

## Frontend

- `src/App.tsx`: autenticación y flujo principal; cada cambio de identidad invalida
  respuestas pendientes y vacía los datos antes de cargar la nueva sesión.
- `src/lib/supabase.ts`: cliente publicable; nunca service role.
- `src/lib/inventions.ts`: validación y normalización puras.
- `src/project.generated.json`: contexto visible generado desde las respuestas iniciales.

## Datos

- `public.inventions`: ideas privadas por `user_id`.
- RLS separada para select, insert, update y delete, con ownership inmutable por política.
- `supabase/tests/`: contrato allow/deny de las cuatro operaciones y aislamiento entre usuarios.

## Operación

- Desarrollo: Vite.
- Backend local: Supabase CLI sobre Docker.
- Calidad: oxlint, Vitest, TypeScript y build.
- Memoria: entrada por `memory/INDEX.md`, Markdown versionado y sanitizado.
- Contrato de agentes: skill canónico en `.agents/skills/build-an-app/` y puente para Claude.
