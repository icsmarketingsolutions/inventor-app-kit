# Árbol de conocimiento

## Producto

INVENTOR O.S. es la aplicación principal del kit. Coordina proyectos y agentes desde una ventana
local. El generador de aplicaciones y el preset Supabase continúan como herramientas secundarias.

## Runtime

```text
React/Vite :5173 --proxy--> Node API :8322       desarrollo
Chrome app :8421 <---------- Node API + dist      escritorio
                               |
                               +-- memoria Markdown local
                               +-- proyectos Git registrados
                               +-- Prompt Foundry
                               +-- Ollama loopback opcional
                               +-- whisper.cpp local opcional
                               +-- Codex/Claude permitidos
```

`INVENTOR_OS_HOME` selecciona los datos. Si falta, Windows usa su carpeta local de aplicación. El
primer arranque copia `memory-seed/`; la memoria real nunca entra al Git público.

## Memoria

- `00-inbox`: capturas rápidas.
- `10-projects`: notas-mapa de proyectos.
- `20-knowledge`: decisiones y conocimiento duradero.
- `30-directives`: checkboxes humanos.
- `50-sessions`: lanzamientos y resultados.
- `90-reports`: cierres significativos.

El HUD y Obsidian editan los mismos `.md`. El grafo interpreta `[[nota]]` y usa la ruta relativa como
identidad estable. Toda lectura/escritura valida contención y rechaza escapes o enlaces fuera del vault.

## Proyectos y Foundry

El registro local guarda únicamente proyectos elegidos por la persona. System Vitals obtiene estado
Git con procesos sin shell. Foundry ensambla modos y bloques versionados desde `../../foundry/`, trata
metadatos Git como no confiables y puede coordinar varios repos. Solo muestra rutas relativas de
proyectos contenidos en el workspace; para proyectos externos omite toda la jerarquía local.

## IA local y agentes

Ollama se consulta solo en `127.0.0.1`/`localhost`; si no está, el HUD conserva todas las funciones
deterministas. Los lanzamientos aceptan únicamente Codex o Claude, un proyecto registrado y una
confirmación explícita. Cada sesión se registra como Markdown.
Los CLI se resuelven a una ruta absoluta desde `PATH` antes de cambiar `cwd`; un ejecutable plantado
dentro del proyecto se rechaza.

## Voz local

El navegador pide el micrófono solo después de pulsar `GRABAR`, captura PCM mono y lo remuestrea a
WAV de 16 kHz/16 bits. `POST /api/transcription` exige el Origin local exacto, un único RIFF/fmt/data,
5 MiB y 120 segundos máximos antes de ejecutar una ruta fija de `whisper-cli` sin shell. El mutex se
reserva antes de cualquier espera. Cancelar mata el proceso y aguarda su cierre; audio y salidas viven
en una carpeta privada cuya eliminación se reintenta y confirma antes de responder. La transcripción
solo se guarda en memoria cuando la persona pulsa `MEMORIA`.

`npm run voice:install` descarga un release fijado de `whisper.cpp` y una revisión fija del modelo
multilingüe `base`, verifica SHA-256, instala por staging con rollback y deja solo el runtime necesario
fuera de Git. Antes de cada uso el servidor revalida ejecutable, DLL y modelo contra hashes embebidos.
No hay fallback cloud; Foundry y memoria siguen funcionando si el motor falta o su integridad falla.

## Selector de proyectos

`BUSCAR CARPETA…` llama `POST /api/system/select-folder`, que exige Origin local exacto y reserva un
único selector. Node ejecuta por ruta absoluta un helper PowerShell fijo, en STA y sin shell; la ruta
inicial viaja por stdin. El helper usa `IFileOpenDialog` con `FOS_PICKFOLDERS`, encuentra la ventana
exacta de INVENTOR O.S. y la pasa como propietaria para que el Explorador moderno aparezca delante y
modal. Cancelar es un resultado normal. Helper y API revalidan carpeta absoluta, existente, en unidad
local fija y sin enlaces o puntos de reanálisis en sus ancestros antes de devolverla; el campo manual
permanece disponible.

## Escritorio

El acceso directo usa VBS silencioso y PowerShell. Valida que `:8421` pertenezca a INVENTOR O.S.,
inicia un único proceso Node, abre o enfoca una ventana Chromium con perfil aislado y conserva memoria
al detener. Docker y Supabase no participan.

## Calidad y seguridad

- Oxlint sin warnings, Vitest/Node tests y build TypeScript.
- API loopback con Host/Origin de mismo origen, CSP, JSON y límites estrictos.
- Micrófono permitido solo al mismo origen; audio raw WAV, origen obligatorio y proceso cancelable.
- Selector nativo con proceso único, propietario explícito, stdin privado y sin comandos construidos.
- Notas externas mayores de 2 MiB se listan como sobredimensionadas, pero no se cargan en búsqueda,
  grafo o editor.
- Sin shell arbitrario, SSRF, rutas absolutas en errores ni secretos en logs.
- Privacy gate de la raíz antes de publicar.
