import { createFileRoute } from "@tanstack/react-router";

type Severity = "low" | "medium" | "high" | "critical";

interface DiagnosisResult {
  rawData: string;
  parsedValues: { rpm: number; coolantTemp: number; speed: number; intakeTemp: number };
  dtcCodes: { code: string; description: string }[];
  diagnosisText: string;
  severity: Severity;
}

const RESULTS: Record<string, DiagnosisResult> = {
  "vw-golf-tdi": {
    rawData: "41 0C 1A F8 41 05 5C 41 0D 00 41 0F 32",
    parsedValues: { rpm: 850, coolantTemp: 88, speed: 0, intakeTemp: 42 },
    dtcCodes: [],
    diagnosisText:
      "Vehículo en ralentí estable. Todos los parámetros dentro de rangos nominales.\n\nNo se detectan códigos de fallo (DTC) almacenados en la ECU. El sistema de refrigeración opera en temperatura de servicio (88°C) y la admisión presenta valores coherentes con temperatura ambiente.\n\nRecomendación: continuar con mantenimiento preventivo según intervalos de fábrica.",
    severity: "low",
  },
  "bmw-320d": {
    rawData: "41 0C 27 10 41 05 6E 41 0D 00 43 03 01 2C 01 34",
    parsedValues: { rpm: 2500, coolantTemp: 110, speed: 0, intakeTemp: 78 },
    dtcCodes: [
      { code: "P012C", description: "Sensor de presión de turbo — señal baja" },
      { code: "P0134", description: "Sonda lambda banco 1 sensor 1 — sin actividad" },
    ],
    diagnosisText:
      "ALERTA: Temperatura de refrigerante elevada (110°C) con motor en carga parcial.\n\nSe han detectado dos códigos DTC relacionados con el sistema de admisión y control de mezcla. La sonda lambda no reporta actividad, lo que provoca funcionamiento en bucle abierto y sobrecalentamiento por mezcla incorrecta.\n\nAcciones sugeridas:\n1. Sustituir sonda lambda banco 1 sensor 1\n2. Inspeccionar sensor MAP del turbocompresor\n3. Verificar circuito eléctrico y conectores\n4. Revisar nivel y estado del refrigerante antes de rodaje",
    severity: "high",
  },
  "seat-leon-tsi": {
    rawData: "41 0C 09 60 41 05 5A 41 0D 00 43 01 30 01",
    parsedValues: { rpm: 600, coolantTemp: 90, speed: 0, intakeTemp: 45 },
    dtcCodes: [{ code: "P0301", description: "Fallo de encendido detectado — cilindro 1" }],
    diagnosisText:
      "Se detecta fallo de encendido en el cilindro 1. RPM inestables en ralentí (600 rpm oscilantes).\n\nCausas más probables por orden de frecuencia:\n1. Bobina de encendido cilindro 1 defectuosa\n2. Bujía desgastada o con separación incorrecta\n3. Inyector obstruido o eléctricamente defectuoso\n4. Compresión baja en el cilindro\n\nRecomendación: realizar prueba de intercambio de bobina con cilindro adyacente y observar si el fallo migra.",
    severity: "medium",
  },
  "yamaha-mt07": {
    rawData: "41 0C 0F A0 41 05 4C 41 0D 3C 41 0F 28",
    parsedValues: { rpm: 1000, coolantTemp: 76, speed: 60, intakeTemp: 40 },
    dtcCodes: [],
    diagnosisText:
      "Motocicleta en marcha estable a 60 km/h. Parámetros dentro de rangos operativos normales.\n\nNo se registran códigos de avería. Sistema de gestión electrónica del motor operativo.",
    severity: "low",
  },
  "ford-focus": {
    rawData: "41 0C 1D 4C 41 05 78 41 0D 00 43 04 01 71 02 19 03 00 04 20",
    parsedValues: { rpm: 1875, coolantTemp: 120, speed: 0, intakeTemp: 95 },
    dtcCodes: [
      { code: "P0171", description: "Sistema demasiado pobre — banco 1" },
      { code: "P0219", description: "Régimen del motor por encima del límite" },
      { code: "P0420", description: "Eficiencia del catalizador por debajo del umbral" },
    ],
    diagnosisText:
      "FALLO CRÍTICO: sobrecalentamiento severo (120°C) combinado con mezcla pobre y régimen elevado.\n\nEl catalizador presenta eficiencia degradada, lo que sumado a la mezcla pobre puede provocar daño térmico irreversible en la cámara de combustión y válvulas.\n\nDetener el vehículo INMEDIATAMENTE. No arrancar hasta:\n1. Verificar fugas en el circuito de admisión (falso aire)\n2. Comprobar presión de combustible y estado de inyectores\n3. Inspeccionar catalizador y sondas lambda pre/post\n4. Comprobar sistema de refrigeración: bomba, termostato, ventilador\n\nRiesgo de avería mayor si continúa el uso.",
    severity: "critical",
  },
};

export const Route = createFileRoute("/api/diagnosis")({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { scenarioId?: string };
          const scenarioId = body.scenarioId;
          if (!scenarioId || !RESULTS[scenarioId]) {
            return new Response(JSON.stringify({ error: "Escenario no encontrado" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
          // Simulate scan latency
          await new Promise((r) => setTimeout(r, 1400));
          return new Response(JSON.stringify(RESULTS[scenarioId]), {
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ error: "Petición inválida" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
