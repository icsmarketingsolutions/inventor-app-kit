# Supabase local

Esta app usa Supabase para autenticación y datos privados por usuario. Docker
Desktop debe estar abierto.

## Arrancar desde cero

```powershell
npx supabase start
npx supabase db reset
npx supabase test db
```

Leé la salida completa. Deben arrancar los contenedores, aplicar todas las
migraciones y pasar las pruebas de base de datos.

## Conectar la interfaz

Pedile a la CLI los valores locales:

```powershell
npx supabase status -o env
```

Copiá `.env.example` como `.env.local`. Usá la URL local y la llave publicable
local que mostró el comando. Nunca pongás `service_role` en una app web.

```powershell
npm run dev
```

Creá dos cuentas distintas y comprobá que cada una vea únicamente sus propios
inventos.

## Detener y limpiar

```powershell
npx supabase stop --no-backup
```

Un proyecto remoto se conecta únicamente después de que esta cadena local pase
y con aprobación explícita que nombre el project ref.
