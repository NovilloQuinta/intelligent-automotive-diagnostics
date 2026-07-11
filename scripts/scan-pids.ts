import { createConnection } from "node:net";

const HOST = process.env.ELM327_HOST || "localhost";
const PORT = Number(process.env.ELM327_PORT) || 35000;

function query(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const c = createConnection(PORT, HOST);
    let d = "";
    c.on("data", (chunk) => { d += chunk.toString(); });
    c.setTimeout(2000);
    c.on("timeout", () => { c.destroy(); resolve(d); });
    c.on("error", reject);
    c.on("connect", () => { c.write(`${cmd}\r`); });
  });
}

function extractData(response: string): string | null {
  const match = response.match(/41 ([0-9A-F]{2}) ([0-9A-F ]+)/i);
  return match ? match[2].trim() : null;
}

const PID_NAMES: Record<string, string> = {
  "00": "PIDs supported [01-20]",
  "01": "Monitor status",
  "02": "DTC freeze frame",
  "03": "Fuel system status",
  "04": "Calculated engine load",
  "05": "Engine coolant temp",
  "06": "STFT Bank 1",
  "07": "LTFT Bank 1",
  "08": "STFT Bank 2",
  "09": "LTFT Bank 2",
  "0A": "Fuel pressure",
  "0B": "Intake manifold pressure",
  "0C": "Engine RPM",
  "0D": "Vehicle speed",
  "0E": "Timing advance",
  "0F": "Intake air temp",
  "10": "MAF air flow rate",
  "11": "Throttle position",
  "12": "Secondary air status",
  "13": "O2 sensors present",
  "14": "O2 Sensor 1",
  "15": "O2 Sensor 2",
  "1C": "OBD standards",
  "1F": "Run time since start",
  "20": "PIDs supported [21-40]",
  "21": "Distance MIL on",
  "22": "Fuel rail pressure",
  "2C": "Commanded EGR",
  "2D": "EGR Error",
  "2E": "Commanded evap purge",
  "2F": "Fuel level",
  "30": "Warm-ups since clear",
  "31": "Distance since clear",
  "33": "Barometric pressure",
  "3C": "Catalyst temp B1S1",
  "40": "PIDs supported [41-60]",
  "41": "Monitor status drive",
  "42": "Control module voltage",
  "43": "Absolute load",
  "44": "Commanded lambda",
  "45": "Relative throttle",
  "46": "Ambient air temp",
  "4D": "Time MIL on",
  "4F": "Max values",
  "51": "Fuel type",
  "52": "Ethanol fuel %",
  "5A": "Relative accel pedal",
  "5C": "Engine oil temp",
  "5E": "Engine fuel rate",
  "60": "PIDs supported [61-80]",
  "61": "Driver torque",
  "62": "Actual torque",
  "63": "Engine ref torque",
  "67": "Coolant temp sensors",
};

async function main() {
  console.log("Escaneando PIDs del escenario 'car' (Toyota Auris Hybrid)...\n");

  const supported: string[] = [];
  const notSupported: string[] = [];

  const pidList = Object.keys(PID_NAMES).sort();

  for (const pid of pidList) {
    const raw = await query(`01 ${pid}`);
    const noData = raw.includes("NO DATA") || raw.includes("SEARCHING");

    if (!noData) {
      const data = extractData(raw);
      if (data) {
        const hexName = `0x${pid}`;
        const name = PID_NAMES[pid];
        console.log(`[OK]    PID ${hexName.padEnd(5)} ${name.padEnd(30)} data: ${data}`);
        supported.push(pid);
      } else {
        notSupported.push(pid);
      }
    } else {
      notSupported.push(pid);
    }
  }

  console.log(`\n--- Resumen ---`);
  console.log(`Soportados:  ${supported.length}/${pidList.length}`);
  console.log(`No soportados: ${notSupported.length}/${pidList.length}`);
  console.log(`\nPIDs NO soportados: ${notSupported.map(p => `0x${p}`).join(", ")}`);
}

void main();
