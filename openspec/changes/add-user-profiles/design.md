## Contexto

Dos públicos sobre el mismo motor de diagnóstico. Las decisiones difíciles no son de interfaz: están en dónde vive la diferencia y en qué se le puede dejar decidir al modelo.

## Decisión 1: el perfil cambia la respuesta, no la presentación

La diferencia se aplica al construir la respuesta del diagnóstico cognitivo, no maquillando en el frontend el mismo texto.

**Por qué.** No es el mismo contenido dicho de dos maneras. Al particular hay que responderle cosas que al mecánico no se le dicen — si puede conducir, si lo puede hacer él, qué cuesta — y omitirle detalle que solo le confunde. Un formateador de texto no puede inventar información que no está.

**Consecuencia.** El perfil viaja hasta el caso de uso y forma parte del contexto del modelo. La interfaz solo elige y muestra.

## Decisión 2: las advertencias de seguridad no las decide el modelo

Las advertencias salen de un catálogo en `domain/`, indexado por características del vehículo (híbrido o eléctrico, tipo de combustible, presencia de airbag). El modelo las **recibe** y las incorpora; no se le pide que las recuerde.

**Por qué.** Un modelo que casi siempre avisa del alto voltaje de un híbrido es un modelo que un día no avisa. Una advertencia de seguridad que depende de que el modelo se acuerde no es una advertencia, es una probabilidad. Un catálogo determinista siempre dispara.

**Consecuencia.** Que el Toyota es híbrido tiene que ser un dato estructurado de la identidad del vehículo, no una frase suelta en el texto libre del modelo. Si hoy no lo es, este cambio lo introduce.

## Decisión 3: el perfil se guarda en el usuario, pero se puede alternar en la sesión

El perfil es un campo de `users` y es el que se aplica por defecto. Además hay un selector que permite cambiar la vista sobre la marcha.

**Por qué el campo:** que alguien tenga que reelegir su perfil cada vez que entra es una mala aplicación.

**Por qué el selector:** un mecánico querrá ver qué le está diciendo la aplicación a su cliente. Y en la demo, poder enseñar la misma avería contada de las dos formas, seguidas, es lo que hace visible la aportación de un vistazo.

## Decisión 4: el perfil nunca viene del cliente sin verificar

El perfil por defecto se lee del token o del usuario en base de datos, en el servidor. Si el selector permite alternar, ese cambio se valida contra el conjunto cerrado de valores permitidos.

Es una preferencia de presentación, no un permiso — el perfil **no** debe usarse jamás para conceder acceso a nada. Si en el futuro un perfil abre funcionalidad que el otro no tiene, deja de ser una preferencia y pasa a ser autorización, con todo lo que eso exige.

## Decisión 5: el origen de cada afirmación se declara

La respuesta distingue cuatro orígenes: norma SAE, lectura del vehículo en ese momento, base de conocimiento recuperada, e inferencia del modelo.

**Por qué.** Un mecánico no actúa sobre una caja negra, y un particular necesita saber cuándo el sistema está seguro y cuándo está suponiendo — porque va a meter las manos él. Es también la respuesta a la pregunta obvia de un tribunal: *¿esto lo sabe o se lo inventa?*

Antes de construir nada, revisar qué dejó implementado `knowledge-confidence-validation`. Es muy posible que buena parte del andamiaje ya exista.

## Decisión 6: en el perfil de particular, la aplicación puede decir "no lo hagas"

Cuando la reparación implica un riesgo que no se mitiga con un aviso — trabajar sobre el sistema de alto voltaje de un híbrido, sobre airbags, sobre el circuito de combustible a presión — la respuesta al particular es derivar al taller, no una guía de pasos.

**Por qué.** Es la línea que separa ayudar de hacer daño. Y no es una limitación del producto: es la recomendación correcta, y la misma que daría un mecánico honesto.

## Riesgos

- **El texto del particular puede sonar condescendiente.** Hay que probarlo con frases reales y ajustar. Simplificar no es hablar a alguien como si fuera tonto.
- **Coste y dificultad de reparación son estimaciones.** El modelo no tiene precios reales. Deben presentarse como orden de magnitud y no como presupuesto; prometer una cifra que luego el taller desmiente destruye la confianza.
- **Duplicación de prompts.** Dos ramas de construcción de prompt tienden a divergir y a arreglarse solo en una. Compartir todo lo común y que la diferencia sea explícita y esté en un solo sitio.
