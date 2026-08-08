import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Scenario } from "../../../src/components/dashboard/types";

// Mutable auth state shared between the mock factory and the tests
const {
  mockAuthStatus,
  mockLogout,
  mockUseScenarios,
  mockUseLiveTelemetry,
  mockUseDiagnosis,
  mockUseVehicleAutoDetect,
  mockUseCapabilities,
  mockUseCognitiveDiagnosis,
} = vi.hoisted(() => ({
  mockAuthStatus: { value: "anonymous" as "loading" | "authed" | "anonymous" },
  mockLogout: vi.fn(),
  mockUseScenarios: vi.fn(),
  mockUseLiveTelemetry: vi.fn(),
  mockUseDiagnosis: vi.fn(),
  mockUseVehicleAutoDetect: vi.fn(),
  mockUseCapabilities: vi.fn(),
  mockUseCognitiveDiagnosis: vi.fn(),
}));

// Must mock before any imports that touch @tanstack/react-router
vi.mock("@tanstack/react-router", () => {
  return {
    useNavigate: () => vi.fn(),
    // Renders a test hook instead of actually redirecting
    Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
      <div data-testid="navigate" data-to={to} data-replace={String(replace)} />
    ),
  };
});

// Mock auth context
vi.mock("../../../src/lib/auth-context", () => ({
  useAuth: () => ({
    status: mockAuthStatus.value,
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: mockLogout,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Mock dashboard data hooks (they talk to the real backend via api)
vi.mock("../../../src/components/dashboard/useScenarios", () => ({
  useScenarios: () => mockUseScenarios(),
}));
vi.mock("../../../src/components/dashboard/useLiveTelemetry", () => ({
  useLiveTelemetry: () => mockUseLiveTelemetry(),
}));
vi.mock("../../../src/components/dashboard/useDiagnosis", () => ({
  useDiagnosis: () => mockUseDiagnosis(),
}));
vi.mock("../../../src/components/dashboard/useVehicleAutoDetect", () => ({
  useVehicleAutoDetect: () => mockUseVehicleAutoDetect(),
}));
vi.mock("../../../src/components/dashboard/useCapabilities", () => ({
  useCapabilities: () => mockUseCapabilities(),
}));
vi.mock("../../../src/components/dashboard/useCognitiveDiagnosis", () => ({
  useCognitiveDiagnosis: () => mockUseCognitiveDiagnosis(),
}));
vi.mock("../../../src/components/dashboard/useEcuInfo", () => ({
  useEcuInfo: () => ({ ecus: [], loading: false, error: null }),
}));
vi.mock("../../../src/components/dashboard/useSessionReport", () => ({
  useSessionReport: () => ({
    capabilities: { cognitiveDiagnosis: true },
    deterministic: null,
    deterministicLoading: false,
    deterministicError: null,
    ecus: null,
    ecusLoading: false,
    freezeFrame: null,
    freezeFrameLoading: false,
    cognitive: null,
    cognitiveLoading: false,
    cognitiveError: null,
  }),
}));

// FreezeFramePanel fetches through the real api module — mock only the network call
vi.mock("../../../src/lib/api", () => ({
  api: {
    getFreezeFrame: vi.fn(),
    getEcuInfo: vi.fn(),
  },
}));

import { api } from "../../../src/lib/api";
import { DashboardPage } from "../../../src/components/dashboard/DashboardPage";

const scenario: Scenario = {
  id: "audi-a3",
  name: "Audi A3 1.6 TDI",
  vehicleType: "car",
  sensorValues: { rpm: 850, coolantTemp: 90, speed: 0, intakeTemp: 35 },
  dtcConfig: [],
  vehicleInfo: {
    make: "Audi",
    model: "A3",
    year: 2015,
    engineType: "1.6 TDI",
    vin: "WAUZZZ8V5FA123456",
  },
};

const identifiedVehicle = {
  vin: "WAUZZZ8V5FA123456",
  make: "Audi",
  model: "A3",
  year: 2015,
  engineType: "1.6 TDI",
  manufacturer: "Audi",
  region: { country: "Germany", region: "Europe" },
  modelYearDecoded: 2015,
};

/** Estado por defecto del wizard: vehículo ya identificado y confirmado. */
function wizardState(overrides: Record<string, unknown> = {}) {
  return {
    step: "done",
    scenarioId: scenario.id,
    vehicle: identifiedVehicle,
    error: null,
    detect: vi.fn(),
    retry: vi.fn(),
    confirm: vi.fn(),
    restart: vi.fn(),
    ...overrides,
  };
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseVehicleAutoDetect.mockReturnValue(wizardState());
    // Stub the animation driver so the gauges never fire frames (deterministic)
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    mockAuthStatus.value = "anonymous";
    mockUseScenarios.mockReturnValue({
      scenarios: [],
      selectedId: "",
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    mockUseLiveTelemetry.mockReturnValue({ live: null, streamOk: false });
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: null,
      runDiagnosis: vi.fn(),
    });
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: false });
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: null,
      loading: false,
      trigger: vi.fn(),
      reset: vi.fn(),
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should render <Navigate to='/login' replace /> when auth is anonymous", () => {
    render(<DashboardPage />);

    const nav = screen.getByTestId("navigate");
    expect(nav.getAttribute("data-to")).toBe("/login");
    expect(nav.getAttribute("data-replace")).toBe("true");
    // Dashboard content must not render while redirecting
    expect(screen.queryByText("Telemetría en vivo")).toBeNull();
    expect(screen.queryByText("Protocolo: ISO 15765-4 CAN")).toBeNull();
  });

  it("should render TopBar and dashboard sections when auth is authed", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    mockUseLiveTelemetry.mockReturnValue({
      live: {
        rpm: 850,
        speed: 0,
        coolantTemp: 90,
        intakeTemp: 35,
        rawData: "41 0C 5A 41 0D 00",
        ts: 1,
      },
      streamOk: true,
    });

    render(<DashboardPage />);

    // TopBar (branding + connection status)
    expect(
      screen.getByText("OBD-II · AI Assisted Workshop Tool"),
    ).toBeDefined();
    expect(screen.getByText("Conectado")).toBeDefined();
    // Telemetry section
    expect(screen.getByText("Telemetría en vivo")).toBeDefined();
    // DTC panel + PIDs table empty state (both render the same prompt)
    expect(
      screen.getAllByText("Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO"),
    ).toHaveLength(2);
    // Diagnosis panel heading
    expect(screen.getByText("Diagnóstico IA")).toBeDefined();
    // PIDs table heading
    expect(screen.getByText("PIDs Leídos")).toBeDefined();
    // Footer
    expect(screen.getByText("Protocolo: ISO 15765-4 CAN")).toBeDefined();
    // No redirect when authed
    expect(screen.queryByTestId("navigate")).toBeNull();
  });

  it("should call auth.logout when the TopBar logout button is clicked", () => {
    mockAuthStatus.value = "authed";

    render(<DashboardPage />);

    fireEvent.click(screen.getByTitle("Cerrar sesión"));

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("should render the scenarios error banner when scenariosError is set", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [],
      selectedId: "",
      setSelectedId: vi.fn(),
      scenariosError: "Error al cargar escenarios",
    });

    render(<DashboardPage />);

    expect(screen.getByText("Error al cargar escenarios")).toBeDefined();
  });

  it("should show the Diagnosticando status and loading UI while a diagnosis runs", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    mockUseDiagnosis.mockReturnValue({
      loading: true,
      result: null,
      runDiagnosis: vi.fn(),
    });

    render(<DashboardPage />);

    // Status + diagnose button
    expect(screen.getAllByText("Diagnosticando…").length).toBeGreaterThan(0);
    expect(screen.getByText("Analizando datos OBD-II con IA…")).toBeDefined();
    expect(screen.queryByText("Streaming ECU · 2 Hz")).toBeNull();
    expect(
      screen.queryByText("Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO"),
    ).toBeNull();
  });

  it("should show the Streaming status and Live badge when the stream is live", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    mockUseLiveTelemetry.mockReturnValue({
      live: {
        rpm: 850,
        speed: 0,
        coolantTemp: 90,
        intakeTemp: 35,
        rawData: "41 0C 5A",
        ts: 1,
      },
      streamOk: true,
    });

    render(<DashboardPage />);

    expect(screen.getByText("Streaming ECU · 2 Hz")).toBeDefined();
    expect(screen.getByText("Live")).toBeDefined();
  });

  it("should show the Conectando status when a vehicle is selected but the stream is down", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });

    render(<DashboardPage />);

    expect(screen.getByText("Conectando…")).toBeDefined();
    expect(screen.queryByText("Live")).toBeNull();
  });

  it("should render the identification wizard instead of the diagnosis menu without a confirmed vehicle", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: "",
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    mockUseVehicleAutoDetect.mockReturnValue(
      wizardState({ step: "selecting", scenarioId: "", vehicle: null }),
    );

    render(<DashboardPage />);

    expect(screen.getByText("Identificación del vehículo")).toBeDefined();
    expect(screen.queryByText("Telemetría en vivo")).toBeNull();
    expect(screen.queryByText("Diagnóstico IA")).toBeNull();
    expect(screen.queryByText("PIDs Leídos")).toBeNull();
    // La cabecera se mantiene: el wizard sustituye al menú de diagnóstico, no a la app
    expect(
      screen.getByText("OBD-II · AI Assisted Workshop Tool"),
    ).toBeDefined();
  });

  it("should enter the diagnosis menu when the wizard confirms the vehicle", () => {
    mockAuthStatus.value = "authed";
    const setSelectedId = vi.fn();
    const confirm = vi.fn();
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: "",
      setSelectedId,
      scenariosError: null,
    });
    mockUseVehicleAutoDetect.mockReturnValue(
      wizardState({ step: "confirming", confirm }),
    );

    render(<DashboardPage />);

    fireEvent.click(screen.getByText("Entrar a diagnóstico"));

    expect(setSelectedId).toHaveBeenCalledWith(scenario.id);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("should reopen the wizard in detecting when another vehicle is picked in VehicleSelector", () => {
    mockAuthStatus.value = "authed";
    const detect = vi.fn();
    const other: Scenario = {
      ...scenario,
      id: "kawa-z900",
      name: "Kawasaki Z900",
    };
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario, other],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    mockUseVehicleAutoDetect.mockReturnValue(wizardState({ detect }));

    render(<DashboardPage />);

    // Abre el dropdown del TopBar y elige el otro vehículo
    fireEvent.click(screen.getByText("Audi A3 1.6 TDI"));
    fireEvent.click(screen.getByText("Kawasaki Z900"));

    expect(detect).toHaveBeenCalledWith("kawa-z900");
  });

  it("should show the wizard scanning step while a new vehicle is being identified", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    mockUseVehicleAutoDetect.mockReturnValue(
      wizardState({ step: "detecting", vehicle: null }),
    );

    render(<DashboardPage />);

    expect(screen.getByText("Detectando vehículo…")).toBeDefined();
    expect(screen.queryByText("Telemetría en vivo")).toBeNull();
  });

  it("should render the diagnosis result (DTCs, text, severity) once available", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: {
        rawData: "41 0C 5A",
        parsedValues: { rpm: 850, coolantTemp: 90, speed: 50, intakeTemp: 35 },
        dtcCodes: [
          { code: "P0301", description: "Fallo de encendido cilindro 1" },
        ],
        diagnosisText: "Se recomienda revisar las bujías.",
        severity: "high",
      },
      runDiagnosis: vi.fn(),
    });

    render(<DashboardPage />);

    // DTC panel with count and code
    expect(screen.getByText("1 registrado")).toBeDefined();
    expect(screen.getByText("P0301")).toBeDefined();
    expect(screen.getByText("Fallo de encendido cilindro 1")).toBeDefined();
    // Diagnosis panel with severity badge
    expect(screen.getByText("Se recomienda revisar las bujías.")).toBeDefined();
    expect(screen.getByText("ALTA")).toBeDefined();
    // Telemetry falls back to result.parsedValues
    expect(screen.getByText("850")).toBeDefined();
    expect(screen.getByText("050")).toBeDefined();
    // No live stream → Conectando status
    expect(screen.getByText("Conectando…")).toBeDefined();
    expect(
      screen.queryByText("Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO"),
    ).toBeNull();
    // PIDs table lists all 4 generic PIDs with their code and OK status
    expect(screen.getByText("4 registrados")).toBeDefined();
    expect(screen.getByText("01 0C")).toBeDefined();
    expect(screen.getByText("850 RPM")).toBeDefined();
    expect(screen.getAllByText("OK")).toHaveLength(4);
  });

  it("should fetch the freeze frame for a DTC when its row is selected", async () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: {
        rawData: "41 0C 5A",
        parsedValues: { rpm: 850, coolantTemp: 90, speed: 50, intakeTemp: 35 },
        dtcCodes: [
          { code: "P0301", description: "Fallo de encendido cilindro 1" },
        ],
        diagnosisText: "Revisar bujías.",
        severity: "high",
      },
      runDiagnosis: vi.fn(),
    });
    vi.mocked(api.getFreezeFrame).mockResolvedValue({
      dtcCode: "P0301",
      pidValues: { "0C": 850 },
    });

    render(<DashboardPage />);

    fireEvent.click(screen.getByText("P0301"));

    await waitFor(() => {
      expect(api.getFreezeFrame).toHaveBeenCalledWith(scenario.id, "P0301");
    });
    // "0C" is the freeze-frame PID cell — PidsTable renders it as "01 0C"
    await waitFor(() => {
      expect(screen.getByText("0C")).toBeDefined();
    });
  });

  it("should show the session report panel when the Informe button is clicked", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });

    render(<DashboardPage />);

    const informeBtn = screen.getByTitle("Generar informe de la sesión");
    fireEvent.click(informeBtn);

    expect(screen.getByText("Informe de Sesión de Diagnóstico")).toBeDefined();
    expect(screen.getByText("Diagnóstico Determinista")).toBeDefined();
    expect(screen.getByText("Diagnóstico Cognitivo")).toBeDefined();
  });

  it("should hide the report panel when Cerrar informe is clicked", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });

    render(<DashboardPage />);

    // Open report
    fireEvent.click(screen.getByTitle("Generar informe de la sesión"));
    expect(screen.getByText("Informe de Sesión de Diagnóstico")).toBeDefined();

    // Close report
    fireEvent.click(screen.getByText("Cerrar informe ✕"));
    expect(screen.queryByText("Informe de Sesión de Diagnóstico")).toBeNull();
  });

  it("should trigger the cognitive diagnosis after runDiagnosis when the capability is on", async () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    const runDiagnosis = vi.fn().mockResolvedValue(undefined);
    const trigger = vi.fn();
    const reset = vi.fn();
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: null,
      runDiagnosis,
    });
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: true });
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: null,
      loading: false,
      trigger,
      reset,
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByText("Iniciar diagnóstico"));

    await waitFor(() => {
      expect(trigger).toHaveBeenCalledTimes(1);
    });
    expect(runDiagnosis).toHaveBeenCalledTimes(1);
    // reset limpia las filas de la sesión anterior antes del nuevo trigger
    expect(reset).toHaveBeenCalledTimes(1);
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
      trigger.mock.invocationCallOrder[0],
    );
  });

  it("should not trigger the cognitive diagnosis when the capability is off", async () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    const runDiagnosis = vi.fn().mockResolvedValue(undefined);
    const trigger = vi.fn();
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: null,
      runDiagnosis,
    });
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: false });
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: null,
      loading: false,
      trigger,
      reset: vi.fn(),
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    });

    render(<DashboardPage />);
    fireEvent.click(screen.getByText("Iniciar diagnóstico"));

    await waitFor(() => {
      expect(runDiagnosis).toHaveBeenCalledTimes(1);
    });
    expect(trigger).not.toHaveBeenCalled();
  });

  it("should paint the deterministic result while the cognitive call is still loading", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: {
        rawData: "41 0C 5A",
        parsedValues: { rpm: 850, coolantTemp: 90, speed: 0, intakeTemp: 35 },
        dtcCodes: [{ code: "P0301", description: "Cylinder 1 Misfire" }],
        diagnosisText: "[HIGH] Fallo de encendido",
        severity: "high",
      },
      runDiagnosis: vi.fn(),
    });
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: true });
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: null,
      loading: true,
      trigger: vi.fn(),
      reset: vi.fn(),
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    });

    render(<DashboardPage />);

    // Los 4 PIDs fijos y el resto del diagnóstico están visibles pese al loading cognitivo
    expect(screen.getAllByTestId("pid-row")).toHaveLength(4);
    expect(screen.getByText("P0301")).toBeDefined();
    expect(screen.getByText("Buscando PIDs adicionales…")).toBeDefined();
  });

  it("should append the AI rows to the PIDs table once they resolve", () => {
    mockAuthStatus.value = "authed";
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    });
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: {
        rawData: "41 0C 5A",
        parsedValues: { rpm: 850, coolantTemp: 90, speed: 0, intakeTemp: 35 },
        dtcCodes: [],
        diagnosisText: "[LOW] Sin fallos",
        severity: "low",
      },
      runDiagnosis: vi.fn(),
    });
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: true });
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: [
        {
          code: "01 42",
          description: "Voltaje del módulo de control",
          value: "10.9 V",
          status: "review",
          source: "ai",
        },
      ],
      loading: false,
      trigger: vi.fn(),
      reset: vi.fn(),
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    });

    render(<DashboardPage />);

    expect(screen.getAllByTestId("pid-row")).toHaveLength(5);
    expect(screen.getByText("01 42")).toBeDefined();
    expect(screen.getByText("IA")).toBeDefined();
  });
});
