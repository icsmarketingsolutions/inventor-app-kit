# Primer prompt para una computadora nueva

Instalá primero la aplicación oficial de Codex para Windows, abrí una tarea local y pegá todo este
bloque. Es el arranque recomendado para una computadora que nunca se usó para desarrollar.

```text
Quiero preparar esta computadora Windows desde cero para inventar aplicaciones con este kit público:
https://github.com/icsmarketingsolutions/inventor-app-kit

Trabajá conmigo en español sencillo. Yo estoy aprendiendo: explicá qué hace cada paso y verificá el
resultado real. Nunca me pidás que pegue un secreto en el chat.

RESULTADO PRINCIPAL
- Clonar y verificar el kit público.
- Instalar INVENTOR O.S. Command Center como aplicación de escritorio.
- Abrir su memoria Markdown, grafo, Prompt Foundry y gestión de proyectos sin Supabase ni Docker.
- Dejar listo el ciclo: idea -> memoria -> prompt -> agente -> verificación -> reporte.
- Preparar herramientas futuras sin conectar producción, dominio ni una base remota.

REGLAS NO NEGOCIABLES
- No muestres contraseñas, tokens, cookies, códigos 2FA, recovery codes, llaves SSH, claves de
  Supabase ni contenidos de `.env`. Informá solo presente/ausente.
- Usá páginas, instaladores y documentación oficiales.
- Antes de instalar, elevar permisos, reiniciar o crear cuentas, explicá el cambio y pedime aprobación.
- No hagas deploy, compras, DNS, repos remotos ni proyectos Supabase en esta sesión.
- No sobrescribas carpetas ni descartes cambios Git.
- No uses npm como administrador ni instales Supabase CLI globalmente.
- Yo completo OAuth y 2FA personalmente en el navegador.
- Leé la salida completa: exit code 0 no sustituye comprobar warnings, puertos o procesos fallidos.

FASE 1 — DIAGNÓSTICO DE SOLO LECTURA
1. Detectá versión de Windows, PowerShell, Node, npm, Git, GitHub CLI, Codex, Docker Desktop,
   Obsidian y Ollama sin imprimir identidad ni datos privados.
2. Separá los resultados en: requerido para Command Center, opcional y futuro para apps con Supabase.
3. Mostrame qué falta, fuente oficial, versión recomendada y si requiere reinicio.

FASE 2 — MÍNIMO REQUERIDO
1. Comprobá `winget` con el Windows PowerShell incluido. Si falta, abrí la ficha oficial de App
   Installer en Microsoft Store y dejame completar la instalación.
2. Mostrame el dry-run y pedime aprobación para instalar, solo si faltan:
   - Microsoft.PowerShell
   - Git.Git
   - OpenJS.NodeJS.LTS, rama Node 24
   - GitHub.cli
3. Instalá únicamente lo aprobado con `winget --exact --source winget`.
4. Refrescá PATH cerrando y abriendo terminal/Codex cuando sea necesario.
5. Verificá `pwsh --version`, `git --version`, `node --version`, `npm --version` y `gh --version`.

FASE 3 — CLON SEGURO
1. Proponé `C:\Proyectos\inventor-app-kit`. Si existe, inspeccionala y frená; no la sobrescribas.
2. Cloná `https://github.com/icsmarketingsolutions/inventor-app-kit.git`.
3. Verificá remote esperado, rama `main` y worktree limpio.
4. Leé `README.md`, `START_HERE.md`, `apps/command-center/CLAUDE.md`,
   `apps/command-center/AGENTS.md`, `apps/command-center/.agents/skills/inventor-os/SKILL.md` y
   `apps/command-center/docs/ARBOL_CONOCIMIENTO.md`.

FASE 4 — CALIDAD DEL REPO PÚBLICO
En `C:\Proyectos\inventor-app-kit` ejecutá y revisá:
1. `npm ci`
2. `npm --prefix apps/command-center ci`
3. `npm run verify`
4. `npm run os:verify`
5. `npm audit`
6. `npm --prefix apps/command-center audit`
7. `git status --short`
Requerido: pruebas, lint y build pasan; cero warnings, cero vulnerabilidades y worktree limpio.

