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
  cabecera(s, 'EL PROBLEMA', 'Lo que ve hoy un mecánico')

  const pasos = [
    { n: '1', t: 'Salen códigos',        b: 'P0401, P2002.\nLo que ha registrado la centralita.' },
    { n: '2', t: 'Pero no la avería',    b: '¿EGR sucia? ¿Consume aceite?\nLo decide su experiencia.' },
    { n: '3', t: 'Y no queda registrado', b: 'El siguiente coche\nempieza otra vez desde el código.' },
  ]

  const cw = 3.7, gap = 0.35, x0 = (W - (cw * 3 + gap * 2)) / 2, cy = 2.55, ch = 2.4
  pasos.forEach((p, i) => {
    const x = x0 + i * (cw + gap)
    s.addShape(pres.ShapeType.roundRect, {
      x, y: cy, w: cw, h: ch, rectRadius: 0.1, fill: { color: TARJETA },
    })
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.35, y: cy + 0.35, w: 0.42, h: 0.42, fill: { color: AZUL },
    })
    s.addText(p.n, {
      x: x + 0.35, y: cy + 0.35, w: 0.42, h: 0.42, margin: 0,
      align: 'center', valign: 'middle', fontFace: 'Arial', fontSize: 14, bold: true, color: BLANCO,
    })
    s.addText(p.t, {
      x: x + 0.35, y: cy + 1.0, w: cw - 0.7, h: 0.4, margin: 0, valign: 'top',
      fontFace: 'Arial', fontSize: 17, bold: true, color: TINTA,
    })
    s.addText(p.b, {
      x: x + 0.35, y: cy + 1.5, w: cw - 0.7, h: 0.75, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 13, color: GRIS, lineSpacing: 19,
    })
  })

  s.addText('Lo que sabe el mecánico no se guarda en ningún sitio.', {
    x: 0.85, y: 5.55, w: 11.6, h: 0.45, margin: 0,
    fontFace: 'Arial', fontSize: 18, bold: true, color: TINTA,
  })

  pie(s, 2)
  s.addNotes(
    'Cuando un mecánico conecta el escáner a un coche, lo que le sale son códigos. ' +
    'P0401, P2002. Eso le dice lo que ha registrado la centralita, pero no le dice qué ' +
    'está roto.\n\n' +
    'A partir de ahí el trabajo lo pone él. Esos dos códigos pueden ser una válvula EGR ' +
    'sucia, o pueden ser un motor que consume aceite y ha ido saturando el filtro de ' +
    'partículas. Son dos reparaciones distintas y decidir cuál es depende de su ' +
    'experiencia.\n\n' +
    'Y luego está lo otro: cuando da con el fallo, eso no queda en ninguna parte. Se ' +
    'queda en su cabeza. El siguiente coche con esos mismos códigos igual entra en otro ' +
    'taller, y allí se empieza otra vez desde el código.\n\n[~45 s]',
  )
}

// =========================== 3 — EL OBJETIVO ==============================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }
  cabecera(s, 'EL OBJETIVO', 'Que el mecánico vea más del coche')

  const cw = 5.55, gap = 0.5, x0 = (W - (cw * 2 + gap)) / 2, cy = 2.6, ch = 2.5

  s.addShape(pres.ShapeType.roundRect, {
    x: x0, y: cy, w: cw, h: ch, rectRadius: 0.08, fill: { color: TARJETA },
  })
  s.addText('DESDE EL PRIMER COCHE', {
    x: x0 + 0.45, y: cy + 0.45, w: cw - 0.9, h: 0.3, margin: 0,
    fontFace: 'Calibri', fontSize: 11, bold: true, color: AZUL, charSpacing: 2,
  })
  s.addText('Le ayuda a investigar el fallo', {
    x: x0 + 0.45, y: cy + 0.9, w: cw - 0.9, h: 0.45, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: TINTA,
  })
  s.addText('Qué le pasa al coche, si está bien o mal,\ny por dónde seguir mirando.', {
    x: x0 + 0.45, y: cy + 1.5, w: cw - 0.9, h: 0.8, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 14, color: GRIS, lineSpacing: 21,
  })

  const x1 = x0 + cw + gap
  s.addShape(pres.ShapeType.roundRect, {
    x: x1, y: cy, w: cw, h: ch, rectRadius: 0.08, fill: { color: TINTA },
  })
  s.addText('SEGÚN SE CONECTEN MÁS TALLERES', {
    x: x1 + 0.45, y: cy + 0.45, w: cw - 0.9, h: 0.3, margin: 0,
    fontFace: 'Calibri', fontSize: 11, bold: true, color: AZUL_CL, charSpacing: 2,
  })
  s.addText('Y va mejorando con el uso', {
    x: x1 + 0.45, y: cy + 0.9, w: cw - 0.9, h: 0.45, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 20, bold: true, color: BLANCO,
  })
  s.addText('Cada diagnóstico se guarda.\nMás casos reales con los que comparar.', {
    x: x1 + 0.45, y: cy + 1.5, w: cw - 0.9, h: 0.8, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 14, color: GRIS_CL, lineSpacing: 21,
  })

  pie(s, 3)
  s.addNotes(
    'El objetivo de la aplicación es ayudar al mecánico a diagnosticar. A investigar un ' +
    'fallo: qué le pasa al coche, si está bien o está mal, y por dónde seguir mirando. ' +
    'Dicho de otra forma, mejorar la visión que tiene del vehículo cuando conecta la ' +
    'herramienta. Eso ya lo hace desde el primer coche.\n\n' +
    'Y luego está lo que aporta con el tiempo. Esto está pensado para que se conecten ' +
    'más talleres, se registren más coches, más averías y más diagnósticos. Como todo ' +
    'eso se guarda en una base vectorial, cuando llega un coche nuevo el sistema puede ' +
    'comparar con casos que ya se resolvieron y dar una valoración más real. No pasa de ' +
    'un día para otro: lo va haciendo poco a poco.\n\n[~55 s]',
  )
}

