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

let numeroSlide = 1  // la portada no lleva pie
function pie(s) {
  numeroSlide += 1
  logoBig(s, 0.85, 6.85, 0.24)
  s.addText(String(numeroSlide), {
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

  pie(s)
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

  pie(s)
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

// ======= EL SISTEMA DE UN VISTAZO =========================================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('El sistema de un vistazo', {
    x: 0.85, y: 0.6, w: 11.6, h: 0.8, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('Del conector del coche hasta la respuesta, y de vuelta al catálogo.', {
    x: 0.85, y: 1.5, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 16, color: GRIS,
  })

  const bw = 2.55, bh = 1.0, bgap = 0.44, x0 = 0.85

  function banda(titulo, y, cajas) {
    s.addText(titulo, {
      x: x0, y: y - 0.42, w: 11.6, h: 0.32, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 12, bold: true, color: AZUL, charSpacing: 1.5,
    })
    cajas.forEach(([arriba, abajo], i) => {
      const x = x0 + i * (bw + bgap)
      s.addShape(pres.ShapeType.roundRect, {
        x, y, w: bw, h: bh, rectRadius: 0.06,
        fill: { color: BLANCO }, line: { color: 'C9CCD8', width: 1 },
      })
      s.addText(arriba, {
        x: x + 0.12, y: y + 0.14, w: bw - 0.24, h: 0.32, margin: 0, align: 'center', valign: 'middle',
        fontFace: 'Arial', fontSize: 12, bold: true, color: TINTA,
      })
      s.addText(abajo, {
        x: x + 0.12, y: y + 0.46, w: bw - 0.24, h: 0.42, margin: 0, align: 'center', valign: 'top',
        fontFace: 'Calibri', fontSize: 11, color: GRIS, lineSpacing: 14,
      })
      if (i < cajas.length - 1) {
        s.addShape(pres.ShapeType.line, {
          x: x + bw + 0.08, y: y + bh / 2, w: bgap - 0.16, h: 0,
          line: { color: AZUL, width: 1.5, endArrowType: 'triangle' },
        })
      }
    })
  }

  banda('1 · LEER EL COCHE', 2.55, [
    ['El coche',            'o uno de los tres\nemuladores ELM327'],
    ['Adaptador ELM327',    'por cable USB,\nWiFi o TCP'],
    ['Transporte OBD',      'negocia el protocolo\ny pide modos y PIDs'],
    ['Dominio',             'aplica la fórmula\nde cada PID'],
  ])

  banda('2 · RAZONAR SOBRE LO LEÍDO', 4.75, [
    ['Casos parecidos',     'búsqueda vectorial\nen LanceDB'],
    ['Agente',              '16 tools MCP\n+ el modelo'],
    ['Informe',             'narrativa, severidad\ny recomendaciones'],
    ['Se indexa',           'el caso vuelve\nal catálogo'],
  ])

  // El bucle: del ultimo paso de vuelta al primero de la banda 2
  s.addShape(pres.ShapeType.line, {
    x: x0 + bw / 2, y: 6.15, w: 3 * (bw + bgap), h: 0,
    line: { color: 'C9CCD8', width: 1, dashType: 'dash', beginArrowType: 'triangle' },
  })
  s.addText('lo aprendido alimenta el siguiente diagnóstico', {
    x: x0, y: 6.2, w: 11.6, h: 0.3, margin: 0, align: 'center',
    fontFace: 'Calibri', fontSize: 11, italic: true, color: GRIS,
  })

  pie(s)
  s.addNotes(
    'Esta es la foto entera, para que se entienda dónde encaja cada cosa de lo que viene ' +
    'después.\n\n' +
    'Arriba, leer el coche. A la izquierda el vehículo, que puede ser uno de verdad o uno ' +
    'de los tres emuladores que uso para la demo. Se conecta un adaptador ELM327, por cable ' +
    'USB, por WiFi o por TCP. La API tiene un transporte que negocia el protocolo del bus y ' +
    'va pidiendo modos y PIDs. Y lo que vuelve son bytes en crudo, así que el dominio ' +
    'aplica la fórmula de cada PID para convertirlos en magnitudes físicas.\n\n' +
    'Abajo, razonar sobre lo leído. Antes de llamar al modelo se buscan casos parecidos en ' +
    'la base vectorial. El agente entra con esos casos, con las dieciséis herramientas MCP y ' +
    'con el modelo detrás, y va pidiendo lo que necesita. Sale un informe con narrativa, ' +
    'severidad y recomendaciones. Y ese caso se indexa.\n\n' +
    'Esa flecha de vuelta es la clave del proyecto: lo que se aprende en un diagnóstico ' +
    'alimenta el siguiente. Cuantos más coches pasen, más casos reales hay con los que ' +
    'comparar.\n\n[~60 s]',
  )
}

// ============= 4 — POR QUÉ ESTA ARQUITECTURA Y NO OTRA ===================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Por qué esta arquitectura y no otra', {
    x: 0.85, y: 0.7, w: 11.6, h: 0.85, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('Aquí el dominio son normas. Y las normas no las cambia nadie.', {
    x: 0.85, y: 1.65, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  const colW = 5.3, xIzq = 0.85, xDer = 7.15, yTit = 2.35, yLista = 2.95

  s.addText('Por qué Clean + Hexagonal', {
    x: xIzq, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'El dominio son normas: SAE J1979, ISO 15031, ISO 3779', options: { bullet: true, breakLine: true } },
      { text: 'Las fórmulas de cada PID y la decodificación del VIN',  options: { bullet: true, breakLine: true } },
      { text: 'Nada de eso se mezcla con la base de datos ni con el LLM', options: { bullet: true } },
    ],
    { x: xIzq, y: yLista, w: colW, h: 2.0, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 15, color: TINTA, paraSpaceAfter: 10, lineSpacing: 21 },
  )

  s.addText('Por qué no orientada a eventos', {
    x: xDer, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: GRIS,
  })
  s.addText(
    [
      { text: 'Es un proceso: no hay servicios que desacoplar',        options: { bullet: true, breakLine: true } },
      { text: 'El mecánico pregunta y espera: el flujo es síncrono',   options: { bullet: true, breakLine: true } },
      { text: 'Un solo programador: más piezas es más sitio donde romper', options: { bullet: true } },
    ],
    { x: xDer, y: yLista, w: colW, h: 2.0, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 15, color: TINTA, paraSpaceAfter: 10, lineSpacing: 21 },
  )

  // Ejemplo: donde vive cada cosa en este proyecto
  s.addText('En este proyecto', {
    x: 0.85, y: 5.15, w: 11.6, h: 0.32, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 15, bold: true, color: TINTA,
  })
  const capas = [
    ['Dominio', 'Vin, DtcCode, PidCode, Formula, catálogos de PID y DTC'],
    ['Aplicación', 'IdentifyVehicle, ExecuteCognitiveDiagnosis, ObdRepository, LlmClientPort'],
    ['Infraestructura', 'Express, Drizzle + SQLite, LanceDB, servidor MCP, transporte ELM327'],
  ]
  capas.forEach(([nombre, contenido], k) => {
    const y = 5.6 + k * 0.4
    s.addText(nombre, {
      x: 0.85, y, w: 1.9, h: 0.34, margin: 0, valign: 'middle',
      fontFace: 'Calibri', fontSize: 14, bold: true, color: AZUL,
    })
    s.addText(contenido, {
      x: 2.8, y, w: 9.6, h: 0.34, margin: 0, valign: 'middle',
      fontFace: 'Calibri', fontSize: 14, color: GRIS,
    })
  })

  pie(s)
  s.addNotes(
    '¿Por qué Clean Architecture y no otra cosa? Porque en este proyecto el dominio no es ' +
    'algo que me haya inventado yo: son normas. SAE J1979, ISO 15031, ISO 15765-4 para el ' +
    'bus CAN, ISO 3779 para el VIN. Las fórmulas que convierten cada PID en una magnitud ' +
    'física, y la decodificación del bastidor. Eso no lo cambia nadie, y no puede estar ' +
    'mezclado con el acceso a datos ni con el modelo de lenguaje.\n\n' +
    '¿Y por qué no orientada a eventos? Porque aquí no hay varios servicios que desacoplar: ' +
    'es un solo proceso. El flujo es síncrono, el mecánico pregunta y se queda esperando. ' +
    'Un broker y colas me traerían consistencia eventual y mucha más superficie de ' +
    'depuración sin ganar nada. Y soy un solo programador: cuantas más piezas móviles, más ' +
    'sitio donde romper.\n\n' +
    'Abajo está el ejemplo concreto de este proyecto. En el dominio, los value objects y ' +
    'los catálogos. En aplicación, los casos de uso y los puertos, que dicen qué hace ' +
    'falta pero no cómo. Y en infraestructura el cómo: Express, Drizzle sobre SQLite, ' +
    'LanceDB, el servidor MCP y el transporte del ELM327.\n\n' +
    'El dominio no sabe que existe SQLite, ni Express, ni ningún modelo de lenguaje.\n\n' +
    '[~80 s]',
  )
}

// =================== 5 — OBD-II: CÓMO SE LEE EL COCHE =====================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Cómo se lee el coche', {
    x: 0.85, y: 0.7, w: 11.6, h: 0.85, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('Un ejemplo: pedirle las revoluciones del motor.', {
    x: 0.85, y: 1.65, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  // Cadena: aplicacion -> ELM327 -> bus CAN -> centralita
  const pasos = ['La aplicación', 'Adaptador\nELM327', 'Bus CAN\ndel coche', 'Centralita\ndel motor']
  const bw = 2.4, bh = 1.15, bgap = 0.65, by = 2.55
  pasos.forEach((t, i) => {
    const x = 0.85 + i * (bw + bgap)
    s.addShape(pres.ShapeType.roundRect, {
      x, y: by, w: bw, h: bh, rectRadius: 0.06,
      fill: { color: BLANCO }, line: { color: 'C9CCD8', width: 1 },
    })
    s.addText(t, {
      x, y: by, w: bw, h: bh, margin: 0, align: 'center', valign: 'middle',
      fontFace: 'Calibri', fontSize: 15, color: TINTA, lineSpacing: 20,
    })
    if (i < pasos.length - 1) {
      s.addShape(pres.ShapeType.line, {
        x: x + bw + 0.12, y: by + bh / 2, w: bgap - 0.24, h: 0,
        line: { color: AZUL, width: 1.5, endArrowType: 'triangle' },
      })
    }
  })

  // Lo que viaja por el cable
  s.addText('Va', {
    x: 0.85, y: 4.35, w: 1.1, h: 0.33, margin: 0, valign: 'middle',
    fontFace: 'Calibri', fontSize: 14, bold: true, color: GRIS,
  })
  s.addText('01 0C', {
    x: 2.0, y: 4.35, w: 3.0, h: 0.33, margin: 0, valign: 'middle',
    fontFace: 'Courier New', fontSize: 16, bold: true, color: TINTA,
  })
  s.addText('modo 01, PID 0C — revoluciones', {
    x: 4.6, y: 4.35, w: 7.5, h: 0.33, margin: 0, valign: 'middle',
    fontFace: 'Calibri', fontSize: 14, color: GRIS,
  })

  s.addText('Vuelve', {
    x: 0.85, y: 4.85, w: 1.1, h: 0.33, margin: 0, valign: 'middle',
    fontFace: 'Calibri', fontSize: 14, bold: true, color: GRIS,
  })
  s.addText('41 0C 0B B8', {
    x: 2.0, y: 4.85, w: 3.0, h: 0.33, margin: 0, valign: 'middle',
    fontFace: 'Courier New', fontSize: 16, bold: true, color: TINTA,
  })
  s.addText('los dos bytes de datos son A = 0B y B = B8', {
    x: 4.6, y: 4.85, w: 7.5, h: 0.33, margin: 0, valign: 'middle',
    fontFace: 'Calibri', fontSize: 14, color: GRIS,
  })

  // La formula del dominio
  s.addText(
    [
      { text: '(A × 256 + B) / 4   =   (11 × 256 + 184) / 4   =   ', options: { color: TINTA } },
      { text: '750 rpm',                                             options: { color: AZUL } },
    ],
    { x: 0.85, y: 5.65, w: 11.6, h: 0.45, margin: 0, valign: 'middle',
      fontFace: 'Arial', fontSize: 19, bold: true },
  )
  pie(s)
  s.addNotes(
    'Esto es todo lo que hay que entender del OBD-II para seguir el resto de la charla.\n\n' +
    'La aplicación quiere saber a cuántas revoluciones está el motor. Manda dos bytes: 01 ' +
    '0C. El 01 es el modo, que en la norma significa "dame un dato en vivo", y el 0C es el ' +
    'PID concreto, las revoluciones.\n\n' +
    'Eso sale por el adaptador ELM327, que es el cachivache que se enchufa al conector del ' +
    'coche, entra en el bus CAN, y llega a la centralita del motor.\n\n' +
    'La centralita contesta 41 0C 0B B8. El 41 es el 01 más cuarenta, que es como la norma ' +
    'marca que es una respuesta. El 0C confirma qué PID contesta. Y los dos últimos bytes ' +
    'son el dato en crudo.\n\n' +
    'Ese dato no son revoluciones todavía. Hay que aplicarle la fórmula del PID: A por 256 ' +
    'más B, dividido entre 4. Con 0B y B8, eso da 750 revoluciones.\n\n' +
    'Esa fórmula la fija la SAE J1979, y por eso está en el dominio y no en el código que ' +
    'habla con el cable.\n\n[~70 s]',
  )
}

// ==================== 6 — DOS BASES DE DATOS ==============================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Dos bases de datos', {
    x: 0.85, y: 0.7, w: 11.6, h: 0.85, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('En una se busca por clave. En la otra, por parecido.', {
    x: 0.85, y: 1.65, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  const colW = 5.3, xIzq = 0.85, xDer = 7.15, yTit = 2.5, yLista = 3.1

  s.addText('SQLite', {
    x: xIzq, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'Usuarios, talleres, vehículos, ECUs y sesiones', options: { bullet: true, breakLine: true } },
      { text: 'Los catálogos de PID, DTC y ECU: los de la norma y los que se descubren', options: { bullet: true, breakLine: true } },
      { text: 'Se consulta por clave: este VIN, este PID',      options: { bullet: true } },
    ],
    { x: xIzq, y: yLista, w: colW, h: 1.9, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 16, color: TINTA, paraSpaceAfter: 12, lineSpacing: 22 },
  )

  s.addText('LanceDB, vectorial', {
    x: xDer, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'Ese mismo conocimiento, indexado por significado', options: { bullet: true, breakLine: true } },
      { text: 'Y los diagnósticos ya resueltos, que aquí no están', options: { bullet: true, breakLine: true } },
      { text: 'Se consulta por parecido, no por clave',           options: { bullet: true, breakLine: true } },
      { text: 'El buscador de texto de SQLite no llega: «presión de aceite» no encuentra «oil pressure»', options: { bullet: true } },
    ],
    { x: xDer, y: yLista, w: colW, h: 1.9, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 16, color: TINTA, paraSpaceAfter: 12, lineSpacing: 22 },
  )

  pie(s)
  s.addNotes(
    'El proyecto tiene dos bases de datos, y cada una guarda una cosa distinta.\n\n' +
    'En SQLite va todo lo que se pide por una clave: los usuarios, que pueden ser ' +
    'particulares o talleres, los vehículos, las ECUs que se les han descubierto, las ' +
    'sesiones de diagnóstico, y los catálogos que vienen de la norma. Todo eso se consulta ' +
    'por una clave: dame el vehículo con este VIN, dame las sesiones de este usuario.\n\n' +
    'En la vectorial va ese mismo conocimiento pero indexado por significado, más los ' +
    'diagnósticos ya resueltos, que solo están ahí. La diferencia no es qué se guarda, es ' +
    'cómo se busca: en SQLite pregunto por una clave, y en la vectorial pido "enséñame algo ' +
    'parecido a esto".\n\n' +
    'Y no vale con una sola. SQLite tiene buscador de texto, pero busca palabras: si el ' +
    'mecánico escribe "presión de aceite", no encuentra una ficha que ponga "oil ' +
    'pressure". La búsqueda vectorial sí, porque compara significado.\n\n' +
    'Las dos son embebidas: un fichero y un directorio en disco. Cero servidores.\n\n[~55 s]',
  )
}

// ============ 7 — SQLITE: EL CATALOGO Y LOS DATOS DEL TALLER ========================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('SQLite: el catálogo y los datos del taller', {
    x: 0.85, y: 0.7, w: 11.6, h: 0.85, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('13 tablas. Todo lo que se puede pedir por una clave exacta.', {
    x: 0.85, y: 1.65, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  const colW = 5.3, xIzq = 0.85, xDer = 7.15, yTit = 2.5, yLista = 3.1

  s.addText('Qué guarda', {
    x: xIzq, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'Usuarios: particulares o talleres, con su rol', options: { bullet: true, breakLine: true } },
      { text: 'Vehículos por VIN y las ECUs de cada uno',      options: { bullet: true, breakLine: true } },
      { text: 'Sesiones de diagnóstico, con el informe congelado', options: { bullet: true, breakLine: true } },
      { text: 'Lecturas de PID: el hexadecimal crudo y el valor ya convertido', options: { bullet: true, breakLine: true } },
      { text: 'Logs y auditoría de cada petición',             options: { bullet: true, breakLine: true } },
      { text: 'Y crece solo: un PID leído que no esté en el catálogo se inserta con confianza 0,3', options: { bullet: true } },
    ],
    { x: xIzq, y: yLista, w: colW, h: 3.0, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 15, color: TINTA, paraSpaceAfter: 11, lineSpacing: 21 },
  )

  s.addText('Lo que viene sembrado al arrancar', {
    x: xDer, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  const seed = [
    ['20', 'PIDs de la norma SAE J1979'],
    ['23', 'códigos DTC estándar'],
    ['27', 'fabricantes, por su código WMI'],
  ]
  seed.forEach(([n, t], k) => {
    const y = yLista + 0.05 + k * 0.62
    s.addText(n, {
      x: xDer, y, w: 0.75, h: 0.38, margin: 0, valign: 'middle',
      fontFace: 'Arial', fontSize: 20, bold: true, color: TINTA,
    })
    s.addText(t, {
      x: xDer + 0.85, y, w: colW - 0.85, h: 0.38, margin: 0, valign: 'middle',
      fontFace: 'Calibri', fontSize: 15, color: TINTA,
    })
  })

  pie(s)
  s.addNotes(
    'En SQLite hay trece tablas, y ahí está todo lo que se puede pedir por una clave ' +
    'exacta.\n\n' +
    'Los usuarios, que pueden ser particulares o talleres, con su rol. Los vehículos, ' +
    'identificados por su VIN, y las ECUs que se le han descubierto a cada uno en el bus. ' +
    'Las sesiones de diagnóstico, y de cada una el informe congelado, tal como salió ese ' +
    'día. Las lecturas de PID, guardando tanto el hexadecimal crudo que devolvió la ' +
    'centralita como el valor ya convertido. Y los logs y la auditoría de cada petición ' +
    'HTTP, que es requisito de OWASP.\n\n' +
    'Al arrancar, la base se siembra: veinte PIDs de la norma SAE J1979, veintitrés códigos ' +
    'DTC estándar y veintisiete fabricantes por su código WMI, que es lo que permite sacar ' +
    'la marca de un VIN. Pero el catálogo no se queda ahí: cuando el agente lee un PID que ' +
    'no conoce, se inserta solo en esta base con confianza 0,3 y una fórmula asumida, ' +
    'marcado como auto-descubierto. Vale como pista, no como dato confirmado, hasta que se ' +
    'valida contra el coche.\n\n' +
    'Es un fichero en disco, sin servidor. PostgreSQL se descartó porque a esta escala solo ' +
    'añadía un servicio, una red y un backup que mantener, sin resolver ningún problema ' +
    'que yo tuviera.\n\n[~60 s]',
  )
}

// ============ 8 — QUÉ SE GUARDA EN LA BASE VECTORIAL ======================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Qué se guarda en la base vectorial', {
    x: 0.85, y: 0.65, w: 11.6, h: 0.8, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('Los datos del taller van en SQLite. Aquí solo va lo que el sistema aprende.', {
    x: 0.85, y: 1.55, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 16, color: GRIS,
  })

  // --- Izquierda: colecciones + ejemplo real -------------------------------
  const xI = 0.85, wI = 7.1

  s.addText('Colecciones', {
    x: xI, y: 2.25, w: wI, h: 0.35, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 18, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'PIDs propietarios que no están en la norma, con su fórmula', options: { bullet: true, breakLine: true } },
      { text: 'DTCs específicos de un fabricante',                          options: { bullet: true, breakLine: true } },
      { text: 'Casos resueltos: síntomas, PIDs implicados y solución',      options: { bullet: true } },
    ],
    { x: xI, y: 2.72, w: wI, h: 1.15, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 14, color: TINTA, paraSpaceAfter: 7, lineSpacing: 19 },
  )

  s.addText('Un caso resuelto, tal cual se guarda', {
    x: xI, y: 4.05, w: wI, h: 0.35, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 15, bold: true, color: TINTA,
  })
  const campos = [
    ['embeddedText', '"Audi A3 2.0 TDI con P0401 y P2002: EGR obstruida'],
    ['',             ' por carbonilla de un motor que consume aceite"'],
    ['symptoms',     'ralentí inestable · pérdida de potencia'],
    ['pidsInvolved', '010C · 0105 · 22F40C'],
    ['confidence',   '0,5   ·   manufacturer Audi · model A3'],
  ]
  campos.forEach(([k, v], n) => {
    const y = 4.45 + n * 0.33
    if (k) s.addText(k, {
      x: xI, y, w: 1.75, h: 0.3, margin: 0, valign: 'middle',
      fontFace: 'Courier New', fontSize: 12, bold: true, color: AZUL,
    })
    s.addText(v, {
      x: xI + 1.85, y, w: wI - 1.85, h: 0.3, margin: 0, valign: 'middle',
      fontFace: 'Courier New', fontSize: 12, color: TINTA,
    })
  })

  // --- Derecha: indice de confianza ---------------------------------------
  const xD = 8.35, wD = 4.1

  s.addText('Índice de confianza', {
    x: xD, y: 2.25, w: wD, h: 0.35, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 18, bold: true, color: AZUL,
  })
  s.addText('Se lo ponemos nosotros al guardar, según de dónde salga el dato. Es lo que pondera las búsquedas.', {
    x: xD, y: 2.68, w: wD, h: 0.55, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 13, color: GRIS, lineSpacing: 18,
  })
  const escala = [
    ['0,3', 'lo encontró el agente en internet'],
    ['0,5', 'viene de un diagnóstico anterior'],
    ['0,8', 'lo aportó el mecánico a mano'],
    ['1,0', 'se ha leído del coche por OBD'],
  ]
  escala.forEach(([n, t], k) => {
    const y = 3.4 + k * 0.62
    s.addText(n, {
      x: xD, y, w: 0.7, h: 0.34, margin: 0, valign: 'top',
      fontFace: 'Arial', fontSize: 17, bold: true, color: TINTA,
    })
    s.addText(t, {
      x: xD + 0.75, y, w: wD - 0.75, h: 0.55, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 13, color: TINTA, lineSpacing: 17,
    })
  })
  s.addText('Validar contra el coche sube la web a 0,7 y al mecánico a 0,9.', {
    x: xD, y: 5.95, w: wD, h: 0.5, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 13, color: GRIS, lineSpacing: 17,
  })

  pie(s)
  s.addNotes(
    'En la base vectorial no van los datos del taller: esos están en SQLite. Aquí va solo ' +
    'lo que el sistema aprende. Hay PIDs propietarios, que cada fabricante se inventa fuera ' +
    'de la norma y es imposible traer precargados; DTCs específicos de una marca; y casos ' +
    'resueltos.\n\n' +
    'A la izquierda tenéis un caso resuelto tal cual se guarda. El campo embeddedText es el ' +
    'texto que se convierte en vector, y es lo que luego permite encontrarlo por parecido. ' +
    'Los síntomas y los PIDs implicados van aparte, y el fabricante y el modelo también, ' +
    'para poder filtrar: si estoy con un Audi no quiero que me salgan casos de una ' +
    'Kawasaki.\n\n' +
    'Y luego está el índice de confianza, que se lo ponemos nosotros al guardar según de ' +
    'dónde venga el dato. Si lo encontró el agente en internet entra con 0,3. Si viene de ' +
    'un diagnóstico anterior, 0,5. Si lo aportó el mecánico a mano, 0,8, porque una persona ' +
    'delante del coche sabe más que una web cualquiera. Y si se ha leído del propio coche ' +
    'por OBD es un hecho: 1,0. Comprobar un dato contra el coche sube la web a 0,7 y al ' +
    'mecánico a 0,9.\n\n' +
    'Ese índice no es decorativo: es lo que pondera las búsquedas. Cuando al agente le ' +
    'llegan dos respuestas que se contradicen, gana la que más confianza tiene.\n\n' +
    '[Si preguntan por el escalado] Hay dos mecanismos distintos y conviene no mezclarlos. ' +
    'Que el mecánico aporte o confirme un dato sube su confianza a 0,8, y validarlo contra ' +
    'el coche lo lleva a 0,9: eso está implementado y funciona. Lo que dejé fuera a ' +
    'propósito es subir la confianza de un caso cada vez que se reutiliza con acierto. La ' +
    'función existe y está testeada, pero no la llamo desde ningún flujo, porque para eso ' +
    'haría falta saber que el diagnóstico acertó de verdad, y nadie le dice al sistema si ' +
    'el coche se arregló. Inventármelo habría degradado el catálogo.\n\n[~70 s]',
  )
}

// ================= MCP: LAS HERRAMIENTAS DEL AGENTE =======================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('MCP: las herramientas del agente', {
    x: 0.85, y: 0.7, w: 11.6, h: 0.85, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('El modelo no toca el coche. Pide una herramienta, y el sistema decide si se ejecuta.', {
    x: 0.85, y: 1.65, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  // --- Izquierda: las 16 tools, con su nombre real -------------------------
  const xI = 0.85, wI = 6.5
  s.addText('Las 16 herramientas', {
    x: xI, y: 2.4, w: wI, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })

  const grupos = [
    ['Diagnóstico · 7', ['read_vin   read_pid   get_available_pids',
                          'get_dtc_codes   get_freeze_frame',
                          'get_vehicle_info   get_ecu_info']],
    ['Conocimiento · 8', ['search_similar_pids   search_similar_dtcs',
                          'search_similar_diagnoses   search_similar_ecus',
                          'index_pid   index_dtc   index_diagnosis   index_ecu']],
    ['Web · 1',          ['web_search']],
  ]
  let y = 2.95
  grupos.forEach(([titulo, lineas]) => {
    s.addText(titulo, {
      x: xI, y, w: wI, h: 0.3, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 13, bold: true, color: TINTA,
    })
    y += 0.34
    lineas.forEach((l) => {
      s.addText(l, {
        x: xI + 0.15, y, w: wI - 0.15, h: 0.28, margin: 0, valign: 'top',
        fontFace: 'Courier New', fontSize: 11, color: GRIS,
      })
      y += 0.29
    })
    y += 0.18
  })

  // --- Derecha: por que MCP -----------------------------------------------
  const xD = 7.75, wD = 4.7
  s.addText('Por qué MCP', {
    x: xD, y: 2.4, w: wD, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'Es el estándar con el que un modelo pide herramientas, y solo sirve para eso', options: { bullet: true, breakLine: true } },
      { text: 'El modelo solo actúa por ahí: no hay otra puerta al sistema', options: { bullet: true, breakLine: true } },
      { text: 'Cada herramienta declara su esquema, y los argumentos se validan antes de ejecutarla', options: { bullet: true, breakLine: true } },
      { text: 'El servidor vive en infraestructura: el modelo nunca ve el dominio', options: { bullet: true, breakLine: true } },
      { text: 'Cambiar de modelo no toca las herramientas', options: { bullet: true } },
    ],
    { x: xD, y: 2.95, w: wD, h: 3.5, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 14, color: TINTA, paraSpaceAfter: 10, lineSpacing: 20 },
  )

  pie(s)
  s.addNotes(
    'El modelo no toca el coche directamente. Lo que hace es pedir herramientas, y el ' +
    'sistema decide si las ejecuta y con qué argumentos. Ese contrato es el MCP, el Model ' +
    'Context Protocol.\n\n' +
    'A la izquierda están las dieciséis que he construido, con su nombre. Siete son de ' +
    'diagnóstico: leer el bastidor, leer un PID, preguntar qué PIDs soporta el coche, los ' +
    'códigos de avería, el freeze frame, la información del vehículo y la de las ' +
    'centralitas. Ocho son de conocimiento, y van por parejas: cuatro para buscar parecidos ' +
    'y cuatro para indexar lo aprendido, de PIDs, DTCs, diagnósticos y ECUs. Y una de ' +
    'búsqueda web, con un presupuesto limitado por diagnóstico para que el agente no se ' +
    'vaya a internet sin control.\n\n' +
    '¿Y por qué MCP? Primero, porque es el estándar que existe hoy para que un modelo pida ' +
    'herramientas. No es un protocolo de propósito general: sirve exactamente para esto.\n\n' +
    'Y segundo, que para mí es lo importante: el modelo solo puede actuar a través de esas ' +
    'dieciséis. No hay otra puerta. No ejecuta código, no consulta la base de datos por su ' +
    'cuenta, no llama a ningún otro endpoint. Si quiere saber a cuántas revoluciones está ' +
    'el motor, tiene que pedir la herramienta de leer un PID, y ahí decido yo si se ejecuta ' +
    'y con qué argumentos. Eso acota lo que el agente puede hacer, y en un sistema que se ' +
    'conecta a un coche de verdad no es un detalle menor.\n\n' +
    'Además, cada herramienta declara su esquema, así que los argumentos se validan antes ' +
    'de ejecutar nada. Y el servidor MCP vive en infraestructura: es un adaptador más, el ' +
    'modelo nunca ve el dominio. Como es un protocolo, ese mismo servidor serviría a ' +
    'cualquier otro cliente que lo hable.\n\n[~75 s]',
  )
}

// ============= CÓMO RAZONA EL AGENTE ======================================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Cómo razona el agente', {
    x: 0.85, y: 0.7, w: 11.6, h: 0.85, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('Del botón de iniciar diagnóstico a la respuesta que lee el mecánico.', {
    x: 0.85, y: 1.65, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  // --- Izquierda: el ciclo -------------------------------------------------
  const xI = 0.85, wI = 6.5
  s.addText('El ciclo', {
    x: xI, y: 2.4, w: wI, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  const pasos = [
    'Al iniciar el diagnóstico se leen los PIDs generales, los DTCs y el freeze frame',
    'Antes de llamar al modelo se buscan casos parecidos en la vectorial, y entran en el prompt',
    'El modelo pide herramientas: mira el catálogo, lee más PIDs, busca lo que no conoce',
    'Máximo 10 vueltas de ese ciclo, y 60 segundos de límite',
    'Devuelve la explicación para el mecánico y un bloque JSON con severidad, confianza y recomendaciones',
    'El caso resuelto se indexa con confianza 0,5, y la conversación sigue desde ahí',
  ]
  pasos.forEach((t, k) => {
    const y = 2.9 + k * 0.62
    s.addText(String(k + 1), {
      x: xI, y, w: 0.4, h: 0.55, margin: 0, valign: 'top',
      fontFace: 'Arial', fontSize: 15, bold: true, color: AZUL,
    })
    s.addText(t, {
      x: xI + 0.45, y, w: wI - 0.45, h: 0.6, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 14, color: TINTA, lineSpacing: 19,
    })
  })

  // --- Derecha: los cercos del prompt --------------------------------------
  const xD = 7.75, wD = 4.7
  s.addText('El prompt lleva 11 bloques', {
    x: xD, y: 2.4, w: wD, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'Cómo explorar el coche y en qué orden',              options: { bullet: true, breakLine: true } },
      { text: 'Consultar el catálogo antes de inventarse nada',      options: { bullet: true, breakLine: true } },
      { text: 'Cómo aprender un PID, un DTC o una ECU nuevos',       options: { bullet: true, breakLine: true } },
      { text: 'Qué queda fuera de su ámbito y no debe contestar',    options: { bullet: true, breakLine: true } },
      { text: 'Que lo que llega de la web y del catálogo no es de fiar', options: { bullet: true, breakLine: true } },
      { text: 'Cómo hablarle a un mecánico, y cómo rematar en JSON', options: { bullet: true } },
    ],
    { x: xD, y: 2.9, w: wD, h: 3.6, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 14, color: TINTA, paraSpaceAfter: 10, lineSpacing: 20 },
  )

  pie(s)
  s.addNotes(
    'Este es el recorrido completo, desde que el mecánico le da al botón.\n\n' +
    'Lo primero que pasa no lo hace la IA: el flujo determinista lee los PIDs generales del ' +
    'modo 01, los códigos de avería y el freeze frame. Eso está ahí sí o sí.\n\n' +
    'Cuando el mecánico entra al chat, antes de llamar al modelo el sistema hace una ' +
    'búsqueda en la base vectorial de casos parecidos a este, y los mete en el prompt. Van ' +
    'etiquetados como "muy similar", "similar" o "relacionado", nunca con el número de ' +
    'distancia, porque cuando le pasaba el número el modelo lo repetía en la respuesta y ' +
    'eso es ruido para el mecánico. Y van envueltos en una marca de contenido no fiable, ' +
    'porque ese catálogo lo alimentan otros usuarios.\n\n' +
    'A partir de ahí empieza el ciclo. El modelo pide herramientas, el sistema las ejecuta y ' +
    'le devuelve el resultado, y el modelo decide qué pedir después. Ese bucle tiene dos ' +
    'topes: diez vueltas como máximo y sesenta segundos.\n\n' +
    'Cuando termina, devuelve dos cosas: la explicación en lenguaje normal para el ' +
    'mecánico, y un bloque JSON con la severidad, la confianza y las recomendaciones, que ' +
    'es lo que la aplicación pinta en pantalla. Si no hay explicación, se lanza un error a ' +
    'propósito y no se guarda nada: un caso vacío en el catálogo volvería luego como "caso ' +
    'similar" y contaminaría los diagnósticos siguientes.\n\n' +
    'Y por último el caso se indexa con confianza 0,5, que es la de diagnóstico anterior.\n\n' +
    'El system prompt tiene once bloques. No es solo decirle "eres un mecánico": hay ' +
    'bloques de exploración, de consultar el catálogo antes de inventar, de aprendizaje ' +
    'para PIDs, DTCs y ECUs, de ámbito, de no revelar sus propias tripas, de contenido no ' +
    'fiable y del formato de salida.\n\n[~80 s]',
  )
}

// ======= LOS DOS MODELOS ==================================================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Los dos modelos', {
    x: 0.85, y: 0.7, w: 11.6, h: 0.85, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('Uno razona y se puede cambiar. El otro convierte texto en vectores y va dentro.', {
    x: 0.85, y: 1.65, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  const colW = 5.3, xIzq = 0.85, xDer = 7.15, yTit = 2.45, yLista = 3.05

  s.addText('El modelo de lenguaje', {
    x: xIzq, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'Una variable de entorno: LLM_PROVIDER = anthropic u openai', options: { bullet: true, breakLine: true } },
      { text: 'Los dos clientes implementan el mismo puerto, LlmClientPort', options: { bullet: true, breakLine: true } },
      { text: 'El adaptador de OpenAI sirve también para DeepSeek, Groq, Mistral o xAI', options: { bullet: true, breakLine: true } },
      { text: 'Sin proveedor configurado, el diagnóstico determinista sigue funcionando', options: { bullet: true } },
    ],
    { x: xIzq, y: yLista, w: colW, h: 3.1, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 15, color: TINTA, paraSpaceAfter: 11, lineSpacing: 21 },
  )

  s.addText('El modelo de embeddings', {
    x: xDer, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  s.addText('paraphrase-multilingual-MiniLM-L12-v2', {
    x: xDer, y: yLista, w: colW, h: 0.3, margin: 0, valign: 'top',
    fontFace: 'Courier New', fontSize: 12, bold: true, color: TINTA,
  })
  s.addText(
    [
      { text: 'Corre en la propia máquina, con transformers.js', options: { bullet: true, breakLine: true } },
      { text: 'Sin clave, sin red y sin coste por consulta',    options: { bullet: true, breakLine: true } },
      { text: 'Convierte cada texto en 384 números, normalizados', options: { bullet: true, breakLine: true } },
      { text: 'Es multilingüe: por eso «presión de aceite» encuentra «oil pressure»', options: { bullet: true } },
    ],
    { x: xDer, y: yLista + 0.45, w: colW, h: 2.8, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 15, color: TINTA, paraSpaceAfter: 11, lineSpacing: 21 },
  )

  pie(s)
  s.addNotes(
    'Aquí hay dos modelos, y no hacen lo mismo.\n\n' +
    'El de lenguaje es el que razona, y es intercambiable: una variable de entorno decide ' +
    'si va contra Anthropic o contra OpenAI. Los dos clientes implementan el mismo puerto, ' +
    'así que la capa de aplicación no se entera de cuál hay detrás. Y el adaptador de ' +
    'OpenAI no vale solo para OpenAI: sirve para cualquier proveedor compatible con su API ' +
    '—DeepSeek, Groq, Mistral, xAI— cambiando la URL base. Si no hay ninguno configurado, ' +
    'el diagnóstico determinista sigue funcionando.\n\n' +
    'El de embeddings es distinto: no se cambia, va dentro. Es un modelo pequeño que corre ' +
    'en la propia máquina con transformers.js. Coge un texto —la descripción de un PID, la ' +
    'narrativa de un diagnóstico— y lo convierte en 384 números, normalizados, que es lo ' +
    'que se guarda en la base vectorial. Buscar por parecido es comparar esos vectores.\n\n' +
    'Que corra en local significa tres cosas: no hace falta clave, no hay latencia de red y ' +
    'no se paga por consulta. Y como es multilingüe, español e inglés caen cerca en ese ' +
    'espacio: por eso "presión de aceite" encuentra una ficha que pone "oil pressure", que ' +
    'es justo lo que un buscador de texto no hace.\n\n[~65 s]',
  )
}

// ============ LOS DOS DIAGNÓSTICOS (cierra el bloque de IA) ============== ============================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Dos diagnósticos', {
    x: 0.85, y: 0.7, w: 11.6, h: 0.85, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('El determinista está siempre. El cognitivo, solo si hay un modelo configurado.', {
    x: 0.85, y: 1.65, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  const colW = 5.3, xIzq = 0.85, xDer = 7.15, yTit = 2.45, yLista = 3.05

  s.addText('Determinista', {
    x: xIzq, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'Lee cuatro PIDs fijos: revoluciones, refrigerante, velocidad y admisión', options: { bullet: true, breakLine: true } },
      { text: 'Más los DTCs y el freeze frame',                       options: { bullet: true, breakLine: true } },
      { text: 'La criticidad sale de una regla: sin DTCs es baja, con freeze frame es crítica', options: { bullet: true, breakLine: true } },
      { text: 'Solo necesita el coche, y responde al momento',        options: { bullet: true, breakLine: true } },
      { text: 'No aprende nada',                                      options: { bullet: true } },
    ],
    { x: xIzq, y: yLista, w: colW, h: 3.1, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 15, color: TINTA, paraSpaceAfter: 11, lineSpacing: 21 },
  )

  s.addText('Cognitivo', {
    x: xDer, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'El agente decide qué PIDs le hace falta leer',        options: { bullet: true, breakLine: true } },
      { text: 'Razona sobre lo que va encontrando, llamando a herramientas', options: { bullet: true, breakLine: true } },
      { text: 'Necesita el coche, la API del modelo y los índices vectoriales', options: { bullet: true, breakLine: true } },
      { text: 'Hasta 60 segundos de límite',                          options: { bullet: true, breakLine: true } },
      { text: 'Y aprende: indexa PIDs, DTCs y el caso resuelto',      options: { bullet: true } },
    ],
    { x: xDer, y: yLista, w: colW, h: 3.1, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 15, color: TINTA, paraSpaceAfter: 11, lineSpacing: 21 },
  )

  pie(s)
  s.addNotes(
    'El sistema hace dos diagnósticos distintos, y conviven.\n\n' +
    'El determinista es el de toda la vida. Lee cuatro PIDs fijos —revoluciones, ' +
    'temperatura de refrigerante, velocidad y temperatura de admisión—, los códigos de ' +
    'avería y el freeze frame. Y la criticidad no me la invento: sale de una regla en el ' +
    'dominio, computeSeverity. Si no hay códigos es baja; si hay freeze frame es crítica, ' +
    'porque significa que la centralita congeló el momento del fallo; y si hay códigos sin ' +
    'freeze frame es alta. Solo necesita el coche conectado, responde al momento, y no ' +
    'aprende nada.\n\n' +
    'El cognitivo es el otro. Ahí no hay una lista fija de PIDs: el agente decide qué le ' +
    'hace falta leer y va llamando a las herramientas según lo que encuentra. A cambio ' +
    'necesita tres cosas: el coche, la API del modelo y los índices vectoriales. Tarda más, ' +
    'con un límite de sesenta segundos. Y es el único que aprende: indexa los PIDs y DTCs ' +
    'nuevos y guarda el caso resuelto.\n\n' +
    'Por eso conviven. Si no hay modelo configurado, o si no hay internet en el taller, el ' +
    'determinista sigue funcionando.\n\n[~65 s]',
  )
}

// ======= LA APLICACIÓN FUNCIONANDO ========================================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('La aplicación funcionando', {
    x: 0.85, y: 0.55, w: 11.6, h: 0.75, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 32, bold: true, color: TINTA,
  })
  s.addText('Audi A3 2.0 TDI. Todo lo que se ve viene leído del bus, nada está escrito a mano.', {
    x: 0.85, y: 1.38, w: 11.6, h: 0.35, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 15, color: GRIS,
  })

  const pantallas = [
    ['demo/01-identificacion-vin.png', 'Lee el VIN del bus y saca marca, modelo y motor'],
    ['demo/02-datos-vivo.png',         'Telemetría en vivo y los PIDs que soporta'],
    ['demo/03-codigos-dtc.png',        'Las averías: modos 03, 07 y 0A'],
    ['demo/08-informe.png',            'El informe que se congela con la sesión'],
  ]
  const iw = 5.0, ih = 1.875, gapX = 1.6
  pantallas.forEach(([fichero, texto], k) => {
    const x = 0.85 + (k % 2) * (iw + gapX)
    const yCap = 2.05 + Math.floor(k / 2) * 2.35
    s.addText(texto, {
      x, y: yCap, w: iw, h: 0.28, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 12, color: TINTA,
    })
    s.addImage({
      path: SHOT(fichero), x, y: yCap + 0.33, w: iw, h: ih,
      shadow: { type: 'outer', color: '000000', opacity: 0.28, blur: 12, offset: 3, angle: 90 },
    })
  })

  pie(s)
  s.addNotes(
    'Esto es la aplicación corriendo contra un Audi A3 2.0 TDI. Y quiero subrayar una ' +
    'cosa: nada de lo que se ve está escrito a mano. Todo sale del bus del coche.\n\n' +
    'Arriba a la izquierda, la identificación. El sistema no sabe qué coche es: lo ' +
    'pregunta con el modo 09, saca el bastidor, decodifica el WMI y resuelve Audi, ' +
    'fabricado en Alemania. De ahí salen marca, modelo, año y motor.\n\n' +
    'Al lado, la telemetría en vivo, y debajo los PIDs que este vehículo declara soportar, ' +
    'que no son una lista fija: se leen del bitmask del PID 00.\n\n' +
    'Abajo a la izquierda, las averías. Tres códigos confirmados, y las tres pestañas son ' +
    'los servicios 03, 07 y 0A del estándar: almacenadas, pendientes y permanentes.\n\n' +
    'Y a la derecha el informe, que se congela con la sesión: si dentro de seis meses ' +
    'alguien abre ese diagnóstico, ve exactamente lo que se vio ese día.\n\n' +
    '[~2 min contando la demo. Si hay vídeo del coche real, va aquí.]',
  )
}

// ======= CON QUÉ ESTÁ HECHO ===============================================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Con qué está hecho', {
    x: 0.85, y: 0.6, w: 11.6, h: 0.8, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('TypeScript de punta a punta, y cada pieza detrás de un puerto.', {
    x: 0.85, y: 1.5, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 16, color: GRIS,
  })

  const filas = [
    ['Lenguaje y runtime', 'TypeScript 5.7 estricto sobre Node 22'],
    ['API', 'Express 5 · Zod · Helmet 8 · JWT · pino'],
    ['Persistencia', 'SQLite con Drizzle ORM'],
    ['Búsqueda vectorial', 'LanceDB · transformers.js en local'],
    ['Agente', 'MCP SDK · SDK de Anthropic · SDK de OpenAI'],
    ['Acceso al coche', 'ELM327 por serie o TCP · emulador Python'],
    ['Interfaz', 'React 19 · Vite · TanStack Router y Query · Tailwind'],
    ['Pruebas', 'Vitest · supertest · Playwright'],
    ['Entrega', 'GitHub Actions · Docker · Caddy'],
  ]
  const yTop = 2.35, rowH = 0.5
  filas.forEach(([que, con], i) => {
    const y = yTop + i * rowH
    s.addText(que, {
      x: 0.85, y, w: 3.3, h: 0.42, margin: 0, valign: 'middle',
      fontFace: 'Arial', fontSize: 14, bold: true, color: AZUL,
    })
    s.addText(con, {
      x: 4.3, y, w: 8.15, h: 0.42, margin: 0, valign: 'middle',
      fontFace: 'Calibri', fontSize: 14, color: TINTA,
    })
  })

  pie(s)
  s.addNotes(
    'Con qué está hecho, por piezas.\n\n' +
    'Todo es TypeScript en modo estricto, sobre Node 22, tanto el backend como el ' +
    'frontend.\n\n' +
    'La API es Express 5, con Zod para validar todo lo que entra, Helmet para las cabeceras ' +
    'de seguridad, JWT para la autenticación y pino para el log estructurado. La ' +
    'persistencia relacional es SQLite con Drizzle, que es un ORM cuyos esquemas son ' +
    'TypeScript, no un fichero aparte. La búsqueda vectorial es LanceDB, con el modelo de ' +
    'embeddings corriendo en local vía transformers.js.\n\n' +
    'El agente usa el SDK oficial de MCP, y por debajo el de Anthropic o el de OpenAI según ' +
    'lo que esté configurado. El acceso al coche es un ELM327, por puerto serie o por TCP, ' +
    'y para la demo un emulador escrito en Python.\n\n' +
    'La interfaz es React 19 con Vite y TanStack, y las pruebas son Vitest para unidad, ' +
    'supertest para los endpoints y Playwright para el extremo a extremo. Y la entrega va ' +
    'con GitHub Actions, Docker y Caddy delante.\n\n' +
    'Lo importante no es la lista: es que todo lo que aparece de la tercera fila para abajo ' +
    'está detrás de un puerto, así que se puede sustituir sin tocar la lógica.\n\n[~55 s]',
  )
}

// ======= CÓMO SE SOSTIENE ESTO ============================================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Cómo se sostiene esto', {
    x: 0.85, y: 0.7, w: 11.6, h: 0.85, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('Un solo programador, así que el que avisa de las roturas es el CI.', {
    x: 0.85, y: 1.65, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  const colW = 5.3, xIzq = 0.85, xDer = 7.15, yTit = 2.45, yLista = 3.05

  s.addText('Cómo se escribe', {
    x: xIzq, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'TDD: primero el test que falla, luego el código', options: { bullet: true, breakLine: true } },
      { text: '2.171 pruebas en verde, en 209 ficheros', options: { bullet: true, breakLine: true } },
      { text: 'La cobertura se exige fichero a fichero, no de media', options: { bullet: true, breakLine: true } },
      { text: '45 cambios especificados y archivados con OpenSpec', options: { bullet: true } },
    ],
    { x: xIzq, y: yLista, w: colW, h: 3.1, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 15, color: TINTA, paraSpaceAfter: 11, lineSpacing: 21 },
  )

  s.addText('Qué se comprueba en cada push', {
    x: xDer, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'Lint, formato, tests, build y typecheck', options: { bullet: true, breakLine: true } },
      { text: 'Las dos apps en paralelo, sobre Node 22', options: { bullet: true, breakLine: true } },
      { text: 'Auditoría de dependencias que rompe si hay algo crítico', options: { bullet: true, breakLine: true } },
      { text: 'OWASP API Top 10 2023: las diez categorías, documentadas', options: { bullet: true } },
    ],
    { x: xDer, y: yLista, w: colW, h: 3.1, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 15, color: TINTA, paraSpaceAfter: 11, lineSpacing: 21 },
  )

  pie(s)
  s.addNotes(
    'Este proyecto lo he hecho yo solo, así que lo que avisa de las roturas no es un ' +
    'compañero: es el CI.\n\n' +
    'El código se escribe con TDD, primero el test que falla y luego el código mínimo que ' +
    'lo pasa. Ahora mismo hay 2.171 pruebas en verde repartidas en 209 ficheros, entre el ' +
    'backend y el frontend.\n\n' +
    'Y la cobertura no se mide de media, que es la trampa habitual: está configurada por ' +
    'fichero. Un fichero sin tests no puede esconderse detrás de otro que esté muy ' +
    'cubierto.\n\n' +
    'Cada cambio va documentado con OpenSpec antes de escribirse: hay 45 cambios ' +
    'especificados y archivados, con su diseño, sus specs y sus tareas.\n\n' +
    'En cada push, el CI corre lint, formato, los tests, el build y el typecheck, para las ' +
    'dos aplicaciones en paralelo sobre Node 22. Y pasa una auditoría de dependencias que ' +
    'tumba la build si aparece una vulnerabilidad crítica.\n\n' +
    'En seguridad, el documento cubre las diez categorías del OWASP API Top 10 de 2023, una ' +
    'a una, con lo que hace el código en cada caso. Incluidos los riesgos residuales, que ' +
    'están escritos y asumidos, no escondidos.\n\n[~60 s]',
  )
}

