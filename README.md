# Inventor App Kit

Un sistema portable para convertir una idea en una aplicación sin empezar de
cero cada vez. El kit reúne cuatro piezas:

1. **Prompt Foundry:** arma instrucciones claras y verificables para Codex o
   Claude a partir del proyecto real.
2. **Memoria viva:** decisiones, conocimiento, directivas y reportes en Markdown.
3. **Método de trabajo:** planificar, construir, verificar, documentar y cerrar.
4. **Fundación técnica:** Vite, React, TypeScript, Supabase, RLS, pruebas y CI.

No contiene cuentas, credenciales, proyectos ni datos de ninguna persona. Cada
usuario crea su propia memoria y sus propios proyectos.

## Por dónde empezar

- **La primera computadora de tu papá:** pegá el
  [primer prompt completo](setup/PROMPT_COMPUTADORA_NUEVA.md) en Codex.
- **Computadora Windows nueva:** seguí [setup/COMPUTADORA_NUEVA.md](setup/COMPUTADORA_NUEVA.md).
- **Windows con las herramientas listas:** abrí [START_HERE.md](START_HERE.md).
- **Querés entender el sistema:** leé [docs/COMO_FUNCIONA.md](docs/COMO_FUNCIONA.md).

## Qué crea

El generador produce un repo independiente con:

- una aplicación funcional para registrar inventos;
- una preferencia inicial para móvil, escritorio o uso equilibrado, sin excluir
  ningún tamaño de pantalla;
- autenticación y datos en Supabase;
- migración reproducible, RLS y pruebas de base de datos;
- `CLAUDE.md`, `AGENTS.md`, plan, árbol y skill;
- memoria semilla versionada que debe mantenerse sanitizada;
- manifiesto PWA y accesos directos de Windows que levantan los servicios locales;
- lint, pruebas, build y GitHub Actions.

La primera ejecución inicializa Git local, pero no toca GitHub, Supabase remoto
ni un dominio. Esas acciones
se hacen después, con aprobación y siguiendo el checklist del proyecto.
Los textos dados al generador quedan versionados en la app; deben describir el
producto sin datos personales, información de clientes ni secretos.

## Comandos principales

```powershell
# Revisar si la computadora está lista
pwsh -NoProfile -File ./scripts/check-machine.ps1

# Crear una aplicación nueva
pwsh -NoProfile -File ./scripts/New-InventorApp.ps1 `
  -Name "Mis inventos" `
  -Slug "mis-inventos" `
  -Problem "Quiero ordenar ideas y convertirlas en prototipos" `
  -Audience "Mi familia y yo" `
  -FirstAction "Registrar un invento" `
  -PrimaryUse "balanced" `
  -OutputRoot "C:\Proyectos"

# Forjar un prompt para trabajar en ella
node ./scripts/foundry.mjs `
  --project "C:\Proyectos\mis-inventos" `
  --mode plan `
  --objective "Agregar fotos a cada invento" `
  --out .foundry-output/PROMPT_ACTUAL.md
```

## Principios

- Un proyecto por repo y una conversación dedicada por proyecto.
- Contexto en capas; nunca cargar todo para “entender”.
- Las decisiones viven en archivos, no en la memoria de un chat.
- Cambios grandes empiezan con un plan aprobado.
- Compilar no basta: cada flujo se prueba funcionando.
- La experiencia principal define prioridades, no compatibilidad: toda interfaz
  debe funcionar con tacto, mouse y teclado en móvil, tableta y escritorio.
- Supabase remoto y producción nunca se modifican sin aprobación explícita.
- Secretos solo en `.env`; jamás en Git ni en prompts.

## Alcance de `v0.3.0`

Incluye onboarding y diagnóstico verificados para Windows. El generador usa
PowerShell 7 y Foundry usa Node, por lo que una persona avanzada puede ejecutarlos
en macOS/Linux después de preparar equivalentes manuales; esa ruta todavía no
tiene onboarding ni smoke oficial en `v0.3.0`. El starter usa Supabase local con Docker antes de conectar
un proyecto remoto. En Windows también puede instalar accesos directos y abrirse como PWA en una ventana
independiente; pagos, correo, observabilidad y automatizaciones se agregan cuando el primer flujo ya está
validado.

## Licencia

[MIT](LICENSE). Podés forkear, adaptar y compartir el kit.
