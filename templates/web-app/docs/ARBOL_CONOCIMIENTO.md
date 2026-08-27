# Árbol de conocimiento

## Producto

- Nombre: `__INVENTOR_APP_NAME__`
- Problema: `__INVENTOR_APP_PROBLEM__`
- Experiencia principal: `__INVENTOR_PRIMARY_USE__` — prioriza
  __INVENTOR_PRIMARY_USE_LABEL__, sin excluir otros tamaños o entradas.
- Primer flujo: crear cuenta o usar demo -> registrar invento -> cambiar estado -> eliminar.

## Frontend

- `src/App.tsx`: autenticación y flujo principal; cada cambio de identidad invalida
  respuestas pendientes y vacía los datos antes de cargar la nueva sesión.
- `src/lib/supabase.ts`: cliente publicable; nunca service role.
  Su `storageKey` deriva del slug para no compartir sesiones entre apps locales.
- `src/lib/inventions.ts`: validación y normalización puras.
- `src/lib/operation-guard.ts`: descarta respuestas obsoletas y evita mutaciones simultáneas.
- `src/project.generated.json`: contexto visible generado desde las respuestas iniciales.
- UI responsive desde 320 px; los cambios visuales se recorren a 360, 768 y
  1440 px con teclado y controles táctiles.

## Datos

- `public.inventions`: ideas privadas por `user_id`.
- RLS separada para select, insert, update y delete, con ownership inmutable por política.
- La secuencia identity queda interna: `anon` y `authenticated` no pueden leerla ni alterarla.
- Un trigger conserva `created_at` y calcula `updated_at` en la base; el navegador no controla esos valores.
- `supabase/tests/`: contrato allow/deny de las cuatro operaciones y aislamiento entre usuarios.

## Operación

- Desarrollo: Vite + React.
- Backend local: Supabase CLI sobre Docker.
- `supabase/config.toml`: `project_id` se genera desde el slug para aislar
  contenedores, volúmenes y apagado entre aplicaciones locales distintas.
- `public/manifest.webmanifest`, `public/app-icon.svg` y `public/service-worker.js`:
  identidad PWA, ventana standalone y shell local instalable.
- `scripts/desktop/`: instalador y lanzador Windows. El acceso directo usa un
  puente VBS silencioso, espera Docker, levanta Supabase y Vite, valida que el
  puerto pertenezca a esta app y abre o enfoca una única ventana Chromium. El
  perfil del navegador vive bajo `.desktop/` y queda aislado por repo.
- `.desktop/`: estado y logs locales ignorados por Git; no recibe llaves ni
  salida cruda de Supabase. `desktop:stop` conserva los datos y deja Docker abierto.
- Analytics y Vector locales están desactivados porque esta app no los consume; así el stack mínimo
  no arranca servicios innecesarios.
- Calidad: oxlint, Vitest, TypeScript y build.
- Memoria: entrada por `memory/INDEX.md`, Markdown versionado y sanitizado.
- Contrato de agentes: skill canónico en `.agents/skills/build-an-app/` y puente para Claude.
