import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TelemetrySection } from "../../../src/components/dashboard/TelemetrySection";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const numericValues = { rpm: 850, coolant: 90, speed: 50, intake: 35 };
const nullValues = { rpm: null, coolant: null, speed: null, intake: null };

const STATUS_VARIANTS = [
  "Diagnosticando…",
  "Transmisión ECU · 1 Hz",
  "Reconectando…",
  "Sin vehículo",
];

describe("TelemetrySection", () => {
  const onDiagnose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render live numeric values, the Live badge, raw summary and status", () => {
    render(
      <TelemetrySection
        values={numericValues}
        rawSummary="41 0C 5A"
        loading={false}
        streamOk={true}
        canDiagnose={true}
        telemetryStatus="Transmisión ECU · 1 Hz"
        onDiagnose={onDiagnose}
      />,
    );

    expect(screen.getByText("850")).toBeDefined();
    expect(screen.getByText("90")).toBeDefined();
    expect(screen.getByText("050")).toBeDefined();
    expect(screen.getByText("35")).toBeDefined();
    expect(screen.getByText("En Vivo")).toBeDefined();
    expect(screen.getByText("Transmisión ECU · 1 Hz")).toBeDefined();
    expect(screen.getByText("41 0C 5A")).toBeDefined();
    expect(screen.getByText("Iniciar diagnóstico")).toBeDefined();
  });

  it("should render zero placeholders and the raw frame fallback when values are null", () => {
    render(
      <TelemetrySection
        values={nullValues}
        rawSummary={null}
        loading={false}
        streamOk={false}
        canDiagnose={false}
        telemetryStatus="Sin vehículo"
        onDiagnose={onDiagnose}
      />,
    );

    expect(screen.getAllByText("0")).toHaveLength(3);
    expect(screen.getByText("000")).toBeDefined();
    expect(screen.queryByText("En Vivo")).toBeNull();
    expect(screen.getByText("Sin vehículo")).toBeDefined();
    expect(screen.getByText("Aguardando trama OBD-II…")).toBeDefined();
  });

  it("should disable the diagnose button when canDiagnose is false", () => {
    render(
      <TelemetrySection
        values={numericValues}
        rawSummary={null}
        loading={false}
        streamOk={false}
        canDiagnose={false}
        telemetryStatus="Reconectando…"
        onDiagnose={onDiagnose}
      />,
    );

    const btn = screen.getByRole("button", {
      name: "Iniciar diagnóstico",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("should call onDiagnose when the diagnose button is clicked", () => {
    render(
      <TelemetrySection
        values={numericValues}
        rawSummary={null}
        loading={false}
        streamOk={false}
        canDiagnose={true}
        telemetryStatus="Reconectando…"
        onDiagnose={onDiagnose}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Iniciar diagnóstico" }),
    );

    expect(onDiagnose).toHaveBeenCalledTimes(1);
  });

  it("should show loading placeholders and hide the Live badge while loading", () => {
    render(
      <TelemetrySection
        values={nullValues}
        rawSummary={null}
        loading={true}
        streamOk={true}
        canDiagnose={true}
        telemetryStatus="Diagnosticando…"
        onDiagnose={onDiagnose}
      />,
    );

    expect(screen.getByText("----")).toBeDefined();
    expect(screen.getByText("---")).toBeDefined();
    expect(screen.getAllByText("--")).toHaveLength(2);
    expect(screen.queryByText("En Vivo")).toBeNull();
    expect(screen.getAllByText("Diagnosticando…")).toHaveLength(2);
  });

  it("should keep showing values when loading but they are already available", () => {
    render(
      <TelemetrySection
        values={numericValues}
        rawSummary={null}
        loading={true}
        streamOk={true}
        canDiagnose={true}
        telemetryStatus="Diagnosticando…"
        onDiagnose={onDiagnose}
      />,
    );

    expect(screen.getByText("850")).toBeDefined();
    expect(screen.getByText("90")).toBeDefined();
    expect(screen.getAllByText("Diagnosticando…")).toHaveLength(2);
  });

  it("should render any telemetry status string", () => {
    const { rerender } = render(
      <TelemetrySection
        values={numericValues}
        rawSummary={null}
        loading={false}
        streamOk={false}
        canDiagnose={true}
        telemetryStatus={STATUS_VARIANTS[0]}
        onDiagnose={onDiagnose}
      />,
    );

    for (const status of STATUS_VARIANTS) {
      rerender(
        <TelemetrySection
          values={numericValues}
          rawSummary={null}
          loading={false}
          streamOk={false}
          canDiagnose={true}
          telemetryStatus={status}
          onDiagnose={onDiagnose}
        />,
      );
      expect(screen.getByText(status)).toBeDefined();
    }
  });
});
