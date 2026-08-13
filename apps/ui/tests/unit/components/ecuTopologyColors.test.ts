import { describe, expect, it } from "vitest";
import {
  ECU_TOPOLOGY_FALLBACK_COLOR,
  getEcuTopologyColor,
} from "../../../src/components/dashboard/ecuTopologyColors";

const CATALOGUED = ["ECM", "TCM", "ABS", "BCM", "SRS", "IPC"] as const;

describe("getEcuTopologyColor", () => {
  it("devuelve un color definido para cada tipo catalogado", () => {
    for (const type of CATALOGUED) {
      const color = getEcuTopologyColor(type);
      expect(color).toBeTypeOf("string");
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("asigna un color distinto a cada tipo catalogado", () => {
    const colors = CATALOGUED.map(getEcuTopologyColor);
    expect(new Set(colors).size).toBe(CATALOGUED.length);
  });

  it("ningun tipo catalogado usa el color de fallback", () => {
    for (const type of CATALOGUED) {
      expect(getEcuTopologyColor(type)).not.toBe(ECU_TOPOLOGY_FALLBACK_COLOR);
    }
  });

  it("devuelve el color de fallback para un tipo no catalogado, sin lanzar", () => {
    expect(() => getEcuTopologyColor("UNKNOWN_TYPE")).not.toThrow();
    expect(getEcuTopologyColor("UNKNOWN_TYPE")).toBe(ECU_TOPOLOGY_FALLBACK_COLOR);
  });

  it("es determinista: dos invocaciones con el mismo tipo dan el mismo color", () => {
    expect(getEcuTopologyColor("UNKNOWN_TYPE")).toBe(getEcuTopologyColor("UNKNOWN_TYPE"));
    expect(getEcuTopologyColor("ECM")).toBe(getEcuTopologyColor("ECM"));
  });

  // Decision explicita (tasks 1.1): TODO lo no catalogado comparte un unico gris
  // neutro, no un color derivado por hashing. Un color distinto por tipo
  // desconocido insinuaria una semantica que no existe; el gris comunica "no
  // identificada", que es informacion real para el mecanico. Los nodos siguen
  // distinguiendose por su nombre.
  it("todos los tipos no catalogados comparten el mismo gris neutro", () => {
    expect(getEcuTopologyColor("otro-tipo-no-catalogado")).toBe(
      getEcuTopologyColor("UNKNOWN_TYPE"),
    );
    expect(getEcuTopologyColor("")).toBe(ECU_TOPOLOGY_FALLBACK_COLOR);
  });

  it("es insensible a mayusculas/minusculas en el tipo", () => {
    expect(getEcuTopologyColor("ecm")).toBe(getEcuTopologyColor("ECM"));
  });
});
