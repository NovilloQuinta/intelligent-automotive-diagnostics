import pptxgen from 'pptxgenjs'

const REPO = '/home/user/intelligent-automotive-diagnostics'
const SHOT = (n) => `${REPO}/docs/presentacion/capturas/${n}`

// --- Paleta de marca BIG school -------------------------------------------
const AZUL    = '202CFC'   // azul BIG, acento
const AZUL_CL = '8A93FF'   // azul sobre fondo oscuro
const TINTA   = '1A1C2E'   // texto principal y paneles oscuros
const GRIS    = '5A5F73'   // texto secundario
const GRIS_CL = 'B8BCCC'   // texto secundario sobre oscuro
const TARJETA = 'F3F4F9'   // fondo de tarjeta
const BLANCO  = 'FFFFFF'

const W = 13.3, H = 7.5    // LAYOUT_WIDE

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'
pres.author = 'Jesús Ángel Novillo Lucas-Vaquero'
pres.title  = 'Intelligent Automotive Diagnostics — TFM'

/** Logotipo BIG school reconstruido con formas (pendiente del fichero oficial). */
function logoBig(s, x, y, alto = 0.52) {
  s.addShape(pres.ShapeType.rect, { x, y, w: alto, h: alto, fill: { color: AZUL } })
  s.addText('BIG', {
    x, y, w: alto, h: alto, align: 'center', valign: 'middle', margin: 0,
    fontFace: 'Arial', fontSize: alto * 34, bold: true, color: BLANCO,
  })
  s.addText('school', {
    x: x + alto + 0.09, y, w: alto * 3, h: alto, align: 'left', valign: 'middle', margin: 0,
    fontFace: 'Arial', fontSize: alto * 34, color: TINTA,
  })
}

