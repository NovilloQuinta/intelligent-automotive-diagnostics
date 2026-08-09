# DTC Descriptions

## Purpose

Entregar los códigos de avería con su descripción normalizada SAE J2012 cuando se conoce, y sin descripción cuando no, sin generar nunca texto plausible sin fuente.

## ADDED Requirements

### Requirement: Descripción resuelta desde el catálogo SAE J2012
El sistema SHALL resolver la descripción de cada DTC leído contra un catálogo estático de dominio.

#### Scenario: Código presente en el catálogo
- **WHEN** el vehículo reporta `P0301`
- **THEN** el DTC se entrega con su descripción SAE J2012
- **AND** la descripción es visible junto al código en el panel de DTC

#### Scenario: Varios códigos en la misma lectura
- **WHEN** el vehículo reporta `P0301`, `P0401` y `P2002`
- **THEN** los tres llegan con su descripción correspondiente

---

### Requirement: Un código desconocido no recibe descripción inventada
El sistema SHALL entregar descripción vacía para un código ausente del catálogo, y NEVER derivarla de la familia del código ni de ninguna heurística.

#### Scenario: Código fuera del catálogo
- **WHEN** el vehículo reporta un código que el catálogo no contiene
- **THEN** su descripción es la cadena vacía
- **AND** el código sigue mostrándose con su severidad y es seleccionable

#### Scenario: Distinción frente al conocimiento por validar
- **WHEN** un código carece de descripción en el catálogo
- **THEN** el hueco queda disponible para que el índice vectorial o el LLM lo completen con su nivel de confianza propio
- **AND** el sistema no presenta como verificado nada que no proceda del catálogo
