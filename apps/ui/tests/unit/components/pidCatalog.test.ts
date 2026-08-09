import { describe, expect, it } from "vitest";
import {
  buildPidRows,
  mergePidRows,
  pidObservationToRow,
  FIXED_PID_CODES,
  type PidRow,
} from "../../../src/components/dashboard/pidCatalog";

const PARSED_VALUES = {
  rpm: 850,
  coolantTemp: 90,
  speed: 50,
  intakeTemp: 35,
};

function aiRow(code: string, value = "14 %"): PidRow {
  return {
    code,
    description: "PID de la IA",
    value,
    status: "ok",
    source: "ai",
  };
}

describe("FIXED_PID_CODES", () => {
  it("contains exactly the 4 codes rendered from parsedValues", () => {
    expect([...FIXED_PID_CODES].sort()).toEqual([
      "01 05",
      "01 0C",
      "01 0D",
      "01 0F",
    ]);
  });
});

describe("buildPidRows", () => {
  it("marks every fixed row with source fixed", () => {
    const rows = buildPidRows(PARSED_VALUES);

    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.source === "fixed")).toBe(true);
  });
});

describe("pidObservationToRow", () => {
  it("maps an observation to a formatted AI row", () => {
    const row = pidObservationToRow({
      code: "01 42",
      name: "Voltaje del módulo de control",
      unit: "V",
      value: 10.9,
      status: "review",
    });

    expect(row).toEqual({
      code: "01 42",
      description: "Voltaje del módulo de control",
      value: "10.9 V",
      status: "review",
      source: "ai",
    });
  });

  it("omits the unit when the observation has none", () => {
    const row = pidObservationToRow({
      code: "01 11",
      name: "Posición del acelerador",
      value: 14,
      status: "ok",
    });

    expect(row.value).toBe("14");
  });
});

describe("mergePidRows", () => {
  it("appends AI rows whose code is not a fixed one", () => {
    const fixed = buildPidRows(PARSED_VALUES);

    const merged = mergePidRows(fixed, [aiRow("01 11"), aiRow("01 42")]);

    expect(merged).toHaveLength(6);
    expect(merged.slice(0, 4)).toEqual(fixed);
    expect(merged.slice(4).map((r) => r.code)).toEqual(["01 11", "01 42"]);
  });

  it("discards AI rows whose code is already a fixed one", () => {
    const fixed = buildPidRows(PARSED_VALUES);

    const merged = mergePidRows(fixed, [
      aiRow("01 0C"),
      aiRow("01 05"),
      aiRow("01 0D"),
      aiRow("01 0F"),
      aiRow("01 11"),
    ]);

    expect(merged.map((r) => r.code)).toEqual([
      "01 0C",
      "01 05",
      "01 0D",
      "01 0F",
      "01 11",
    ]);
  });

  it("deduplicates AI rows by code keeping the last one", () => {
    const fixed = buildPidRows(PARSED_VALUES);

    const merged = mergePidRows(fixed, [
      aiRow("01 11", "14 %"),
      aiRow("01 11", "52 %"),
    ]);

    expect(merged).toHaveLength(5);
    expect(merged[4].value).toBe("52 %");
  });

  it("returns only the fixed rows when there are no AI rows", () => {
    const fixed = buildPidRows(PARSED_VALUES);

    expect(mergePidRows(fixed, null)).toEqual(fixed);
    expect(mergePidRows(fixed, [])).toEqual(fixed);
  });
});
