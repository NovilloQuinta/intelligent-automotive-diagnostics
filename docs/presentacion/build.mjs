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

  pie(s, 4)
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
  s.addText('La fórmula la fija la SAE J1979 y vive en el dominio.', {
    x: 0.85, y: 6.2, w: 11.6, h: 0.35, margin: 0, valign: 'middle',
    fontFace: 'Calibri', fontSize: 14, color: GRIS,
  })

  pie(s, 5)
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

// ============ 6 — QUÉ SE GUARDA EN LA BASE VECTORIAL ======================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }

  s.addText('Qué se guarda en la base vectorial', {
    x: 0.85, y: 0.7, w: 11.6, h: 0.85, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 34, bold: true, color: TINTA,
  })
  s.addText('Los datos del taller van en SQLite. Aquí solo va lo que el sistema aprende.', {
    x: 0.85, y: 1.65, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 17, color: GRIS,
  })

  const colW = 5.3, xIzq = 0.85, xDer = 7.15, yTit = 2.4, yLista = 3.0

  s.addText('Tres colecciones', {
    x: xIzq, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  s.addText(
    [
      { text: 'PIDs propietarios que no están en la norma, con su fórmula', options: { bullet: true, breakLine: true } },
      { text: 'DTCs específicos de un fabricante',                          options: { bullet: true, breakLine: true } },
      { text: 'Casos resueltos: síntomas, PIDs implicados y solución',      options: { bullet: true, breakLine: true } },
      { text: 'Cada entrada es un texto vectorizado, más fabricante y modelo para filtrar', options: { bullet: true } },
    ],
    { x: xIzq, y: yLista, w: colW, h: 2.9, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 15, color: TINTA, paraSpaceAfter: 11, lineSpacing: 21 },
  )

  s.addText('Cada dato lleva de dónde salió', {
    x: xDer, y: yTit, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 19, bold: true, color: AZUL,
  })
  const escala = [
    ['0,3', 'lo encontró el agente en internet'],
    ['0,5', 'viene de un diagnóstico anterior'],
    ['0,8', 'lo aportó el mecánico a mano'],
    ['1,0', 'se ha leído del coche por OBD'],
  ]
  escala.forEach(([n, t], k) => {
    const y = yLista + 0.05 + k * 0.52
    s.addText(n, {
      x: xDer, y, w: 0.75, h: 0.38, margin: 0, valign: 'middle',
      fontFace: 'Arial', fontSize: 18, bold: true, color: TINTA,
    })
    s.addText(t, {
      x: xDer + 0.85, y, w: colW - 0.85, h: 0.38, margin: 0, valign: 'middle',
      fontFace: 'Calibri', fontSize: 15, color: TINTA,
    })
  })
  s.addText('Validar contra el coche sube la web a 0,7 y al mecánico a 0,9.', {
    x: xDer, y: yLista + 2.3, w: colW, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 14, color: GRIS,
  })

  s.addText('Así el agente sabe de qué fiarse: lo que dijo un mecánico pesa más que lo que encontró en una web.', {
    x: 0.85, y: 6.15, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 15, color: GRIS,
  })

  pie(s, 6)
  s.addNotes(
    'En la base vectorial no van los datos del taller: esos están en SQLite. Aquí va solo ' +
    'lo que el sistema aprende, y son tres colecciones.\n\n' +
    'La primera son PIDs propietarios. Cada fabricante se inventa los suyos fuera de la ' +
    'norma, y es imposible traerlos todos precargados: cuando el agente descubre uno, lo ' +
    'guarda con su fórmula. La segunda son DTCs específicos de un fabricante, los que no ' +
    'están en el estándar. Y la tercera son casos resueltos: los síntomas, los PIDs que ' +
    'estaban implicados y cómo acabó.\n\n' +
    'Cada entrada es un texto que se convierte en vector, y lleva pegados el fabricante y ' +
    'el modelo para poder filtrar. Si estoy con un Audi, no quiero que me salgan casos de ' +
    'una Kawasaki.\n\n' +
    'Y lo importante: cada dato lleva de dónde salió, porque no todas las fuentes valen ' +
    'igual. Si lo encontró el agente buscando en internet, entra con 0,3. Si viene de un ' +
    'diagnóstico anterior, con 0,5. Si lo aportó el mecánico a mano, con 0,8, porque una ' +
    'persona que está delante del coche sabe más que una web. Y si se ha leído del propio ' +
    'coche por OBD, es un hecho: 1,0.\n\n' +
    'Además, validar contra el coche sube lo de la web a 0,7 y lo del mecánico a 0,9.\n\n' +
    'Para eso sirve todo esto: para que el agente sepa de qué fiarse cuando le llegan dos ' +
    'respuestas que se contradicen.\n\n[~70 s]',
  )
}

await pres.writeFile({ fileName: `${REPO}/docs/presentacion/tfm-intelligent-automotive-diagnostics.pptx` })
console.log('PPTX escrito: 6 slides')
