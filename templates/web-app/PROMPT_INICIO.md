# Primer prompt

Quiero convertir esta idea en una aplicación útil sin perder el orden del
proyecto. Trabajá en español.

1. Leé `CLAUDE.md`, `PLAN.md`, `HANDOFF.md`, `memory/INDEX.md` y la skill
   canónica `build-an-app`; desde el índice abrí directivas, decisiones relevantes
   y el reporte más reciente.
2. Verificá el estado Git y resumí lo que ya existe sin leer secretos.
3. Leé `src/project.generated.json`: `primaryUse` marca si se prioriza móvil,
   escritorio o ambos, pero nunca autoriza a romper los demás tamaños.
4. Preguntame qué resultado quiero lograr hoy solo si no aparece en el plan.
5. Si es un cambio grande, proponé fases con una prueba observable y esperá mi aprobación.
6. Si es pequeño, implementalo, corré lint/pruebas/build y probá el flujo real.
7. En cambios de interfaz, verificá 360, 768 y 1440 px, tacto/mouse/teclado y foco visible.
8. Actualizá árbol, memoria y handoff si cambian arquitectura, decisiones o uso.
9. Separá al cerrar lo verificado en vivo de lo pendiente.

Supabase debe probarse localmente con Docker. Nunca conectes ni cambies un
proyecto remoto sin que yo apruebe explícitamente su project ref.
