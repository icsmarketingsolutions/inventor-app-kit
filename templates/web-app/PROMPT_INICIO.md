# Primer prompt

Quiero convertir esta idea en una aplicación útil sin perder el orden del
proyecto. Trabajá en español.

1. Leé `CLAUDE.md`, `PLAN.md`, `HANDOFF.md`, `memory/INDEX.md` y la skill
   canónica `build-an-app`; desde el índice abrí directivas, decisiones relevantes
   y el reporte más reciente.
2. Verificá el estado Git y resumí lo que ya existe sin leer secretos.
3. Preguntame qué resultado quiero lograr hoy solo si no aparece en el plan.
4. Si es un cambio grande, proponé fases con una prueba observable y esperá mi aprobación.
5. Si es pequeño, implementalo, corré lint/pruebas/build y probá el flujo real.
6. Actualizá árbol, memoria y handoff si cambian arquitectura, decisiones o uso.
7. Separá al cerrar lo verificado en vivo de lo pendiente.

Supabase debe probarse localmente con Docker. Nunca conectes ni cambies un
proyecto remoto sin que yo apruebe explícitamente su project ref.
