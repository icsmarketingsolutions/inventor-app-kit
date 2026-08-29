# INVENTOR O.S. — guía para agentes

1. Leé `CLAUDE.md`, la skill canónica y la rama necesaria del árbol.
2. Preservá trabajo concurrente y revisá Git antes de editar.
3. Un cambio grande requiere fases aprobadas y verificables.
4. Una función pura nueva en `src/lib/` o `server/` lleva prueba.
5. Memoria, configuración, prompts generados y logs del usuario nunca se versionan.
6. No agregues endpoints de shell arbitrario ni interpolés comandos.
7. Verificá lint, tests, build y el flujo real en `:5173`.
8. Si cambia arquitectura o un flujo, actualizá `docs/ARBOL_CONOCIMIENTO.md` en la misma sesión.
