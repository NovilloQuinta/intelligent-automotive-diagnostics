# Entrega del TFM — checklist verificado

> Contrastado el 2026-09-01 contra los requisitos oficiales del máster (documento
> "Objetivo / Requisitos / Entrega") y contra el estado real del repositorio.
> Lo que está **listo** se dice con la prueba delante; lo que **falta** se dice sin adornos.

## Resumen

| # | Requisito | Estado |
|---|---|---|
| 1 | Documentación completa (`README.md`) | ⚠️ **Casi** — faltaba usuario/contraseña de prueba y los enlaces de entrega |
| 2 | Código fuente en repositorio público de GitHub | ❌ **Bloqueante** — el repositorio es **privado** y no hay ningún colaborador invitado |
| 3 | Despliegue en funcionamiento + URL en la documentación | ⚠️ **Desplegado, sin documentar** — vive en `diag.jcodinglabs.com`, no aparecía en el README |
| 4 | Slides + URL o documento junto al código | ⚠️ **Existen, fuera de sitio** — solo en la rama `claude/tfm-slide-presentation-2fflme`, no en `main` |
| 5 | Vídeo con explicación propia + captura de pantalla | ❌ **No existe** — guion listo en [`guion-video.md`](guion-video.md) |

---

## 1. Documentación (`README.md`)

| Apartado exigido | Dónde está | Estado |
|---|---|---|
| a. Descripción general | `README.md` — encabezado | ✅ |
| b. Stack tecnológico | `README.md` § Stack (tabla de 14 filas) | ✅ |
| c. Instalación y ejecución | `README.md` § Inicio rápido + § Variables de entorno | ✅ |
| d. Estructura del proyecto | `README.md` § Arquitectura (árbol de `apps/core-api/src/`) | ✅ |
| e. Funcionalidades principales | `README.md` § Dashboard UI + tabla de endpoints | ✅ |
| f. **Usuario y contraseña de prueba** | `README.md` § Acceso de prueba | ⚠️ **rellenar las credenciales reales** |

Además, el requisito pide que en el directorio del código estén **la documentación, la
información del despliegue y las slides**. Documentación (`docs/`, 9 ADRs, 6 documentos
técnicos en `docs/tfm/`) y despliegue (`docs/infrastructure/despliegue.md`) sí están.
Las slides, no todavía — ver el punto 4.

## 2. Repositorio — **el bloqueante de verdad**

`NovilloQuinta/intelligent-automotive-diagnostics` está en **privado**
(`"visibility": "private"`) y su único colaborador es el propio autor.

Las dos salidas que admite el enunciado:

- **Hacerlo público** — Settings → General → Danger Zone → *Change visibility*.
  Antes de darle: comprobar que no hay secretos en el historial (`.env` está en
  `.gitignore`, pero conviene una pasada de *secret scanning* sobre el histórico).
- **Dejarlo privado** — solo si está *perfectamente justificado*, y entonces hay que
  **invitar a `mouredev@gmail.com`** como colaborador (Settings → Collaborators).
  Hoy no hay ninguna invitación cursada.

Recomendación: público. Un TFM privado obliga al corrector a un paso extra y la
justificación tendría que sostenerse sola.

## 3. Despliegue

Vivo en **https://diag.jcodinglabs.com** (SPA + API bajo el mismo dominio; Caddy delante,
contenedores en loopback). La cadena CI → CD, el *rollback* y las verificaciones post-deploy
están en [`infrastructure/despliegue.md`](infrastructure/despliegue.md).

Lo que faltaba: **la URL no aparecía en el README**, y el requisito lo pide de forma
explícita ("añádela también en la documentación"). Ya está añadida.

> Nota: la última verificación registrada es del 29/08 (`docs/estado-actual.md`).
> Conviene repetirla el mismo día de la entrega: `/health` devolviendo JSON y la SPA
> sirviendo assets con hash.

## 4. Slides

El deck existe y está terminado en lo esencial: **21 diapositivas, ~20:35**, generado con
`pptxgenjs` desde `docs/presentacion/build.mjs`, con notas de orador completas y capturas
de la aplicación real a 3200×2000.

El problema es **dónde vive**: la rama `claude/tfm-slide-presentation-2fflme`, que está
405 commits por delante de `main` y 56 por detrás. En `main`, en `develop` y en la rama de
entrega, `docs/presentacion/` **no existe**.

Hay que traerlo. Como mínimo el `.pptx`, el `.pdf` y `build.mjs`; las capturas pesan pero
son las que justifican el deck. Y publicarlo con URL de acceso público (Drive o
Google Slides) para el formulario.

Pendientes propios del deck, en `docs/presentacion/pendientes.md`: repasar títulos,
ensayar con cronómetro y capturas del diagnóstico cognitivo (necesitan `LLM_API_KEY` real).

## 5. Vídeo

No existe. Es el único entregable que hay que producir desde cero.

Lo que ya está resuelto y evita empezar en blanco:

- [`guion-video.md`](guion-video.md) — guion cerrado, minutado, con qué decir y qué tocar
  en pantalla. **Es el que hay que seguir.**
- [`guion-demo.md`](guion-demo.md) — guion de la demo pantalla a pantalla, con la
  configuración previa y qué evitar en cámara.
- Las notas de orador del deck, que son el texto de la parte explicativa.

Requisitos formales del vídeo, del enunciado:

- **Obligatorio** capturar la pantalla mientras explicas.
- **Opcional** la cámara con tu cara.
- URL de acceso público (YouTube sin listar o Drive con enlace), **también en la
  documentación**.

## Formulario de entrega — lo que te van a pedir

| Campo | Valor |
|---|---|
| Nombre completo | Jesús Ángel Novillo Lucas-Vaquero |
| Email de inscripción | `jesusangelquintanar@gmail.com` |
| URL del repositorio | https://github.com/NovilloQuinta/intelligent-automotive-diagnostics |
| URL de despliegue | https://diag.jcodinglabs.com |
| URL de las slides | *pendiente de publicar* |
| URL del vídeo | *pendiente de grabar* |
| Usuario y contraseña de prueba | *pendiente de fijar* — ver § Acceso de prueba del README |

## Orden sugerido

1. Traer `docs/presentacion/` a `main` (slides dentro del código, como pide el enunciado).
2. Fijar el usuario de prueba en el despliegue y escribirlo en el README.
3. Hacer público el repositorio (o invitar a `mouredev@gmail.com`).
4. Grabar el vídeo con [`guion-video.md`](guion-video.md) y publicarlo.
5. Subir las slides a Drive, coger la URL pública.
6. Pegar las tres URLs en el README y rellenar el formulario.

Los pasos 1–3 no dependen de nada y se cierran hoy. El 4 es el único que lleva tiempo real.