// ======= CONCLUSIONES =====================================================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Conclusiones', {
    x: 0.85, y: 0.7, w: 11.6, h: 0.85, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('Lo que me llevo de haber construido esto con IA.', {
    x: 0.85, y: 1.65, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  const colW = 5.3, xIzq = 0.85, xDer = 7.15, yTit = 2.5, yLista = 3.1

  s.addText('Lo que acelera', {
    x: xIzq, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'Se pueden construir cosas complejas mucho más rápido', options: { bullet: true, breakLine: true } },
      { text: 'Lo que antes eran meses o años, ahora son semanas',    options: { bullet: true, breakLine: true } },
      { text: 'Y se aprende más por el camino: herramientas y frameworks que no habrías tocado', options: { bullet: true } },
    ],
    { x: xIzq, y: yLista, w: colW, h: 2.7, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 16, color: TINTA, paraSpaceAfter: 13, lineSpacing: 22 },
  )

  s.addText('Lo que hay que poner', {
    x: xDer, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'Acelera, pero también se equivoca',                 options: { bullet: true, breakLine: true } },
      { text: 'Hay que revisar lo que se sube, no vale con fiarse', options: { bullet: true, breakLine: true } },
      { text: 'No es todo tan bonito como parece: hay que dedicarle tiempo', options: { bullet: true } },
    ],
    { x: xDer, y: yLista, w: colW, h: 2.7, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 16, color: TINTA, paraSpaceAfter: 13, lineSpacing: 22 },
  )

  pie(s)
  s.addNotes(
    'Para terminar, lo que me llevo de haber hecho esto.\n\n' +
    'Lo primero, que con IA se pueden construir cosas complejas mucho más rápido. Un ' +
    'proyecto como este, con su arquitectura, su capa de OBD, su base vectorial y su ' +
    'agente, antes habría sido cuestión de meses o de años. Y no solo va más rápido: se ' +
    'aprenden más cosas por el camino, porque te metes en herramientas y frameworks que de ' +
    'otra forma ni habrías tocado.\n\n' +
    'Pero hay una segunda parte, y la quiero decir igual de claro. La IA también se ' +
    'equivoca, y hay que estar encima de lo que se sube. No vale con fiarse.\n\n' +
    'Y no lo digo en abstracto: preparando esta misma presentación encontré que el umbral ' +
    'de cobertura del núcleo apuntaba a un fichero que se había renombrado, así que llevaba ' +
    'semanas sin exigir nada. Estaba verde, y no comprobaba lo que decía comprobar. Lo he ' +
    'documentado en la deuda conocida del proyecto.\n\n' +
    'Así que sí, acelera mucho. Pero no es todo tan bonito como parece: hay que dedicarle ' +
    'tiempo a revisar.\n\n[~45 s]',
  )
}

