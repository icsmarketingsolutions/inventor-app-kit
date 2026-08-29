# Cómo funciona el sistema

## La idea principal

Un buen prompt ayuda una vez. Un sistema de contexto ayuda todos los días.

```text
Idea o proyecto local
  -> INVENTOR O.S. Command Center
  -> memoria y grafo
  -> Prompt Foundry
  -> plan aprobado
  -> implementación
  -> verificación real
  -> memoria actualizada
  -> siguiente sesión
```

El Command Center es la aplicación principal y funciona totalmente local. El generador de repos es
una herramienta secundaria para cuando una idea ya deba convertirse en producto.

## Command Center

El HUD React/Vite conversa con una API Node enlazada únicamente a `127.0.0.1`. La API registra
proyectos Git elegidos por la persona, lee y escribe Markdown, arma prompts, consulta Ollama local y
lanza Codex o Claude solo después de confirmación explícita. No necesita Supabase ni Docker.

En desarrollo usa Vite `:5173` y API `:8322`. El acceso directo Windows sirve el build y la API en
`:8421`, abre una ventana aislada de Chrome o Edge y evita procesos duplicados.

## Contexto en capas

El Command Center y cada app generada usan índices cortos (`CLAUDE.md` y `AGENTS.md`), una skill
canónica, árbol de conocimiento, plan y memoria. El agente entra por el índice y abre únicamente la
rama necesaria, en lugar de mezclar información vieja o cargar el repo entero.

## Experiencia multidispositivo

Las apps conservan una preferencia `mobile`, `desktop` o `balanced`. No limita dispositivos: indica
dónde priorizar navegación, densidad y acciones frecuentes. Vite + React sigue siendo la base y toda
pantalla se verifica al menos a 360, 768 y 1440 píxeles, con tacto, mouse y teclado.

## Prompt Foundry

Foundry ensambla contratos a partir del modo, el objetivo, contexto Git saneado, reglas de
verificación y memoria. Soporta uno o varios proyectos, omite rutas absolutas, trata metadatos como no
confiables y agrega un guard cuando detecta migraciones Supabase.

La interfaz permite escoger Codex o Claude y los modos `audit`, `build`, `document`, `fix`, `improve`,
`plan` o `review`. El contrato puede copiarse o entregarse al lanzador seguro.

## Memoria viva

La memoria es Markdown plano:

- `00-inbox`: capturas rápidas;
- `10-projects`: mapas de proyectos;
- `20-knowledge`: decisiones y conocimiento duradero;
- `30-directives`: pendientes humanos;
- `50-sessions`: lanzamientos de agentes;
- `90-reports`: cierres significativos.

Los mismos archivos se pueden abrir con Obsidian. El grafo interpreta `[[wikilinks]]` sin base de datos.
Los chats pueden resumirse o terminar; los archivos siguen siendo la fuente de verdad.

## Ollama y Agent Ops

Ollama es opcional y solo se consulta en loopback. Si no está disponible, el HUD lo informa y mantiene
operativos memoria, grafo, Foundry y proyectos. Agent Ops restringe los ejecutables a Codex o Claude,
acepta solo proyectos registrados, no usa shell y registra cada lanzamiento en la memoria local.

## Forma de trabajo

1. **Plan:** explorar dirigido y acordar fases en cambios grandes.
2. **Hacer:** implementar una fase y verificarla antes de la siguiente.
3. **Revisar:** correctness, seguridad, simplicidad y código muerto.
4. **Documentar:** actualizar árbol, plan, gotchas y memoria.
5. **Cerrar:** lint, pruebas, build, flujo real y handoff verificable.

## Supabase para aplicaciones futuras

El Command Center no usa Supabase. El starter opcional incluye Auth, RLS y pruebas de base de datos
para productos que necesiten cuentas o datos compartidos. La cadena local en Docker es obligatoria
antes de conectar un proyecto remoto; producción nunca es sustituto de una verificación local.

## Escritorio en Windows

El acceso directo del Command Center levanta una única API local, sirve el build y abre una ventana
`--app` con perfil aislado. Detenerlo conserva la memoria. Las apps generadas tienen su propio lanzador
y, si usan el preset Supabase, administran su stack local por separado.
