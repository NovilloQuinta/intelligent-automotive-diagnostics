import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PidsTable } from "../../../src/components/dashboard/PidsTable";
import type { PidRow } from "../../../src/components/dashboard/pidCatalog";

const NORMAL_VALUES = { rpm: 850, coolantTemp: 90, speed: 50, intakeTemp: 35 };

function aiRow(code: string, description: string, value: string): PidRow {
  return { code, description, value, status: "ok", source: "ai" };
}

describe("PidsTable", () => {
  it("should render the empty prompt and a dash count when empty", () => {
    render(<PidsTable parsedValues={null} empty={true} />);

    expect(
      screen.getByText("Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO"),
    ).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
    expect(screen.queryByText("Código")).toBeNull();
  });

  it("should render neither the prompt nor the table while loading without a result yet", () => {
    render(<PidsTable parsedValues={null} empty={false} />);

    expect(
      screen.queryByText("Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO"),
    ).toBeNull();
    expect(screen.getByText("—")).toBeDefined();
    expect(screen.queryByText("Código")).toBeNull();
  });

  it("should list all 4 PIDs with their code, description and formatted value", () => {
    render(<PidsTable parsedValues={NORMAL_VALUES} empty={false} />);

    expect(screen.getByText("4 registrados")).toBeDefined();
    expect(screen.getByText("01 0C")).toBeDefined();
    expect(screen.getByText("Régimen del motor")).toBeDefined();
    expect(screen.getByText("850 RPM")).toBeDefined();
    expect(screen.getByText("01 05")).toBeDefined();
    expect(screen.getByText("Temperatura del refrigerante")).toBeDefined();
    expect(screen.getByText("90°C")).toBeDefined();
    expect(screen.getByText("01 0D")).toBeDefined();
    expect(screen.getByText("Velocidad del vehículo")).toBeDefined();
    expect(screen.getByText("50 km/h")).toBeDefined();
    expect(screen.getByText("01 0F")).toBeDefined();
    expect(screen.getByText("Temperatura del aire de admisión")).toBeDefined();
    expect(screen.getByText("35°C")).toBeDefined();
  });

  it("should mark every PID as OK when all values are within normal range", () => {
    render(<PidsTable parsedValues={NORMAL_VALUES} empty={false} />);

    expect(screen.getAllByText("OK")).toHaveLength(4);
    expect(screen.queryByText("Revisar")).toBeNull();
  });

  it("should mark RPM as Revisar above the danger threshold, OK at the boundary", () => {
    const { rerender } = render(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, rpm: 6500 }}
        empty={false}
      />,
    );
    expect(screen.getAllByText("OK")).toHaveLength(4);

    rerender(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, rpm: 6501 }}
        empty={false}
      />,
    );
    expect(screen.getAllByText("Revisar")).toHaveLength(1);
    expect(screen.getAllByText("OK")).toHaveLength(3);
  });

  it("should mark coolant temp as Revisar above the alarm threshold, OK at the boundary", () => {
    const { rerender } = render(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, coolantTemp: 100 }}
        empty={false}
      />,
    );
    expect(screen.getAllByText("OK")).toHaveLength(4);

    rerender(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, coolantTemp: 101 }}
        empty={false}
      />,
    );
    expect(screen.getAllByText("Revisar")).toHaveLength(1);
  });

  it("should mark intake temp as Revisar above the warn threshold, OK at the boundary", () => {
    const { rerender } = render(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, intakeTemp: 80 }}
        empty={false}
      />,
    );
    expect(screen.getAllByText("OK")).toHaveLength(4);

    rerender(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, intakeTemp: 81 }}
        empty={false}
      />,
    );
    expect(screen.getAllByText("Revisar")).toHaveLength(1);
  });

  it("should always mark speed as OK regardless of magnitude", () => {
    render(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, speed: 999 }}
        empty={false}
      />,
    );

    expect(screen.getAllByText("OK")).toHaveLength(4);
    expect(screen.queryByText("Revisar")).toBeNull();
  });

  it("should list the AI rows after the 4 fixed ones with an AI origin badge", () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        aiRows={[
          aiRow("01 11", "Posición del acelerador", "14 %"),
          aiRow("01 42", "Voltaje del módulo de control", "14.2 V"),
        ]}
        aiLoading={false}
      />,
    );

    expect(screen.getByText("6 registrados")).toBeDefined();
    expect(screen.getByText("01 11")).toBeDefined();
    expect(screen.getByText("01 42")).toBeDefined();
    expect(screen.getAllByText("IA")).toHaveLength(2);

    const codes = screen
      .getAllByTestId("pid-row")
      .map((row) => row.getAttribute("data-code"));
    expect(codes).toEqual([
      "01 0C",
      "01 05",
      "01 0D",
      "01 0F",
      "01 11",
      "01 42",
    ]);
  });

  it("should not duplicate a row when the AI reads an already fixed PID", () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        aiRows={[aiRow("01 0C", "Régimen del motor", "999 rpm")]}
        aiLoading={false}
      />,
    );

    expect(screen.getByText("4 registrados")).toBeDefined();
    expect(screen.getAllByText("01 0C")).toHaveLength(1);
    expect(screen.getByText("850 RPM")).toBeDefined();
    expect(screen.queryByText("IA")).toBeNull();
  });

  it("should show a secondary loading indicator without hiding the fixed rows", () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        aiRows={null}
        aiLoading={true}
      />,
    );

    expect(screen.getByText("Buscando PIDs adicionales…")).toBeDefined();
    expect(screen.getByText("01 0C")).toBeDefined();
    expect(screen.getAllByTestId("pid-row")).toHaveLength(4);
  });

  it("should show a brief failure notice when the AI search errored with no rows", () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        aiRows={[]}
        aiLoading={false}
        aiError={{ kind: "timeout", message: "La petición tardó demasiado" }}
      />,
    );

    expect(screen.getByText(/no se pudieron buscar/i)).toBeDefined();
  });

  it("should not show a failure notice when there are no AI rows and no error", () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        aiRows={[]}
        aiLoading={false}
        aiError={null}
      />,
    );

    expect(screen.queryByText(/no se pudieron buscar/i)).toBeNull();
  });

  it("should render neither the loading row nor AI rows when the capability is off", () => {
    const { rerender } = render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        aiRows={null}
        aiLoading={false}
      />,
    );
    expect(screen.queryByText("Buscando PIDs adicionales…")).toBeNull();
    expect(screen.getAllByTestId("pid-row")).toHaveLength(4);

    rerender(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        aiRows={[]}
        aiLoading={false}
      />,
    );
    expect(screen.queryByText("Buscando PIDs adicionales…")).toBeNull();
    expect(screen.queryByText("IA")).toBeNull();
    expect(screen.getAllByTestId("pid-row")).toHaveLength(4);
  });
});
