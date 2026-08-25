import pptxgen from 'pptxgenjs'

const REPO = '/home/user/intelligent-automotive-diagnostics'
const SHOT = (n) => `${REPO}/docs/presentacion/capturas/${n}`

// --- Paleta de marca BIG school -------------------------------------------
const AZUL   = '202CFC'   // azul BIG, acento
const TINTA  = '1A1C2E'   // texto principal y paneles oscuros
const GRIS   = '5A5F73'   // texto secundario
const TARJETA= 'F3F4F9'   // fondo de tarjeta
const BLANCO = 'FFFFFF'

const W = 13.3, H = 7.5   // LAYOUT_WIDE

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

/** Antetitulo en azul sobre el titulo de cada slide de contenido. */
function cabecera(s, kicker, titulo) {
  s.addText(kicker, {
    x: 0.85, y: 0.62, w: 8, h: 0.28, margin: 0,
    fontFace: 'Calibri', fontSize: 11, bold: true, color: AZUL, charSpacing: 2.5,
  })
  s.addText(titulo, {
    x: 0.85, y: 0.98, w: 11.6, h: 0.72, margin: 0,
    fontFace: 'Arial', fontSize: 36, bold: true, color: TINTA,
  })
}

/** Numero de pagina y firma de la escuela, discretos. */
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

  // Panel oscuro: se pasa del borde a proposito, para que no quede franja blanca
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
  // Captura centrada dentro del panel: 0.43" de margen a cada lado
  s.addImage({
    path: SHOT('recortes/03-codigos-dtc.png'),          // 3200 x 1000
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
    'averías que acaba de leer de la centralita.\n\n' +
    '[~15 s. La portada solo abre: no entretenerse.]',
  )
}

// =========================== 2 — EL PROBLEMA ==============================
{
  const s = pres.addSlide()
  s.background = { color: BLANCO }
  cabecera(s, 'EL PROBLEMA', 'El código no es el diagnóstico')

  const pasos = [
    { n: '1', t: 'EL ESCÁNER DEVUELVE UN CÓDIGO',
      b: 'P0401, P2002. Eso es lo que la centralita ha registrado: el síntoma. No es la avería que hay que reparar.' },
    { n: '2', t: 'INTERPRETARLO ES OFICIO',
      b: '¿Válvula EGR obstruida? ¿O un consumo de aceite que ha ido saturando el filtro de partículas? El código no lo dice. Lo dice la experiencia del mecánico.' },
    { n: '3', t: 'Y ESA EXPERIENCIA NO SE GUARDA',
      b: 'Cuando acierta, el hallazgo se queda en su cabeza. Seis meses después entra otro coche con los mismos códigos y se empieza de cero.' },
  ]

  const cw = 3.7, gap = 0.35, x0 = (W - (cw * 3 + gap * 2)) / 2, cy = 2.25, ch = 3.15
  pasos.forEach((p, i) => {
    const x = x0 + i * (cw + gap)
    s.addShape(pres.ShapeType.roundRect, {
      x, y: cy, w: cw, h: ch, rectRadius: 0.1, fill: { color: TARJETA },
    })
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.32, y: cy + 0.32, w: 0.42, h: 0.42, fill: { color: AZUL },
    })
    s.addText(p.n, {
      x: x + 0.32, y: cy + 0.32, w: 0.42, h: 0.42, margin: 0,
      align: 'center', valign: 'middle', fontFace: 'Arial', fontSize: 14, bold: true, color: BLANCO,
    })
    s.addText(p.t, {
      x: x + 0.32, y: cy + 0.95, w: cw - 0.64, h: 0.62, margin: 0, valign: 'top',
      fontFace: 'Arial', fontSize: 12, bold: true, color: TINTA, charSpacing: 0.5,
    })
    s.addText(p.b, {
      x: x + 0.32, y: cy + 1.62, w: cw - 0.64, h: 1.35, margin: 0, valign: 'top',
      fontFace: 'Calibri', fontSize: 12, color: GRIS, lineSpacing: 17,
    })
  })

  s.addText(
    [
      { text: 'El problema no es leer el coche. Es el salto del síntoma a la causa — y que ese salto ', options: { color: TINTA } },
      { text: 'no se acumula.', options: { color: AZUL, bold: true } },
    ],
    { x: 0.85, y: 5.95, w: 11.6, h: 0.5, margin: 0,
      fontFace: 'Arial', fontSize: 17, bold: true },
  )

  pie(s, 2)

  s.addNotes(
    'Un mecánico conecta el escáner y obtiene un código: P0401, P2002. Eso es el ' +
    'síntoma que la centralita ha registrado. No es la avería.\n\n' +
    'Del código a la causa hay un salto, y ese salto lo da la experiencia. Los mismos ' +
    'dos códigos pueden ser una EGR sucia, o pueden ser un motor que consume aceite y ' +
    'ha ido saturando el filtro de partículas. Son reparaciones distintas y facturas ' +
    'muy distintas.\n\n' +
    'Y aquí está lo que a mí me parece el problema de verdad: cuando el mecánico ' +
    'acierta, ese conocimiento no queda en ningún sitio. Se queda en su cabeza. Seis ' +
    'meses después entra otro coche con los mismos códigos y se vuelve a empezar de ' +
    'cero.\n\n' +
    'El diagnóstico no es un problema de lectura de datos. Es un problema de ' +
    'interpretación, y de memoria.\n\n' +
    '[~45 s. Apoyarse en el tercer bloque: es el que abre la slide siguiente.]',
  )
}

await pres.writeFile({ fileName: `${REPO}/docs/presentacion/tfm-intelligent-automotive-diagnostics.pptx` })
console.log('PPTX escrito: 2 slides')
