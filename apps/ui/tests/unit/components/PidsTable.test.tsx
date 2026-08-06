import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PidsTable } from "../../../src/components/dashboard/PidsTable";

const NORMAL_VALUES = { rpm: 850, coolantTemp: 90, speed: 50, intakeTemp: 35 };

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
});
