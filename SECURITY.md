# Seguridad

## Secretos

Este repositorio no necesita secretos para generar una app. En los proyectos
creados:

- copiá `.env.example` a `.env`;
- usá solamente la URL y la clave publicable en el navegador;
- nunca pongás `service_role`, claves secretas, contraseñas o tokens en archivos
  rastreados por Git;
- revisá `git status` antes de cada commit.

## Supabase MCP

Conectalo únicamente a un proyecto de desarrollo, limitado a ese proyecto y
revisando cada aprobación de herramienta en la interfaz. No conectés el MCP a producción ni a datos
reales.

## Reportar una vulnerabilidad

En un fork público, habilitá y usá la sección **Security advisories** del
repositorio en GitHub. No publiques claves, tokens ni datos personales en un issue.
