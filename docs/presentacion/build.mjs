import pptxgen from 'pptxgenjs'
import fs from 'fs'

const REPO = '/home/user/intelligent-automotive-diagnostics'
const SHOT = (n) => `${REPO}/docs/presentacion/capturas/${n}`

// --- Paleta de marca BIG school -------------------------------------------
const AZUL   = '202CFC'   // azul BIG
const TINTA  = '1A1C2E'   // texto principal / paneles oscuros
const GRIS   = '5A5F73'   // texto secundario
const BLANCO = 'FFFFFF'

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE'          // 13.3 x 7.5
pres.author = 'Jesús Ángel Novillo Lucas-Vaquero'
pres.title  = 'Intelligent Automotive Diagnostics — TFM'

/** Logotipo BIG school reconstruido vectorialmente. */
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

// =========================== SLIDE 1 — PORTADA ============================
const s1 = pres.addSlide()
s1.background = { color: BLANCO }

// Panel oscuro a sangre por la derecha
s1.addShape(pres.ShapeType.rect, { x: 7.35, y: 0, w: 5.95, h: 7.5, fill: { color: TINTA } })

logoBig(s1, 0.85, 0.75)

s1.addText(
  [
    { text: 'Intelligent Automotive\n', options: { color: TINTA } },
    { text: 'Diagnostics',              options: { color: AZUL } },
  ],
  { x: 0.85, y: 2.35, w: 6.1, h: 1.9, margin: 0,
    fontFace: 'Arial', fontSize: 40, bold: true, lineSpacing: 46, align: 'left' },
)

s1.addText('Diagnóstico OBD-II asistido por IA agéntica sobre el protocolo MCP', {
  x: 0.85, y: 4.35, w: 5.9, h: 0.8, margin: 0,
  fontFace: 'Calibri', fontSize: 16, color: GRIS, lineSpacing: 22,
})

s1.addText('Jesús Ángel Novillo Lucas-Vaquero', {
  x: 0.85, y: 5.85, w: 6.0, h: 0.35, margin: 0,
  fontFace: 'Arial', fontSize: 15, bold: true, color: TINTA,
})
s1.addText('Trabajo Fin de Máster  ·  Máster en Desarrollo con IA  ·  BIG school', {
  x: 0.85, y: 6.22, w: 6.0, h: 0.35, margin: 0,
  fontFace: 'Calibri', fontSize: 12, color: GRIS,
})

// Captura real a sangre por el borde derecho
s1.addImage({
  path: SHOT('recortes/03-codigos-dtc.png'),   // 3200x1000
  x: 7.95, y: 2.85, w: 6.4, h: 2.0,
  shadow: { type: 'outer', color: '000000', opacity: 0.45, blur: 22, offset: 6, angle: 135 },
})
s1.addText('LA HERRAMIENTA, EN FUNCIONAMIENTO', {
  x: 7.95, y: 2.25, w: 5.0, h: 0.3, margin: 0,
  fontFace: 'Calibri', fontSize: 10, bold: true, color: 'FFFFFF', charSpacing: 2,
})

s1.addNotes(
  'Buenos días. Soy Jesús Ángel Novillo y presento mi Trabajo Fin de Máster del ' +
  'Máster en Desarrollo con IA de BIG school.\n\n' +
  'El proyecto se llama Intelligent Automotive Diagnostics. Es una herramienta de ' +
  'diagnóstico de averías de automóvil que se conecta al coche por el puerto OBD-II, ' +
  'lee sus datos reales, y razona sobre ellos con un modelo de lenguaje.\n\n' +
  'Lo que ven a la derecha no es una maqueta: es la aplicación funcionando contra un ' +
  'vehículo, mostrando tres averías que acaba de leer de la centralita.\n\n' +
  '[~15 segundos. No entretenerse: la portada solo abre.]',
)

await pres.writeFile({ fileName: `${REPO}/docs/presentacion/tfm-intelligent-automotive-diagnostics.pptx` })
console.log('PPTX escrito')
