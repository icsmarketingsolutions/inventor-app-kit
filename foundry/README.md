# Prompt Foundry

Prompt Foundry convierte un objetivo breve en un contrato de trabajo que una IA
puede ejecutar y verificar. No copia el repositorio al prompt: señala las fuentes
de verdad y agrega solo conteos Git saneados. Omite rutas absolutas, ramas,
nombres de archivos y mensajes de commit porque son privados y no confiables.
Además incorpora un contrato multidispositivo: la preferencia móvil o escritorio
define prioridades, pero no permite romper el otro contexto.

## Modos

- `plan`: explora y propone fases verificables sin implementar.
- `build`: implementa un plan aprobado fase por fase.
- `fix`: reproduce, corrige y prueba un fallo concreto.
- `review`: revisa un diff sin modificarlo.
- `audit`: busca riesgos de manera exhaustiva y priorizada.
- `document`: sincroniza conocimiento, memoria y handoff.

## Uso

```powershell
node ./scripts/foundry.mjs --list-modes

node ./scripts/foundry.mjs `
  --project . `
  --mode plan `
  --objective "Agregar fotografías a los inventos" `
  --out PROMPT_ACTUAL.md
```

`--project` se puede repetir para coordinar varios repos. En ese caso agregá una
etiqueta segura y única por proyecto:

```powershell
node ./scripts/foundry.mjs `
  --project '../app-web' --label frontend `
  --project '../app-api' --label backend `
  --mode plan --objective "Coordinar el cambio"
```

El prompt conserva esas etiquetas y rutas relativas operables, pero nunca rutas
absolutas. Sin `--out`, se imprime en la terminal. Foundry no lee `.env`,
credenciales ni el contenido completo de la memoria.
