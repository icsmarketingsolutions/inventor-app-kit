# Changelog

## 0.3.0 — 2026-08-27

- Cada app generada incluye manifiesto PWA y abre en una ventana independiente de Chrome o Edge.
- Instalador Windows crea accesos directos en Escritorio y menú Inicio sin requerir administrador.
- El lanzador silencioso inicia Docker Desktop, Supabase local y Vite, evita duplicados y conserva las
  credenciales publicables locales solo en memoria.
- Comandos separados permiten consultar estado, detener los servicios sin borrar datos y desinstalar
  únicamente los accesos directos.
- El flujo de escritorio hereda el patrón probado de V.A.U.L.T. y deja logs locales ignorados por Git.
- Los iconos PNG 192/512, el manifiesto y el service worker cumplen el contrato PWA y cachean assets
  sin devolver HTML como JavaScript cuando no hay red.
- Cada app aísla `project_id`, sesión Auth, caché y perfil Chromium; el launcher rechaza Docker remoto,
  aplica migraciones locales pendientes y revierte recursos si un arranque falla.
- Inicio y apagado comparten un mutex global; `desktop:stop` valida el PID, cierra la ventana y falla
  explícitamente si algún servicio no pudo detenerse.

## 0.2.1 — 2026-08-27

- Auditoría pública multiagente: privacidad, historial, cadena de suministro, frontend y Supabase.
- Privacy gate falla cerrado si Git no puede inspeccionar el historial y ya no confunde la identidad
  local sin publicar con contenido del repositorio.
- Starter endurecido con HTTPS remoto obligatorio, errores públicos normalizados, mutaciones sin doble
  envío, timestamps de base de datos y contador identity no observable.
- CI sin credenciales Git persistentes, salida local de Supabase redactada, lint/advisors de base y
  privacy gate dentro de cada app generada.
- Dependabot semanal para npm y GitHub Actions.
- Prompt canónico para preparar la primera computadora, clonar el repo y verificar el flujo completo.

## 0.2.0 — 2026-08-27

- Vite + React queda como fundación web explícita.
- Preferencia por app para priorizar móvil, escritorio o ambos.
- Contrato responsive y accesible a 360, 768 y 1440 px en Foundry y la skill.
- CSS base mobile-first con composición adaptativa para pantallas amplias.

## 0.1.0 — 2026-08-27

- Fundación pública y saneada del kit.
- Prompt Foundry portable para uno o varios proyectos.
- Memoria semilla y método de trabajo en capas.
- Generador PowerShell seguro y reproducible.
- Starter React + TypeScript + Supabase con Auth, RLS y pgTAP.
- Onboarding para computadora nueva, MCPs, despliegue y dominio.
- Gates de portabilidad, privacidad y calidad en CI.