FASE 5 — INSTALAR INVENTOR O.S.
1. Ejecutá `npm run os:install`.
2. Verificá cada acceso directo del Escritorio y menú Inicio.
3. Abrilo con `npm run os:start`; no debe iniciar Docker ni Supabase ni mostrar una consola negra.
4. Ejecutá `npm run os:status` y confirmá una sola API local en `127.0.0.1:8421`.
5. Abrilo una segunda vez y confirmá que reutiliza la instancia.
6. En vivo verificá HUD, memoria, grafo, Foundry, proyectos y estado honesto de Ollama.
7. Guardá una captura Markdown, recargá y confirmá que persiste y actualiza el grafo.
8. Generá un prompt de modo `plan`, copialo y confirmá que no contiene rutas absolutas ni secretos.

FASE 6 — MEMORIA COMPARTIDA CON OBSIDIAN
1. Explicame dónde vive la memoria local sin imprimir otros datos personales.
2. Si quiero interfaz de notas, proponé instalar Obsidian desde su fuente oficial y pedime aprobación.
3. Abrí esa carpeta como vault. No actives Sync ni plugins comunitarios automáticamente.
4. Confirmá que una nota creada en Obsidian aparece en el HUD y su `[[wikilink]]` en el grafo.

FASE 7 — CUENTAS Y GIT
1. Guiame para crear o asegurar GitHub con 2FA y recovery codes guardados fuera del repo.
2. Configurá Git con mi correo `noreply` de GitHub sin mostrarlo en el chat.
3. Ejecutá `gh auth login`; yo completo OAuth.
4. Verificá la sesión sin imprimir token o identidad innecesaria.
5. No crees todavía repos remotos. Cada invento tendrá su repo cuando exista una decisión de producto.

FASE 8 — OLLAMA LOCAL OPCIONAL
1. Explicame costo de disco/RAM y que Ollama no es necesario para memoria o Foundry.
2. Solo si lo apruebo, instalalo desde la fuente oficial y elegí un modelo pequeño apropiado para el
   hardware; pedime aprobación antes de descargarlo.
3. Verificá el servicio únicamente en localhost y una conversación desde la consola del HUD.
4. No expongas Ollama a la red local ni Internet.

FASE 9 — CREAR EL PRIMER PRODUCTO, SOLO SI YO LO PIDO
1. Preguntame de una en una: nombre, problema, persona usuaria, primera acción útil, prioridad
   móvil/escritorio/equilibrada y carpeta destino.
2. Registrá primero la decisión en la memoria y generá un prompt `plan` en Foundry.
3. Tras mi confirmación, usá el generador documentado en `START_HERE.md` para crear otro repo Vite +
   React + TypeScript, responsive a 360, 768 y 1440 píxeles.
4. Decidí Supabase por necesidad: usarlo solo si el producto necesita autenticación o datos compartidos.
   Una app puramente local no debe recibir complejidad de nube por defecto.
5. Verificá lint, pruebas, build y flujo real de la nueva app.

FASE 10 — HERRAMIENTAS FUTURAS, NO EJECUTAR AHORA
Dejame una lista priorizada, sin instalar ni conectar:
- WSL 2 y Docker Desktop para probar migraciones Supabase localmente;
- cuenta/proyecto Supabase DEV y MCP por OAuth limitado al `project_ref`, `read_only=true` al explorar;
- MCPs adicionales solo cuando una integración concreta los necesite;
- Cloudflare/hosting y dominio solo después de una app validada, con costos y revisión DNS;
- observabilidad, correo y pagos después del primer flujo útil.

CIERRE
Entregame una tabla corta por fase: verificada en vivo, pendiente o bloqueada. Incluí versiones, pruebas,
warnings y ubicación del Command Center. Confirmá que no mostraste secretos, no tocaste producción,
no desplegaste, no cambiaste DNS y no conectaste Supabase remoto. Dejame el próximo paso recomendado.
```

La URL del bloque es pública. Las decisiones, proyectos y memoria real se crean en la computadora de
la persona y nunca se copian desde otra instalación.
