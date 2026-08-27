# Prompt para preparar una computadora nueva con ayuda de Codex

Pegá el bloque siguiente en una conversación nueva de Codex abierta sobre la
carpeta `inventor-app-kit`.

```text
Quiero preparar esta computadora Windows para usar inventor-app-kit.

Leé primero setup/COMPUTADORA_NUEVA.md, setup/MCP_Y_CUENTAS.md y los dos scripts
scripts/check-machine.ps1 y scripts/bootstrap-windows.ps1.

Trabajá en este orden:
1. Ejecutá scripts/check-machine.ps1. Es un diagnóstico de solo lectura.
2. Explicame en español sencillo únicamente lo que aparezca como FALTA.
3. Ejecutá scripts/bootstrap-windows.ps1 SIN -Install para mostrar el dry-run.
4. Frená y pedime aprobación antes de ejecutar cualquier instalación.
5. Si apruebo, usá -Install. No crees cuentas ni cambies configuración remota.
6. Después del reinicio, repetí el chequeo y guiame por los pasos manuales de
   GitHub, 2FA, Docker, Codex, Supabase DEV y OAuth.
7. Para Supabase MCP, usá un único proyecto de desarrollo, project_ref explícito,
   read_only=true y features=database,docs.
8. Verificá con una consulta de lectura. No pruebes escrituras.

Reglas de seguridad:
- Nunca me pidas que pegue contraseñas, tokens, cookies, códigos 2FA, claves de
  recuperación ni el contenido de archivos .env en el chat o la terminal.
- Nunca imprimas valores secretos. Solo podés informar presente/ausente.
- No conectes Supabase de producción.
- No hagas deploy, no compres dominios y no cambies DNS en esta sesión.
- Si un paso abre OAuth, dejame completarlo personalmente en el navegador.
- Si una acción requiere administrador, reinicio o crea un costo, avisame antes.

El resultado esperado es que check-machine.ps1 quede sin FALTA y que el MCP de
Supabase solo pueda leer el proyecto DEV elegido.
```

Este prompt no contiene datos personales ni referencias de proyectos. Codex
debe descubrir el estado de la computadora mediante el chequeo local y mantener
los inicios de sesión en el navegador.
