## Guardia de migraciones Supabase

Si creás o modificás una migración:

1. Leé primero el árbol y la skill del repo para conocer el comando exacto.
2. Usá la CLI para crear el archivo de migración; no inventés su timestamp.
3. Arrancá un Supabase local desechable con Docker.
4. Aplicá desde cero la cadena completa de migraciones.
5. Ejecutá las pruebas de base de datos, incluidas las pruebas RLS allow/deny.
6. Leé la salida y confirmá que contenedores, puertos, migraciones y pruebas tuvieron éxito.
7. Detené y limpiá el stack local según las reglas del repo.

Nunca sustituyás esta validación con producción. No vinculés, empujés ni modifiqués
un proyecto Supabase compartido sin aprobación explícita que nombre su project ref.
