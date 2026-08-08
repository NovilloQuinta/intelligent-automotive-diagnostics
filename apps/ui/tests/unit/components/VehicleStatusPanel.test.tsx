import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VehicleStatusPanel } from "../../../src/components/dashboard/VehicleStatusPanel";

// Mock the hook so the panel tests don't make real API calls
vi.mock("../../../src/components/dashboard/useVehicleStatus", () => ({
  useVehicleStatus: vi.fn(),
}));

import { useVehicleStatus } from "../../../src/components/dashboard/useVehicleStatus";

const mockUseVehicleStatus = vi.mocked(useVehicleStatus);

const sampleStatus = {
  milOn: true,
  dtcCount: 3,
  engineType: "spark" as const,
  monitors: [
    { name: "misfire", supported: true, completed: true },
    { name: "catalyst", supported: true, completed: false },
    { name: "egrSystem", supported: false, completed: false },
  ],
};

const sampleStatusMilOff = {
  milOn: false,
  dtcCount: 0,
  engineType: "compression" as const,
  monitors: [
    { name: "comprehensiveComponent", supported: true, completed: true },
  ],
};

describe("VehicleStatusPanel", () => {
  it("should show empty prompt when no vehicle selected", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: null,
      loading: false,
      error: null,
    });

    render(<VehicleStatusPanel scenarioId={null} />);

    expect(
      screen.getByText("Selecciona un vehículo para ver su estado"),
    ).toBeDefined();
  });

  it("should show loader when loading", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: null,
      loading: true,
      error: null,
    });

    render(<VehicleStatusPanel scenarioId="audi-a3-idle" />);

    expect(screen.getByText("Cargando estado…")).toBeDefined();
  });

  it("should show error message when error", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: null,
      loading: false,
      error: "Fallo al cargar",
    });

    render(<VehicleStatusPanel scenarioId="audi-a3-idle" />);

    expect(screen.getByText("Fallo al cargar")).toBeDefined();
  });

  it("should show MIL on when status has milOn=true", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: sampleStatus,
      loading: false,
      error: null,
    });

    render(<VehicleStatusPanel scenarioId="audi-a3-idle" />);

    expect(screen.getByText("Testigo MIL: Encendido")).toBeDefined();
  });

  it("should show MIL off when status has milOn=false", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: sampleStatusMilOff,
      loading: false,
      error: null,
    });

    render(<VehicleStatusPanel scenarioId="audi-a3-idle" />);

    expect(screen.getByText("Testigo MIL: Apagado")).toBeDefined();
  });

  it("should show DTC count", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: sampleStatus,
      loading: false,
      error: null,
    });

    render(<VehicleStatusPanel scenarioId="audi-a3-idle" />);

    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("averías almacenadas")).toBeDefined();
  });

  it("should show singular for single DTC", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: { ...sampleStatus, dtcCount: 1 },
      loading: false,
      error: null,
    });

    render(<VehicleStatusPanel scenarioId="audi-a3-idle" />);

    expect(screen.getByText("avería almacenada")).toBeDefined();
  });

  it("should show engine type Gasolina for spark", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: sampleStatus,
      loading: false,
      error: null,
    });

    render(<VehicleStatusPanel scenarioId="audi-a3-idle" />);

    expect(screen.getByText("Gasolina")).toBeDefined();
  });

  it("should show engine type Diésel for compression", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: sampleStatusMilOff,
      loading: false,
      error: null,
    });

    render(<VehicleStatusPanel scenarioId="audi-a3-idle" />);

    expect(screen.getByText("Diésel")).toBeDefined();
  });

  it("should list supported monitors with completed/pending status", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: sampleStatus,
      loading: false,
      error: null,
    });

    render(<VehicleStatusPanel scenarioId="audi-a3-idle" />);

    // Completed monitor
    expect(screen.getByText(/misfire/i)).toBeDefined();
    expect(screen.getByText("Completado")).toBeDefined();

    // Pending monitor
    expect(screen.getByText(/catalyst/i)).toBeDefined();
    expect(screen.getByText("Pendiente")).toBeDefined();
  });

  it("should show unsupported monitors as disabled", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: sampleStatus,
      loading: false,
      error: null,
    });

    render(<VehicleStatusPanel scenarioId="audi-a3-idle" />);

    expect(screen.getByText(/egrSystem/i)).toBeDefined();
    expect(screen.getByText("No soportado")).toBeDefined();
  });

  it("should show zero averías when dtcCount is 0", () => {
    mockUseVehicleStatus.mockReturnValue({
      status: sampleStatusMilOff,
      loading: false,
      error: null,
    });

    render(<VehicleStatusPanel scenarioId="audi-a3-idle" />);

    expect(screen.getByText("0")).toBeDefined();
    expect(screen.getByText("averías almacenadas")).toBeDefined();
  });
});
