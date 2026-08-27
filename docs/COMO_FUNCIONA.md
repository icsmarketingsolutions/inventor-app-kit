# Cómo funciona el sistema

## La idea principal

Un buen prompt ayuda una vez. Un sistema de contexto ayuda todos los días.

```text
Idea
  -> generador
  -> repo independiente
  -> Prompt Foundry
  -> plan aprobado
  -> implementación
  -> verificación real
  -> memoria actualizada
  -> siguiente sesión
```

## Contexto en capas

Cada app generada contiene:

1. `CLAUDE.md` y `AGENTS.md`: índices cortos que siempre se pueden leer.
2. `.agents/skills/build-an-app/SKILL.md`: reglas canónicas y definición de terminado;
   `.claude/` contiene un puente de compatibilidad.
3. `docs/ARBOL_CONOCIMIENTO.md`: arquitectura y flujos detallados.
4. `PLAN.md`: decisiones, fases y estado.
5. `memory/INDEX.md`: entrada a decisiones, conocimiento, directivas y reportes.

El agente entra por el índice y baja únicamente a la rama necesaria. Así evita
mezclar información vieja o gastar contexto en archivos irrelevantes.

## Experiencia multidispositivo

El generador conserva una preferencia `mobile`, `desktop` o `balanced`. No es una
lista de dispositivos permitidos: indica dónde priorizar navegación, densidad y
acciones frecuentes. Vite + React es la base web fija y toda pantalla debe
seguir siendo responsive, accesible por teclado y usable con tacto, mouse o
teclado. Los cambios visuales se verifican al menos a 360, 768 y 1440 píxeles.

## Prompt Foundry

`scripts/foundry.mjs` ensambla un prompt a partir de bloques versionados:

- el modo de trabajo elegido;
- el objetivo actual;
- una radiografía Git resumida, sin rutas absolutas, nombres de ramas ni mensajes;
- las rutas a su árbol, skill, plan y memoria;
- las reglas de verificación;
- un guard especial cuando detecta migraciones Supabase.

Soporta varios `--project` con un `--label` seguro y único para cada uno. Conserva
rutas relativas operables, omite las absolutas, trata los metadatos como no
confiables, no lee secretos ni pega el contenido entero del repo dentro del prompt.

## Memoria viva

La memoria es Markdown plano y viaja con el proyecto:

- `00-inbox`: ideas sin clasificar;
- `10-decisions`: decisiones y su razón;
- `20-knowledge`: conceptos duraderos;
- `30-directives`: pendientes humanos;
- `90-reports`: cierres de sesiones significativas.

Los chats pueden resumirse o terminar; estos archivos siguen siendo la fuente de
verdad de la próxima sesión.

## Forma de trabajo

1. **Plan:** explorar dirigido, proponer fases y esperar aprobación en cambios grandes.
2. **Hacer:** implementar una fase y verificarla antes de la siguiente.
3. **Revisar:** correctness, seguridad, simplicidad y código muerto.
4. **Documentar:** actualizar árbol, plan, gotchas y ayuda cuando corresponda.
5. **Cerrar:** build/lint/tests, flujo real y handoff; commit y push solo cuando la
   persona lo haya pedido explícitamente.

## Supabase

El starter incluye una tabla privada por usuario, RLS y pruebas allow/deny. La
cadena local es obligatoria antes de cualquier proyecto remoto:

```powershell
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase stop --no-backup
```

Una salida verde significa que Docker arrancó, la migración aplicó y pgTAP pasó.
Hay que leer la salida completa: un proceso con exit code cero no sustituye esa
comprobación.
