import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiagnosisPanel } from "../../../src/components/dashboard/DiagnosisPanel";

describe("DiagnosisPanel", () => {
  it("should render the empty message and no severity badge when empty", () => {
    render(
      <DiagnosisPanel
        text={null}
        severity={null}
        empty={true}
        loading={false}
      />,
    );

    expect(screen.getByText("Diagnóstico IA")).toBeDefined();
    expect(
      screen.getByText(
        "Sin datos. Ejecuta un diagnóstico para obtener el informe.",
      ),
    ).toBeDefined();
    expect(screen.queryByText("MEDIA")).toBeNull();
  });

  it("should render the loading message while loading, even when empty", () => {
    render(
      <DiagnosisPanel
        text={null}
        severity={null}
        empty={true}
        loading={true}
      />,
    );

    expect(screen.getByText("Analizando datos OBD-II con IA…")).toBeDefined();
    expect(
      screen.queryByText(
        "Sin datos. Ejecuta un diagnóstico para obtener el informe.",
      ),
    ).toBeNull();
  });

  it("should render the diagnosis result with its severity badge when available", () => {
    const { container } = render(
      <DiagnosisPanel
        text="Fallo de encendido en el cilindro 1."
        severity="high"
        empty={false}
        loading={false}
      />,
    );

    expect(
      screen.getByText("Fallo de encendido en el cilindro 1."),
    ).toBeDefined();
    expect(screen.getByText("ALTA")).toBeDefined();
    expect(container.querySelector(".lucide-triangle-alert")).not.toBeNull();
  });

  it("should not render result text without a severity (Info icon fallback)", () => {
    render(
      <DiagnosisPanel
        text="Fallo de encendido en el cilindro 1."
        severity={null}
        empty={false}
        loading={false}
      />,
    );

    expect(
      screen.queryByText("Fallo de encendido en el cilindro 1."),
    ).toBeNull();
    expect(screen.queryByText("ALTA")).toBeNull();
  });

  it("should not render result text while loading", () => {
    render(
      <DiagnosisPanel
        text="Fallo de encendido en el cilindro 1."
        severity="low"
        empty={false}
        loading={true}
      />,
    );

    expect(screen.getByText("Analizando datos OBD-II con IA…")).toBeDefined();
    expect(
      screen.queryByText("Fallo de encendido en el cilindro 1."),
    ).toBeNull();
  });
});
