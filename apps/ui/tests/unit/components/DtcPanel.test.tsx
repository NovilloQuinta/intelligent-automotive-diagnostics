import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DtcPanel } from "../../../src/components/dashboard/DtcPanel";

describe("DtcPanel", () => {
  it("should render the empty prompt and a dash count when empty", () => {
    render(<DtcPanel codes={null} severity={null} empty={true} />);

    expect(
      screen.getByText("Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO"),
    ).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
    expect(screen.queryByText("Ningún código de error")).toBeNull();
  });

  it("should render the no-codes message and zero count for an empty array", () => {
    render(<DtcPanel codes={[]} severity={null} empty={false} />);

    expect(
      screen.getByText(
        "Ningún código de error — el vehículo no presenta fallos registrados.",
      ),
    ).toBeDefined();
    expect(screen.getByText("0 registrados")).toBeDefined();
  });

  it("should list DTC codes with the severity meta when present", () => {
    const codes = [
      { code: "P0301", description: "Cilindro 1: fallo de encendido" },
    ];
    const { container } = render(
      <DtcPanel codes={codes} severity="critical" empty={false} />,
    );

    expect(screen.getByText("P0301")).toBeDefined();
    expect(screen.getByText("Cilindro 1: fallo de encendido")).toBeDefined();
    expect(screen.getByText("1 registrado")).toBeDefined();
    expect(container.querySelector(".lucide-shield-alert")).not.toBeNull();
  });

  it("should use the default medium severity meta and plural count when severity is null", () => {
    const codes = [
      { code: "P0420", description: "Eficiencia del catalizador" },
      { code: "P0128", description: "Termostato" },
    ];
    const { container } = render(
      <DtcPanel codes={codes} severity={null} empty={false} />,
    );

    expect(screen.getByText("2 registrados")).toBeDefined();
    expect(screen.getByText("P0420")).toBeDefined();
    expect(screen.getByText("P0128")).toBeDefined();
    expect(container.querySelector(".lucide-triangle-alert")).not.toBeNull();
  });
});
