import { createFileRoute } from "@tanstack/react-router";

// Base per-scenario telemetry — drives the live stream. The diagnosis endpoint
// stays the source of truth for DTCs/AI text; this stream is the "live ECU feed".
const BASE: Record<
  string,
  {
    rpmIdle: number;
    rpmSpread: number;
    coolant: number;
    coolantDrift: number;
    speed: number;
    speedSpread: number;
    intake: number;
    intakeDrift: number;
  }
> = {
  "vw-golf-tdi": { rpmIdle: 850, rpmSpread: 60, coolant: 88, coolantDrift: 1.5, speed: 0, speedSpread: 0, intake: 42, intakeDrift: 1 },
  "bmw-320d": { rpmIdle: 2500, rpmSpread: 220, coolant: 108, coolantDrift: 2.5, speed: 0, speedSpread: 0, intake: 76, intakeDrift: 2 },
  "seat-leon-tsi": { rpmIdle: 620, rpmSpread: 90, coolant: 90, coolantDrift: 1.2, speed: 0, speedSpread: 0, intake: 45, intakeDrift: 1 },
  "yamaha-mt07": { rpmIdle: 3200, rpmSpread: 400, coolant: 76, coolantDrift: 1, speed: 58, speedSpread: 6, intake: 40, intakeDrift: 1.2 },
  "ford-focus": { rpmIdle: 1875, rpmSpread: 260, coolant: 118, coolantDrift: 2.8, speed: 0, speedSpread: 0, intake: 92, intakeDrift: 2.5 },
};

function jitter(base: number, spread: number) {
  return base + (Math.random() - 0.5) * 2 * spread;
}

function toRaw(rpm: number, speed: number, coolant: number, intake: number) {
  const rpmRaw = Math.max(0, Math.round(rpm * 4));
  const hi = (rpmRaw >> 8) & 0xff;
  const lo = rpmRaw & 0xff;
  const pad = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `41 0C ${pad(hi)} ${pad(lo)} 41 05 ${pad(Math.round(coolant + 40))} 41 0D ${pad(Math.round(speed))} 41 0F ${pad(Math.round(intake + 40))}`;
}

export const Route = createFileRoute("/api/telemetry/$scenarioId")({
  // Empty component keeps TanStack Router from throwing the SPA invariant if
  // a browser navigates here directly. The stream is served by the GET handler.
  component: () => null,
  server: {
    handlers: {
      GET: async ({ params }) => {
        const cfg = BASE[params.scenarioId];
        if (!cfg) {
          return new Response("Unknown scenario", { status: 404 });
        }

        const encoder = new TextEncoder();
        let cancelled = false;
        let timer: ReturnType<typeof setInterval> | undefined;

        const stream = new ReadableStream({
          start(controller) {
            const send = (event: string, data: unknown) => {
              if (cancelled) return;
              controller.enqueue(
                encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
              );
            };

            // Initial hello frame so the client knows the stream is open.
            send("open", { scenarioId: params.scenarioId, ts: Date.now() });

            timer = setInterval(() => {
              const rpm = Math.max(0, jitter(cfg.rpmIdle, cfg.rpmSpread));
              const speed = Math.max(0, jitter(cfg.speed, cfg.speedSpread));
              const coolantTemp = Math.max(0, jitter(cfg.coolant, cfg.coolantDrift));
              const intakeTemp = Math.max(0, jitter(cfg.intake, cfg.intakeDrift));
              send("tick", {
                ts: Date.now(),
                rpm,
                speed,
                coolantTemp,
                intakeTemp,
                rawData: toRaw(rpm, speed, coolantTemp, intakeTemp),
              });
            }, 500);
          },
          cancel() {
            cancelled = true;
            if (timer) clearInterval(timer);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
