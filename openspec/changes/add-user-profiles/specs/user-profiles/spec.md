# User Profiles

## Purpose

Perfil de usuario — mecánico profesional o particular que repara su propio vehículo — que condiciona el contenido, el nivel de detalle y las advertencias de seguridad de las respuestas del diagnóstico cognitivo.

## Requirements

### Requirement: Perfil persistido en el usuario
El sistema SHALL almacenar un perfil (`mechanic` u `owner`) por usuario, elegido al registrarse y modificable después.

#### Scenario: Registro con perfil
- **GIVEN** un formulario de registro
- **WHEN** el usuario se registra eligiendo perfil de particular
- **THEN** se crea con `profile: 'owner'`

#### Scenario: Registro sin indicar perfil
- **GIVEN** una petición de registro sin perfil
- **WHEN** se procesa
- **THEN** se asigna `owner` por defecto, por ser el público menos experto y el que más protección necesita

#### Scenario: Perfil no válido
- **GIVEN** una petición de registro con un perfil fuera del conjunto permitido
- **WHEN** se procesa
- **THEN** responde 400 sin crear el usuario

#### Scenario: Cambio de perfil
- **GIVEN** un usuario autenticado
- **WHEN** cambia su perfil
- **THEN** queda persistido y se aplica a las siguientes respuestas

---

### Requirement: El perfil forma parte del contexto de diagnóstico
El sistema SHALL propagar el perfil del usuario hasta el caso de uso de diagnóstico cognitivo, formando parte del contexto con el que se construye la respuesta.

#### Scenario: El perfil llega al caso de uso
- **GIVEN** un usuario autenticado con perfil `mechanic`
- **WHEN** lanza un diagnóstico cognitivo
- **THEN** `ExecuteCognitiveDiagnosisUseCase` recibe el perfil como parte del contexto

#### Scenario: El perfil se resuelve en el servidor
- **GIVEN** una petición cuyo cuerpo declara un perfil distinto al del usuario autenticado
- **WHEN** se procesa
- **THEN** se usa el perfil resuelto en el servidor y se valida contra el conjunto cerrado de valores permitidos

#### Scenario: El perfil no concede acceso
- **GIVEN** dos usuarios con perfiles distintos
- **WHEN** ambos acceden a los endpoints de diagnóstico
- **THEN** ambos obtienen respuesta; el perfil cambia el contenido, nunca la autorización

---

### Requirement: Respuestas diferenciadas por perfil
El sistema SHALL producir respuestas con contenido distinto según el perfil, sobre el mismo diagnóstico subyacente.

#### Scenario: Respuesta a un mecánico
- **GIVEN** un vehículo con P0301 y un usuario con perfil `mechanic`
- **WHEN** consulta el diagnóstico
- **THEN** la respuesta identifica el código y el componente implicado
- **AND** indica qué comprobar y en qué orden

#### Scenario: Respuesta a un particular
- **GIVEN** el mismo vehículo con P0301 y un usuario con perfil `owner`
- **WHEN** consulta el diagnóstico
- **THEN** la respuesta indica si la avería es grave y si puede seguir conduciendo
- **AND** indica si puede repararlo él o debe acudir a un taller
- **AND** si es abordable, indica pieza necesaria, orden de magnitud del coste, dificultad y los pasos

#### Scenario: El diagnóstico subyacente es el mismo
- **GIVEN** el mismo vehículo y la misma avería
- **WHEN** se consulta con ambos perfiles
- **THEN** los códigos, valores y severidad coinciden; solo cambia la respuesta elaborada

---

### Requirement: Advertencias de seguridad deterministas
El sistema SHALL derivar las advertencias de seguridad de un catálogo del dominio indexado por características del vehículo, y no dejarlas al criterio del modelo.

#### Scenario: Vehículo híbrido
- **GIVEN** un vehículo híbrido y un usuario con perfil `owner`
- **WHEN** recibe una respuesta que implica intervenir en el vehículo
- **THEN** la respuesta incluye la advertencia de alto voltaje

#### Scenario: La advertencia no depende del modelo
- **GIVEN** un vehículo híbrido
- **WHEN** el modelo genera una respuesta que no menciona el alto voltaje
- **THEN** la advertencia se incorpora igualmente a partir del catálogo

#### Scenario: Perfil profesional
- **GIVEN** un vehículo híbrido y un usuario con perfil `mechanic`
- **WHEN** recibe la respuesta
- **THEN** no se repiten las advertencias básicas dirigidas a quien no es profesional

#### Scenario: Reparación desaconsejada a un particular
- **GIVEN** una avería cuya reparación implica el sistema de alto voltaje, airbags o combustible a presión
- **WHEN** la consulta la hace un usuario con perfil `owner`
- **THEN** la respuesta recomienda acudir a un taller
- **AND** no proporciona una guía de pasos para realizar esa intervención

---

### Requirement: Declaración del origen de la información
El sistema SHALL distinguir en la respuesta el origen de sus afirmaciones: norma SAE, lectura del vehículo, base de conocimiento o inferencia del modelo.

#### Scenario: Descripción procedente de la norma
- **GIVEN** un código presente en el catálogo SAE
- **WHEN** se describe en la respuesta
- **THEN** se identifica como procedente de la norma

#### Scenario: Valor leído del vehículo
- **GIVEN** un valor obtenido de un PID en esa misma sesión
- **WHEN** aparece en la respuesta
- **THEN** se identifica como lectura del vehículo

#### Scenario: Inferencia del modelo
- **GIVEN** una hipótesis que no procede de la norma, de la lectura ni de la base de conocimiento
- **WHEN** aparece en la respuesta
- **THEN** se identifica como inferencia, distinguiéndola de un dato comprobado

---

### Requirement: Selector de perfil en la interfaz
El sistema SHALL permitir alternar la vista entre ambos perfiles sin cerrar sesión.

#### Scenario: Alternar perfil
- **GIVEN** un usuario con una respuesta de diagnóstico en pantalla
- **WHEN** cambia el selector de perfil
- **THEN** la respuesta se regenera con el contenido correspondiente al nuevo perfil

#### Scenario: Perfil por defecto
- **GIVEN** un usuario que inicia sesión
- **WHEN** entra en el dashboard
- **THEN** el selector refleja el perfil almacenado en su cuenta
