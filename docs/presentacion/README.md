# Presentacion de defensa del TFM

Deck de la defensa ante el tribunal. **15 diapositivas, 15 minutos.**

| Fichero | Que es |
|---|---|
| `tfm-intelligent-automotive-diagnostics.pptx` | El deck. Se genera, no se edita a mano |
| `build.mjs` | Generador (pptxgenjs). **Fuente de verdad del deck** |
| `capturas/` | Capturas de la app corriendo contra los emuladores, a 3200x2000 |
| `capturas/recortes/` | Las mismas, recortadas a la zona con contenido, que es lo que entra en las slides |

## Regenerar el deck

```bash
npm install pptxgenjs        # fuera del workspace: no es dependencia del proyecto
node docs/presentacion/build.mjs
```

## Volver a sacar las capturas

No hace falta Docker: el emulador ELM327 es Python puro.

```bash
pip install "setuptools<67" wheel && pip install --no-build-isolation ELM327-emulator
cd docker/elm327
for s in audi kawasaki toyota; do (tail -f /dev/null | python3 run_$s.py &) ; done

# .env necesita LLM_BASE_URL y LLM_MODEL ademas de LLM_API_KEY, o la API no arranca
pnpm dev        # API  :4000
pnpm dev:ui     # UI   :5173
```

Recorrido de la app: login -> elegir vehiculo -> **Entrar a diagnostico** ->
**INICIAR DIAGNOSTICO** -> ya se puede navegar por las ocho pestanas.
Sin ese ultimo paso las pantallas de DTC y ECUs salen vacias.

## Paleta

Marca BIG school. Los hex se estimaron de una foto del logotipo, corrigiendo el balance
de blancos. **Validados por el autor**: no hace falta el fichero oficial.

| Uso | Hex |
|---|---|
| Azul BIG (acento) | `#202CFC` |
| Tinta (texto y paneles oscuros) | `#1A1C2E` |
| Texto secundario | `#5A5F73` |

El logotipo del deck esta **reconstruido con formas y texto** (rectangulo azul + Arial),
no es el fichero oficial. El autor lo ha dado por bueno, asi que no hay que sustituirlo.