function cabecera(s, kicker, titulo) {
  s.addText(kicker, {
    x: 0.85, y: 0.62, w: 8, h: 0.28, margin: 0,
    fontFace: 'Calibri', fontSize: 11, bold: true, color: AZUL, charSpacing: 2.5,
  })
  s.addText(titulo, {
    x: 0.85, y: 0.96, w: 11.6, h: 1.15, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
}

function pie(s, n) {
  logoBig(s, 0.85, 6.85, 0.24)
  s.addText(String(n), {
    x: 12.1, y: 6.85, w: 0.35, h: 0.24, margin: 0, align: 'right',
    fontFace: 'Calibri', fontSize: 10, color: GRIS,
  })
}

// =========================== 1 — PORTADA ==================================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }
  s.addShape(pres.ShapeType.rect, { x: 7.35, y: -0.1, w: 6.3, h: H + 0.2, fill: { color: TINTA } })

  logoBig(s, 0.85, 0.75)
  s.addText(
    [
      { text: 'Intelligent Automotive\n', options: { color: TINTA } },
      { text: 'Diagnostics',              options: { color: AZUL } },
    ],
    { x: 0.85, y: 2.35, w: 6.1, h: 1.9, margin: 0,
      fontFace: 'Arial', fontSize: 40, bold: true, lineSpacing: 46 },
  )
  s.addText('Diagnóstico OBD-II asistido por IA agéntica sobre el protocolo MCP', {
    x: 0.85, y: 4.35, w: 5.9, h: 0.8, margin: 0,
    fontFace: 'Calibri', fontSize: 16, color: GRIS, lineSpacing: 22,
  })
  s.addText('Jesús Ángel Novillo Lucas-Vaquero', {
    x: 0.85, y: 5.85, w: 6.0, h: 0.35, margin: 0,
    fontFace: 'Arial', fontSize: 15, bold: true, color: TINTA,
  })
  s.addText('Trabajo Fin de Máster  ·  Máster en Desarrollo con IA  ·  BIG school', {
    x: 0.85, y: 6.22, w: 6.0, h: 0.35, margin: 0,
    fontFace: 'Calibri', fontSize: 12, color: GRIS,
  })
  s.addText('LA HERRAMIENTA, EN FUNCIONAMIENTO', {
    x: 7.78, y: 2.35, w: 5.1, h: 0.3, margin: 0,
    fontFace: 'Calibri', fontSize: 10, bold: true, color: BLANCO, charSpacing: 2,
  })
  s.addImage({
    path: SHOT('recortes/03-codigos-dtc.png'),
    x: 7.78, y: 2.95, w: 5.09, h: 1.59,
    shadow: { type: 'outer', color: '000000', opacity: 0.5, blur: 20, offset: 5, angle: 135 },
  })

  s.addNotes(
    'Buenos días. Soy Jesús Ángel Novillo y presento mi Trabajo Fin de Máster del ' +
    'Máster en Desarrollo con IA de BIG school.\n\n' +
    'El proyecto se llama Intelligent Automotive Diagnostics: una herramienta que se ' +
    'conecta al coche por el puerto OBD-II, lee sus datos reales y razona sobre ellos ' +
    'con un modelo de lenguaje.\n\n' +
    'Lo de la derecha no es una maqueta: es la aplicación funcionando, mostrando tres ' +
    'averías que acaba de leer de la centralita.\n\n[~15 s]',
  )
}

// =========================== 2 — EL PROBLEMA ==============================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Lo que te da la máquina', {
    x: 0.85, y: 0.75, w: 11.6, h: 0.9, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })

  const colW = 5.3, xIzq = 0.85, xDer = 7.15, yTit = 2.2, yLista = 2.85

  s.addText('Te da', {
    x: xIzq, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'P0301   Fallo de encendido en el cilindro 1', options: { bullet: true, breakLine: true } },
      { text: 'P0401   Válvula EGR obstruida',            options: { bullet: true, breakLine: true } },
      { text: 'P2002   Filtro de partículas lleno', options: { bullet: true, breakLine: true } },
      { text: 'Y así hasta diez',                              options: { bullet: true } },
    ],
    { x: xIzq, y: yLista, w: colW, h: 2.6, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 16, color: TINTA, paraSpaceAfter: 10, lineSpacing: 22 },
  )

  s.addText('No te da', {
    x: xDer, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'Por qué se ha obstruido la válvula', options: { bullet: true, breakLine: true } },
      { text: 'Por qué se ha llenado el filtro',     options: { bullet: true, breakLine: true } },
      { text: 'Qué tiene que ver un código con otro', options: { bullet: true, breakLine: true } },
      { text: 'Por dónde empezar a mirar',            options: { bullet: true } },
    ],
    { x: xDer, y: yLista, w: colW, h: 2.6, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 16, color: TINTA, paraSpaceAfter: 10, lineSpacing: 22 },
  )

  pie(s, 2)
  s.addNotes(
    'Hoy llegas con una máquina de diagnosis, la conectas, y te da diez códigos de error. ' +
    'Cada uno te dice una cosa: válvula EGR obstruida, filtro de partículas lleno.\n\n' +
    'Vale. Pero esa válvula se ha obstruido por alguna circunstancia, y ese filtro se ha ' +
    'llenado por alguna circunstancia. Y eso la máquina no te lo dice.\n\n' +
    'Te deja la lista delante, y el trabajo de averiguar el porqué sigue entero por hacer.\n\n' +
    '[~45 s]',
  )
}

