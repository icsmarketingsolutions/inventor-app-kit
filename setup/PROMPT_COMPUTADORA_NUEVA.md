# Primer prompt para una computadora nueva

Este es el primer mensaje que se pega en Codex cuando la computadora de tu papá todavía no tiene
el kit. Instalá primero la aplicación oficial de Codex para Windows, abrí una tarea local y pegá
todo el bloque. Codex hará el diagnóstico antes de instalar o cambiar nada.

```text
Quiero preparar esta computadora Windows desde cero para inventar aplicaciones con este kit público:
https://github.com/icsmarketingsolutions/inventor-app-kit

Trabajá conmigo en español sencillo. Yo estoy aprendiendo: explicá qué hace cada paso y esperá mi
aprobación cuando lo indique este plan. Nunca me pidás que pegue un secreto en el chat.

OBJETIVO FINAL
- Tener Git, GitHub CLI, Node.js 24 LTS actualizado, PowerShell 7, WSL 2, Docker Desktop y Codex.
- Clonar y verificar inventor-app-kit sin modificarlo accidentalmente.
- Crear mi primera app Vite + React + TypeScript, usable en móvil y escritorio.
- Probar Supabase completamente en Docker local antes de conectar cualquier proyecto remoto.
- Dejar memoria, Prompt Foundry, reglas de trabajo y pruebas listos para continuar otro día.

REGLAS NO NEGOCIABLES
- No muestres ni me pidás contraseñas, tokens, cookies, códigos 2FA, recovery codes, llaves SSH,
  claves de Supabase ni contenidos de archivos .env. Solo informá presente/ausente.
- Usá únicamente páginas, instaladores y documentación oficiales.
- No ejecutes instaladores, comandos como administrador, reinicios, compras ni acciones remotas sin
  explicarme exactamente qué cambiarán y recibir mi aprobación.
- No conectes producción. No hagas deploy. No compres dominios. No cambies DNS.
- No crees ni modifiques todavía un proyecto remoto de Supabase.
- No sobrescribas carpetas existentes ni descartes cambios de Git.
- No uses npm como administrador. No instales la CLI de Supabase globalmente.
- Si OAuth o 2FA abre un navegador, yo completo personalmente la pantalla.
- Verificá la salida real de cada comando; un exit code 0 no basta si hay errores de Docker,
  contenedores reiniciándose, puertos ocupados o warnings.

FASE 1 — DIAGNÓSTICO DE SOLO LECTURA
1. Detectá la versión de Windows, PowerShell, Node, npm, Git, GitHub CLI, WSL, Docker y Codex sin
   imprimir datos privados.
2. Decime únicamente qué falta, qué está desactualizado y si hace falta reiniciar.
3. Antes de instalar, mostrame una lista exacta con fuente oficial, versión y motivo.

FASE 2 — REQUISITOS MÍNIMOS EN WINDOWS LIMPIO
1. Usá primero el Windows PowerShell incluido en Windows para comprobar si winget está disponible.
2. Si winget falta, abrí la ficha oficial de App Installer en Microsoft Store y dejame completar la
   instalación. No descargues ejecutables desde buscadores.
3. Mostrame el dry-run de estos dos paquetes oficiales y pedime aprobación:
   - Microsoft.PowerShell
   - Git.Git
4. Solo si apruebo, instalalos con winget usando --exact y --source winget.
5. Cerrá y volvé a abrir Codex o la terminal para refrescar PATH. Confirmá que `pwsh --version` y
   `git --version` funcionan antes de intentar clonar.

FASE 3 — CLON SEGURO DEL KIT
1. Proponé C:\Proyectos\inventor-app-kit como ruta. Si ya existe, inspeccionala y frená: no la
   sobrescribas ni la borres.
2. Cloná con Git desde la URL pública anterior.
3. Entrá al repositorio y verificá:
   - git remote -v apunta únicamente a la URL pública esperada;
   - la rama es main;
   - git status está limpio.
4. Leé README.md, START_HERE.md, setup/COMPUTADORA_NUEVA.md,
   setup/MCP_Y_CUENTAS.md y scripts/check-machine.ps1 antes de continuar.

FASE 4 — PREPARAR WINDOWS
1. Corré este diagnóstico de solo lectura:
   pwsh -NoProfile -File ./scripts/check-machine.ps1
2. Corré el bootstrap sin -Install; esto debe ser solo un dry-run:
   pwsh -NoProfile -File ./scripts/bootstrap-windows.ps1
3. Mostrame el plan y frená para pedirme aprobación.
4. Solo si apruebo, ejecutá el bootstrap con -Install desde PowerShell 7 como administrador.
5. Si requiere reinicio, frená. Después del reinicio repetí check-machine.ps1 desde una terminal
   normal.
6. Abrí Docker Desktop, esperá el motor y verificá de verdad:
   docker run --rm hello-world

FASE 5 — VERIFICAR EL REPOSITORIO PÚBLICO
Dentro de C:\Proyectos\inventor-app-kit ejecutá y revisá la salida completa:
1. npm ci
2. npm run verify
3. npm audit
4. git status --short
El resultado requerido es: todas las pruebas pasan, cero warnings, cero vulnerabilidades y worktree
limpio. Si algo falla, diagnosticá y corregí solo dentro de este repositorio; no sigás de fase.

FASE 6 — CUENTAS Y CODEX
1. Guiame para crear o asegurar mi cuenta GitHub con 2FA y recovery codes guardados fuera del repo.
2. Configurá Git con mi correo noreply de GitHub sin mostrarlo en pantalla.
3. Iniciá gh auth login y Codex mediante el navegador; yo completo OAuth.
4. Verificá las sesiones sin imprimir identidad o credenciales.
5. Explicame que cada app generada traerá su propio AGENTS.md y memory/INDEX.md; todavía no los busqués
   en la raíz del kit ni inventés una segunda fuente de verdad.

FASE 7 — CREAR MI PRIMERA APP
1. Preguntame, una por una, estas seis cosas: nombre de la app, problema que resuelve, usuario
   principal, primera acción útil, experiencia prioritaria (móvil/escritorio/equilibrada) y ruta de
   destino.
2. Resumí mis respuestas y pedime confirmación antes de generar.
3. Generá la app con el comando documentado en START_HERE.md. La base debe seguir siendo Vite + React
   + TypeScript; la prioridad responsive es mi preferencia, pero debe funcionar desde 320 px hasta
   escritorio, con teclado y controles táctiles.
4. Dentro de la app generada corré npm ci, npm run lint, npm test, npm run build y npm audit.
   Requerido: cero warnings, cero fallos y cero vulnerabilidades.
5. Leé CLAUDE.md, AGENTS.md, .agents/skills/build-an-app/SKILL.md, memory/INDEX.md y
   docs/ARBOL_CONOCIMIENTO.md. Mostrame cómo usar Prompt Foundry, las funciones, la memoria y el
   ciclo plan -> implementar -> probar -> documentar -> commit.

FASE 8 — SUPABASE LOCAL, DESDE CERO
1. Confirmá que Docker está sano y que ningún stack de esta app quedó ejecutándose.
2. En la app generada ejecutá, leyendo la salida completa:
   npx --no-install supabase start
   npx --no-install supabase db reset
   npx --no-install supabase test db
   npx --no-install supabase db lint --local --schema public --level warning --fail-on warning
   npx --no-install supabase db advisors --local --type security --level info --fail-on warn
3. Confirmá que todas las pruebas pgTAP pasan, RLS está activa, anon no tiene CRUD, cada usuario solo
   ve sus datos y no hay contenedores reiniciándose.
4. Usá solo la URL y llave publicable locales como variables de entorno. Nunca service_role.
5. Al terminar ejecutá npx --no-install supabase stop --no-backup y comprobá que no queden contenedores, redes ni
   volúmenes de ese stack.
6. Si Docker o Supabase falla, frená. Nunca uses un Supabase remoto como sustituto.

FASE 9 — PRUEBA REAL EN NAVEGADOR
1. Arrancá primero la app sin variables de Supabase y probá el modo demo. Detenela después.
2. Reiniciala con las variables publicables del Supabase local.
3. En un navegador real probá: crear cuenta local, iniciar sesión, crear/editar/eliminar un
   invento, cerrar sesión y aislamiento con una segunda cuenta.
4. Verificá a 360, 768 y 1440 px; recorré foco con teclado y comprobá que no haya errores visibles ni
   en consola.
5. Cerrá el servidor y el stack local al terminar.

CIERRE
Entregame una tabla breve con cada fase: verificada en vivo, pendiente o bloqueada. Incluí versiones
instaladas, pruebas ejecutadas, cualquier warning y la ruta exacta de la primera app. Confirmá que no
mostraste secretos, no tocaste producción, no desplegaste y no cambiaste DNS. Dejame el siguiente
paso recomendado, pero no lo ejecutes sin aprobación.

Solo después de que todo lo local esté verde, proponé una sesión separada para:
- crear un proyecto Supabase exclusivamente DEV;
- conectar su MCP por OAuth con project_ref explícito, read_only=true y features=database,docs;
- crear un repositorio GitHub privado para mi primera app;
- preparar deploy y dominio con una revisión de costos y DNS.
```

El prompt contiene solo la URL pública del kit. Las decisiones personales y las sesiones se completan
en la computadora nueva; no se copian desde otra computadora.
