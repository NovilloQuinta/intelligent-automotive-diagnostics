import { createConnection } from "node:net";

const HOST = process.env.ELM327_HOST || "localhost";
const PORT = Number(process.env.ELM327_PORT) || 35000;

function sendCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = createConnection(PORT, HOST, () => {
      client.write(`${cmd}\r`);
    });

    let data = "";
    client.on("data", (chunk) => {
      data += chunk.toString();
    });

    client.setTimeout(2000);
    client.on("timeout", () => {
      client.destroy();
      resolve(data);
    });
    client.on("error", reject);
  });
}

function parseFrames(raw: string): string[] {
  return raw
    .split(/\r\n?/)
    .map((l) => l.trim())
    .filter((l) => l && l !== ">" && !l.startsWith("AT") && l !== "OK");
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd) {
    console.error("Uso: pnpm tsx scripts/send-obd.ts <comando>");
    console.error('Ej:    pnpm tsx scripts/send-obd.ts "01 0C"');
    process.exit(1);
  }

  const raw = await sendCommand(cmd);
  const frames = parseFrames(raw);

  console.log(`> ${cmd}`);
  for (const frame of frames) {
    console.log(`  ${frame}`);
  }
}

void main();
