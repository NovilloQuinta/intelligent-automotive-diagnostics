import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VehicleAutoDetectWizard } from "../../../src/components/dashboard/VehicleAutoDetectWizard";
import type {
  Scenario,
  VehicleInfoResponse,
} from "../../../src/components/dashboard/types";

const scenarios: Scenario[] = [
  {
    id: "audi-a3-idle",
    name: "Audi A3 al ralentí",
    vehicleType: "car",
    sensorValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
    dtcConfig: [],
    vehicleInfo: {
      make: "Audi",
      model: "A3",
      year: 2018,
      engineType: "2.0 TFSI",
      vin: "WAUZZZ8V5JA123456",
    },
  },
  {
    id: "kawa-z900",
    name: "Kawasaki Z900",
    vehicleType: "motorcycle",
    sensorValues: { rpm: 4500, coolantTemp: 105, speed: 0, intakeTemp: 28 },
    dtcConfig: [],
    vehicleInfo: {
      make: "Kawasaki",
      model: "Z900",
      year: 2020,
      engineType: "948cc",
      vin: "JKAZR2A1XLA000111",
    },
  },
];

const vehicle: VehicleInfoResponse = {
  vin: "WAUZZZ8V5JA123456",
  make: "Audi",
  model: "A3",
  year: 2018,
  engineType: "2.0 TFSI",
  manufacturer: "Audi",
  region: { country: "Germany", region: "Europe" },
  modelYearDecoded: 2018,
};

function renderWizard(overrides: Partial<Parameters<typeof VehicleAutoDetectWizard>[0]> = {}) {
  const props = {
    scenarios,
    step: "selecting" as const,
    scenarioId: "",
    vehicle: null,
    error: null,
    onSelect: vi.fn(),
    onRetry: vi.fn(),
    onBack: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
  render(<VehicleAutoDetectWizard {...props} />);
  return props;
}

describe("VehicleAutoDetectWizard", () => {
  describe("step: selecting", () => {
    it("should list the available connections", () => {
      renderWizard();

      expect(screen.getByText("Audi A3 al ralentí")).toBeDefined();
      expect(screen.getByText("Kawasaki Z900")).toBeDefined();
      expect(screen.getByText("Identificación del vehículo")).toBeDefined();
    });

    it("should call onSelect with the chosen scenario id", () => {
      const props = renderWizard();

      fireEvent.click(screen.getByText("Kawasaki Z900"));

      expect(props.onSelect).toHaveBeenCalledWith("kawa-z900");
    });

    it("should show an empty state when there are no connections", () => {
      renderWizard({ scenarios: [] });

      expect(screen.getByText("No hay conexiones disponibles")).toBeDefined();
    });
  });

  describe("step: detecting", () => {
    it("should show the scanning state while the VIN is read", () => {
      renderWizard({ step: "detecting", scenarioId: "audi-a3-idle" });

      expect(screen.getByText("Detectando vehículo…")).toBeDefined();
      expect(screen.getByTestId("autodetect-spinner")).toBeDefined();
      expect(screen.queryByText("Entrar a diagnóstico")).toBeNull();
    });

    it("should show a recoverable error with retry and back actions", () => {
      const props = renderWizard({
        step: "detecting",
        scenarioId: "no-existe",
        error: "Scenario not found",
      });

      expect(screen.getByText("Scenario not found")).toBeDefined();
      expect(screen.queryByTestId("autodetect-spinner")).toBeNull();

      fireEvent.click(screen.getByText("Reintentar"));
      expect(props.onRetry).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText("Elegir otro vehículo"));
      expect(props.onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("step: confirming", () => {
    it("should show the identified vehicle card with the decoded VIN", () => {
      renderWizard({ step: "confirming", scenarioId: "audi-a3-idle", vehicle });

      expect(screen.getByText("WAUZZZ8V5JA123456")).toBeDefined();
      // "Audi" y "2018" salen dos veces: dato del escenario y dato decodificado del VIN
      expect(screen.getAllByText("Audi")).toHaveLength(2);
      expect(screen.getByText("A3")).toBeDefined();
      expect(screen.getAllByText("2018")).toHaveLength(2);
      expect(screen.getByText("2.0 TFSI")).toBeDefined();
      expect(screen.getByText("Germany · Europe")).toBeDefined();
    });

    it("should show a dash for the fields that the VIN does not decode", () => {
      renderWizard({
        step: "confirming",
        scenarioId: "tcp",
        vehicle: {
          ...vehicle,
          vin: "XXXXXXXXXXXXXXXXX",
          manufacturer: null,
          region: null,
          modelYearDecoded: null,
        },
      });

      expect(screen.getByText("VIN no decodificable")).toBeDefined();
    });

    it("should call onConfirm with the scenario id", () => {
      const props = renderWizard({
        step: "confirming",
        scenarioId: "audi-a3-idle",
        vehicle,
      });

      fireEvent.click(screen.getByText("Entrar a diagnóstico"));

      expect(props.onConfirm).toHaveBeenCalledWith("audi-a3-idle");
    });
  });
});