// ================= 4 — POR QUÉ CLEAN ARCHITECTURE + HEXAGONAL =============
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }
  cabecera(s, 'LA ARQUITECTURA', 'Esto va a seguir cambiando')

  s.addText('Clean Architecture + Hexagonal. Cambiar una pieza es tocar una sola capa.', {
    x: 0.85, y: 2.05, w: 11.6, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 16, color: GRIS,
  })

  // Núcleo: lo que no se toca
  const nx = 0.85, ny = 2.95, nw = 4.3, nh = 2.9
  s.addShape(pres.ShapeType.roundRect, {
    x: nx, y: ny, w: nw, h: nh, rectRadius: 0.08, fill: { color: TINTA },
  })
  s.addText('EL NÚCLEO', {
    x: nx + 0.45, y: ny + 0.45, w: nw - 0.9, h: 0.3, margin: 0,
    fontFace: 'Calibri', fontSize: 11, bold: true, color: AZUL_CL, charSpacing: 2,
  })
  s.addText('Dominio y\ncasos de uso', {
    x: nx + 0.45, y: ny + 0.9, w: nw - 0.9, h: 0.9, margin: 0, valign: 'top',
    fontFace: 'Arial', fontSize: 22, bold: true, color: BLANCO, lineSpacing: 28,
  })
  s.addText('No se toca.', {
    x: nx + 0.45, y: ny + 2.0, w: nw - 0.9, h: 0.4, margin: 0, valign: 'top',
    fontFace: 'Calibri', fontSize: 15, color: GRIS_CL,
  })

  // Infraestructura: lo intercambiable
  const piezas = [
    { t: 'Persistencia', b: 'SQLite  →  PostgreSQL' },
    { t: 'Modelo de lenguaje', b: 'OpenAI  ↔  Anthropic' },
    { t: 'Acceso al coche', b: 'Emulador  ↔  cable OBD' },
  ]
  const px = 6.0, pw = 6.45, ph = 0.82, pgap = 0.22
  s.addText('INFRAESTRUCTURA — LO QUE SE CAMBIA', {
    x: px, y: 2.62, w: pw, h: 0.3, margin: 0,
    fontFace: 'Calibri', fontSize: 11, bold: true, color: AZUL, charSpacing: 2,
  })
  piezas.forEach((p, i) => {
    const y = 2.95 + i * (ph + pgap)
    s.addShape(pres.ShapeType.roundRect, {
      x: px, y, w: pw, h: ph, rectRadius: 0.1, fill: { color: TARJETA },
    })
    s.addText(p.t, {
      x: px + 0.4, y, w: 2.6, h: ph, margin: 0, valign: 'middle',
      fontFace: 'Arial', fontSize: 13, bold: true, color: TINTA,
    })
    s.addText(p.b, {
      x: px + 3.0, y, w: pw - 3.4, h: ph, margin: 0, valign: 'middle', align: 'right',
      fontFace: 'Calibri', fontSize: 14, color: AZUL,
    })
  })

  s.addText('Hoy SQLite porque era lo más rápido para desarrollar. El día que toque Postgres, se cambia el adaptador.', {
    x: 0.85, y: 6.2, w: 11.6, h: 0.4, margin: 0,
    fontFace: 'Calibri', fontSize: 14, color: GRIS,
  })

  pie(s, 4)
  s.addNotes(
    '¿Por qué Clean Architecture y hexagonal? Porque esto es una herramienta que va a ' +
    'seguir evolucionando.\n\n' +
    'Ahora mismo funciona con SQLite, porque era lo más rápido para desarrollar el ' +
    'proyecto. Pero en un futuro tendrá que usar PostgreSQL. La gracia de esta ' +
    'arquitectura es que para hacer ese cambio solo se toca la parte de infraestructura, ' +
    'la de persistencia. El dominio y los casos de uso no se enteran.\n\n' +
    'Y lo mismo pasa con el resto: si cambio de modelo de lenguaje, si cambio la forma ' +
    'de acceder al coche, o cualquier otra parte de la aplicación. Al final solo se toca ' +
    'una capa.\n\n[~80 s. Es la slide que más se repregunta: ir despacio.]',
  )
}

await pres.writeFile({ fileName: `${REPO}/docs/presentacion/tfm-intelligent-automotive-diagnostics.pptx` })
console.log('PPTX escrito: 4 slides')
