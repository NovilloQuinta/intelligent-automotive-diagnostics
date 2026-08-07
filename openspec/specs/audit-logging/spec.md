# Audit Logging

## Purpose

Registro automático y asíncrono de requests HTTP en tabla `audit_logs` (método, ruta, status, IP, user agent, duración), con fallos de escritura que no bloquean la respuesta al cliente.

## Requirements

### Requirement: Registro automatico de requests HTTP
El sistema SHALL registrar en la tabla `audit_logs` cada request HTTP procesado por la API, incluyendo metodo, ruta, codigo de estado, IP, user agent, duracion y timestamp.

#### Scenario: Request exitoso registrado
- **WHEN** un cliente hace una peticion GET a /api/scenarios que responde 200
- **THEN** se inserta un registro en `audit_logs` con method=GET, path=/api/scenarios, statusCode=200

#### Scenario: Request con error registrado
- **WHEN** un cliente hace una peticion POST a un endpoint inexistente que responde 404
- **THEN** se inserta un registro en `audit_logs` con statusCode=404

### Requirement: El audit logging no debe bloquear la respuesta
El sistema SHALL escribir el registro de auditoria de forma asincrona sin bloquear el envio de la respuesta HTTP al cliente.

#### Scenario: Respuesta enviada antes del write a BD
- **WHEN** un cliente hace una peticion y la BD de auditoria tarda 500ms en responder
- **THEN** la respuesta HTTP se envia al cliente sin esperar al write del audit log

### Requirement: Fallo de auditoria no rompe el request
El sistema SHALL capturar errores del write de auditoria sin propagarlos al response, logueando el fallo a consola.

#### Scenario: Error de BD en audit log
- **WHEN** la tabla `audit_logs` no existe y se intenta escribir un registro
- **THEN** la peticion del cliente se completa normalmente (sin error 500) y el error se loguea a stderr

### Requirement: Repositorio de audit logs consultable
El sistema SHALL proporcionar un repositorio `AuditLogRepository` con metodos para insertar registros de auditoria, usando Drizzle ORM sobre SQLite.

#### Scenario: Insercion de un registro de auditoria
- **WHEN** se llama a `auditLogRepository.create({ method, path, statusCode, ip, userAgent, durationMs })`
- **THEN** el registro se inserta en la tabla `audit_logs` y se devuelve con un `id` autoincremental