// ======= CIERRE ===========================================================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  // Mismo panel que la portada: el deck abre y cierra igual
  s.addShape(pres.ShapeType.rect, { x: 7.35, y: -0.1, w: 6.3, h: H + 0.2, fill: { color: TINTA } })

  logoBig(s, 0.85, 0.75)

  s.addText('Gracias por la atención', {
    x: 0.85, y: 2.9, w: 6.1, h: 1.0, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 40, bold: true, color: TINTA,
  })

  s.addText('Jesús Ángel Novillo Lucas-Vaquero', {
    x: 0.85, y: 5.85, w: 6.0, h: 0.35, margin: 0,
    fontFace: 'Arial', fontSize: 15, bold: true, color: TINTA,
  })
  s.addText('Máster en Desarrollo con IA  ·  BIG school', {
    x: 0.85, y: 6.22, w: 6.2, h: 0.35, margin: 0,
    fontFace: 'Calibri', fontSize: 12, color: GRIS,
  })

  s.addText('EL INFORME DE LA SESIÓN', {
    x: 7.78, y: 2.35, w: 5.1, h: 0.3, margin: 0,
    fontFace: 'Calibri', fontSize: 10, bold: true, color: BLANCO, charSpacing: 2,
  })
  s.addImage({
    path: SHOT('demo/08-informe.png'),                 // 3200 x 1200
    x: 7.78, y: 2.95, w: 5.09, h: 1.91,
    shadow: { type: 'outer', color: '000000', opacity: 0.5, blur: 20, offset: 5, angle: 135 },
  })

  s.addNotes(
    'Y hasta aquí. Muchas gracias por la atención.\n\n' +
    '[Quedarse callado y esperar las preguntas. El backup está detrás.]',
  )
}

await pres.writeFile({ fileName: `${REPO}/docs/presentacion/tfm-intelligent-automotive-diagnostics.pptx` })
console.log('PPTX escrito: 18 slides')
