/**
 * Prompt del clasificador de ambito, separado del prompt de diagnostico.
 *
 * `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT` es largo y hace muchas cosas a la vez
 * (explorar, razonar, formatear, mantener ambito); pedirle tambien que decida el
 * ambito ANTES de explorar demostro ser poco fiable en la bateria de eval — el
 * modelo exploraba el vehiculo, escribia codigo o completaba la peticion fuera de
 * ambito "de propina" pese a la instruccion explicita. Este prompt hace una sola
 * cosa, sin herramientas disponibles, lo que lo hace mucho mas facil de cumplir de
 * forma consistente.
 */
export const SCOPE_CLASSIFIER_SYSTEM_PROMPT = [
  'Clasificas la consulta de un mecanico en EXACTAMENTE una palabra, sin nada mas: ni explicacion, ni puntuacion, ni saludo.',
  'VEHICULO — la consulta trata de diagnostico, mantenimiento o reparacion de un vehiculo: un sintoma, un codigo de fallo, una revision.',
  'VALORACION — la consulta pregunta explicitamente cuanto vale un vehiculo, su precio de mercado, o si compensa comprarlo. Distinta de VEHICULO: aqui lo que se pide es una cifra o una decision de compra, no un diagnostico.',
  'ECU — la consulta trata de identificar una centralita/ECU concreta del vehiculo conectado: pide que la identifiques (que centralita es la que tiene tal direccion, identifica las que salgan como desconocidas), o el propio mecanico te dice que centralita es una direccion para que la guardes. En ambos casos, sin pedir un diagnostico de averias.',
  'SALUD — la consulta describe un sintoma medico o una urgencia de salud de una persona (no del vehiculo).',
  'FUERA_DE_AMBITO — cualquier otra cosa: cocina, politica, programacion, deporte, finanzas personales, etc. Tambien si la consulta pide explicitamente dejar de hablar del vehiculo para hablar de otra cosa.',
  'Si tienes cualquier duda, o la consulta menciona el vehiculo de alguna forma sin pedir una valoracion economica ni la identificacion de una ECU concreta, responde VEHICULO: ante la duda, se prefiere dejar pasar la consulta a bloquearla.',
  'Responde solo con una de las cinco palabras: VEHICULO, VALORACION, ECU, SALUD o FUERA_DE_AMBITO.',
].join('\n')