// =========================== 3 — EL OBJETIVO ==============================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Lo que hace la aplicación', {
    x: 0.85, y: 0.75, w: 11.6, h: 0.9, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('Con esos mismos códigos y los datos del coche.', {
    x: 0.85, y: 1.75, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  s.addText(
    [
      { text: 'Investiga por qué puede estar pasando eso',            options: { bullet: true, breakLine: true } },
      { text: 'Le da al mecánico una serie de opciones, no una sola causa', options: { bullet: true, breakLine: true } },
      { text: 'Y los pasos a seguir para determinar de dónde viene el problema', options: { bullet: true } },
    ],
    { x: 0.85, y: 2.85, w: 11.0, h: 2.6, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 20, color: TINTA, paraSpaceAfter: 22, lineSpacing: 28 },
  )

  pie(s, 3)
  s.addNotes(
    '¿Cuál es la gracia que tiene esta aplicación con la IA? Que con esos dos códigos y ' +
    'esos datos, el agente dice: vale, tengo el P0401, que es la válvula EGR obstruida, y ' +
    'el P2002, que es el filtro de partículas lleno. Voy a mirar a ver por qué puede ser ' +
    'esto.\n\n' +
    'Y hace una diagnosis: esto se produce, puede ser por esto o puede ser por lo otro. Le ' +
    'da al mecánico una serie de opciones.\n\n' +
    'Y además le dice qué pasos puede seguir para llegar a determinar de dónde viene el ' +
    'problema. Eso es lo que hace la aplicación.\n\n[~55 s]',
  )
}

// ============= 4 — POR QUÉ ESTA ARQUITECTURA Y NO OTRA ===================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Por qué esta arquitectura y no otra', {
    x: 0.85, y: 0.75, w: 11.6, h: 0.9, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('Aquí el dominio son normas. Y las normas no las cambia nadie.', {
    x: 0.85, y: 1.75, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  const colW = 5.3, xIzq = 0.85, xDer = 7.15, yTit = 2.55, yLista = 3.2

  s.addText('Por qué Clean + Hexagonal', {
    x: xIzq, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'SAE J1979, ISO 15031, ISO 15765-4, ISO 3779', options: { bullet: true, breakLine: true } },
      { text: 'Las fórmulas de conversión de cada PID',      options: { bullet: true, breakLine: true } },
      { text: 'La decodificación del VIN',                   options: { bullet: true, breakLine: true } },
      { text: 'Todo eso vive en el dominio, sin mezclarse con la base de datos ni con el LLM', options: { bullet: true } },
    ],
    { x: xIzq, y: yLista, w: colW, h: 2.9, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 16, color: TINTA, paraSpaceAfter: 12, lineSpacing: 22 },
  )

  s.addText('Por qué no orientada a eventos', {
    x: xDer, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: GRIS,
  })
  s.addText(
    [
      { text: 'No hay varios servicios que desacoplar: es un proceso', options: { bullet: true, breakLine: true } },
      { text: 'El mecánico pregunta y espera respuesta: el flujo es síncrono', options: { bullet: true, breakLine: true } },
      { text: 'Añadiría broker, colas y consistencia eventual sin ganar nada', options: { bullet: true, breakLine: true } },
      { text: 'Un solo programador: más piezas es más sitio donde romper', options: { bullet: true } },
    ],
    { x: xDer, y: yLista, w: colW, h: 2.9, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 16, color: TINTA, paraSpaceAfter: 12, lineSpacing: 22 },
  )

  pie(s, 4)
  s.addNotes(
    '¿Por qué Clean Architecture y no otra cosa? Porque en este proyecto el dominio no es ' +
    'algo que me haya inventado yo: son normas. SAE J1979, ISO 15031, ISO 15765-4 para el ' +
    'bus CAN, ISO 3779 para el VIN. Las fórmulas que convierten cada PID en una magnitud ' +
    'física, y la decodificación del bastidor. Eso no lo cambia nadie, y no puede estar ' +
    'mezclado con el acceso a datos ni con el modelo de lenguaje.\n\n' +
    'Con Clean Architecture eso vive en el dominio, aislado, y lo que sí cambia —la base de ' +
    'datos, el LLM, el transporte OBD, el framework web— vive fuera, en adaptadores.\n\n' +
    '¿Y por qué no una arquitectura orientada a eventos? Porque aquí no hay varios ' +
    'servicios que desacoplar: es un solo proceso. Y el flujo es síncrono: el mecánico ' +
    'pregunta y se queda esperando la respuesta. Meter un broker y colas me traería ' +
    'consistencia eventual y mucha más superficie de depuración, sin ganar nada a cambio.\n\n' +
    'Y hay una razón práctica: soy un solo programador. Cuantas más piezas móviles, más ' +
    'sitio donde romper.\n\n[~80 s]',
  )
}

await pres.writeFile({ fileName: `${REPO}/docs/presentacion/tfm-intelligent-automotive-diagnostics.pptx` })
console.log('PPTX escrito: 4 slides')
