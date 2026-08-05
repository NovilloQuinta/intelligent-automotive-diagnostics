import { createFileRoute } from "@tanstack/react-router";

export const SCENARIOS = [
  { id: "vw-golf-tdi", name: "VW Golf 2.0 TDI", plate: "1234-ABC", year: 2019, type: "car" as const },
  { id: "bmw-320d", name: "BMW 320d E90", plate: "5678-XYZ", year: 2012, type: "car" as const },
  { id: "seat-leon-tsi", name: "SEAT León 1.4 TSI", plate: "9012-DEF", year: 2021, type: "car" as const },
  { id: "yamaha-mt07", name: "Yamaha MT-07", plate: "3456-MOT", year: 2020, type: "moto" as const },
  { id: "ford-focus", name: "Ford Focus 1.6", plate: "7890-GHI", year: 2016, type: "car" as const },
];

export const Route = createFileRoute("/api/scenarios")({
  component: () => null,
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(SCENARIOS), {
          headers: { "Content-Type": "application/json" },
        }),
    },
  },
});
