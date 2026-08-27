# Plan

## Objetivo de producto

Resolver: __INVENTOR_APP_PROBLEM__

## Fase 0 — Fundación

- [x] Interfaz inicial y modo demostración.
- [x] Base responsive para móvil, tableta y escritorio.
- [x] Supabase Auth, tabla privada, RLS y pruebas.
- [ ] Verificar el flujo local completo en esta computadora.
- [ ] Confirmar en uso real que la prioridad `__INVENTOR_PRIMARY_USE__` coincide
  con el contexto principal de las personas usuarias.

## Próxima fase

- [ ] Elegir con la persona responsable el siguiente resultado observable.
- [ ] Generar un prompt en modo `plan` antes de implementarlo.

## Bloqueos antes de abrir registro público

- [ ] Implementar recuperación de contraseña y probar el enlace en el dominio final.
- [ ] Configurar SMTP y confirmación de correo en Supabase PROD.
- [ ] Definir protección contra abuso/rate limits y política de sesiones.

La versión `0.1.0` es una fundación para prototipo o beta privada. No se considera
lista para cuentas públicas hasta cerrar estos tres puntos.
