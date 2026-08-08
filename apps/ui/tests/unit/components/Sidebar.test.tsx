import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "../../../src/components/layout/Sidebar";

describe("Sidebar", () => {
  it("should not show a DTC badge when there is no diagnosis yet", () => {
    render(<Sidebar active="vehicle" onChange={vi.fn()} />);

    const dtcButton = screen.getByTitle("Códigos DTC");
    expect(dtcButton.querySelector(".bg-destructive")).toBeNull();
  });

  it("should not show a DTC badge when the diagnosis resolved with zero DTCs", () => {
    render(
      <Sidebar
        active="vehicle"
        onChange={vi.fn()}
        dtcCount={0}
        hasDiagnosis={true}
      />,
    );

    const dtcButton = screen.getByTitle("Códigos DTC");
    expect(dtcButton.querySelector(".bg-destructive")).toBeNull();
  });

  it("should show the DTC count badge when the diagnosis found active DTCs", () => {
    render(
      <Sidebar
        active="vehicle"
        onChange={vi.fn()}
        dtcCount={3}
        hasDiagnosis={true}
      />,
    );

    const dtcButton = screen.getByTitle("Códigos DTC");
    expect(dtcButton.querySelector(".bg-destructive")).not.toBeNull();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("should update the badge count when a new diagnosis resolves with a different count", () => {
    const { rerender } = render(
      <Sidebar
        active="vehicle"
        onChange={vi.fn()}
        dtcCount={2}
        hasDiagnosis={true}
      />,
    );

    expect(screen.getByText("2")).toBeDefined();

    rerender(
      <Sidebar
        active="vehicle"
        onChange={vi.fn()}
        dtcCount={5}
        hasDiagnosis={true}
      />,
    );

    expect(screen.queryByText("2")).toBeNull();
    expect(screen.getByText("5")).toBeDefined();
  });

  it("should not show the previous vehicle's badge count after switching vehicles without a new diagnosis", () => {
    const { rerender } = render(
      <Sidebar
        active="vehicle"
        onChange={vi.fn()}
        dtcCount={4}
        hasDiagnosis={true}
      />,
    );

    expect(screen.getByText("4")).toBeDefined();

    // Cambiar de vehículo resetea el diagnóstico: sin dtcCount ni hasDiagnosis.
    rerender(
      <Sidebar
        active="vehicle"
        onChange={vi.fn()}
        dtcCount={0}
        hasDiagnosis={false}
      />,
    );

    expect(screen.queryByText("4")).toBeNull();
    const dtcButton = screen.getByTitle("Códigos DTC");
    expect(dtcButton.querySelector(".bg-destructive")).toBeNull();
  });

  it("should mark the active section with the primary accent", () => {
    render(<Sidebar active="dtc" onChange={vi.fn()} />);

    const dtcButton = screen.getByTitle("Códigos DTC");
    const icon = dtcButton.querySelector("svg");
    expect(icon?.getAttribute("class")).toContain("text-primary");
  });

  it("should call onChange with the section id when a sidebar item is clicked", () => {
    const onChange = vi.fn();
    render(<Sidebar active="vehicle" onChange={onChange} />);

    screen.getByTitle("Diagnóstico").click();

    expect(onChange).toHaveBeenCalledWith("diagnosis");
  });

  it("should show the diagnosis indicator dot when hasDiagnosis is true", () => {
    render(<Sidebar active="vehicle" onChange={vi.fn()} hasDiagnosis={true} />);

    const diagnosisButton = screen.getByTitle("Diagnóstico");
    expect(
      diagnosisButton.querySelector(".bg-primary.rounded-full"),
    ).not.toBeNull();
  });
});
