# Spec — e2e-tests

Tests E2E con Playwright para el dashboard de diagnóstico automotriz.

## Requirements

### Requirement: Registro de usuario nuevo
El sistema SHALL permitir a un usuario nuevo registrarse desde la UI y ser redirigido al dashboard.

#### Scenario: Registro exitoso
- **GIVEN** un usuario no autenticado en `/login`
- **WHEN** navega a la pestaña "Registrarse", rellena username/email/password, selecciona tipo "individual" y pulsa "Crear cuenta"
- **THEN** la API devuelve 200 con tokens, el usuario es redirigido a `/` y ve el dashboard con telemetría en vivo

### Requirement: Login con credenciales válidas
El sistema SHALL autenticar a un usuario con credenciales correctas y mostrar el dashboard.

#### Scenario: Login exitoso
- **GIVEN** un usuario registrado en el sistema
- **WHEN** introduce email y contraseña correctos y pulsa "Iniciar sesión"
- **THEN** recibe tokens JWT, es redirigido a `/`, y ve el selector de vehículos, telemetría y botón de diagnóstico

### Requirement: Login con credenciales inválidas
El sistema SHALL mostrar un error cuando las credenciales son incorrectas.

#### Scenario: Error de autenticación
- **GIVEN** un usuario en `/login`
- **WHEN** introduce credenciales incorrectas y pulsa "Iniciar sesión"
- **THEN** se muestra un mensaje de error en rojo, el usuario permanece en `/login`

### Requirement: Cambio de vehículo
El sistema SHALL permitir cambiar entre los escenarios de vehículo disponibles.

#### Scenario: Cambio de Audi a Kawasaki
- **GIVEN** un usuario autenticado con el Audi A3 seleccionado por defecto
- **WHEN** abre el selector de vehículos y selecciona "Kawasaki Z900"
- **THEN** los valores de telemetría cambian (RPM ~4500, refrigerante ~105°C), y el selector muestra "Kawasaki Z900"

### Requirement: Diagnóstico con DTCs
El sistema SHALL ejecutar diagnóstico y mostrar DTCs detectados.

#### Scenario: Diagnóstico del Audi A3
- **GIVEN** el Audi A3 seleccionado (tiene DTC P0301)
- **WHEN** el usuario pulsa "Iniciar diagnóstico"
- **THEN** el panel DTC muestra "1 registrado" con código "P0301", y el panel de diagnóstico IA muestra severidad "ALTA"

### Requirement: Diagnóstico sin DTCs
El sistema SHALL ejecutar diagnóstico en un vehículo sin fallos y mostrar resultado limpio.

#### Scenario: Diagnóstico de la Kawasaki Z900
- **GIVEN** la Kawasaki Z900 seleccionada (sin DTCs)
- **WHEN** el usuario pulsa "Iniciar diagnóstico"
- **THEN** el panel DTC muestra "0 registrados" o "—", y el diagnóstico no muestra severidad alta

### Requirement: Logout
El sistema SHALL cerrar la sesión y redirigir al login.

#### Scenario: Cierre de sesión
- **GIVEN** un usuario autenticado en el dashboard
- **WHEN** pulsa el botón "Cerrar sesión"
- **THEN** los tokens se eliminan de localStorage, el usuario es redirigido a `/login`, y ve el formulario de login
