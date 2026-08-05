import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Scenario } from "../../../src/components/dashboard/types";

// Mutable auth state shared between the mock factory and the tests
const {
  mockAuthStatus,
  mockLogout,
  mockUseScenarios,
  mockUseLiveTelemetry,
  mockUseDiagnosis,
} = vi.hoisted(() => ({
  mockAuthStatus: { value: "anonymous" as "loading" | "authed" | "anonymous" },
  mockLogout: vi.fn(),
  mockUseScenarios: vi.fn(),
  mockUseLiveTelemetry: vi.fn(),
  mockUseDiagnosis: vi.fn(),
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

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    // DTC panel empty state
    expect(
      screen.getByText("Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO"),
    ).toBeDefined();
    // Diagnosis panel heading
    expect(screen.getByText("Diagnóstico IA")).toBeDefined();
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

  it("should show the Sin vehículo status and a disabled diagnose button without a selection", () => {
    mockAuthStatus.value = "authed";

    render(<DashboardPage />);

    expect(screen.getByText("Sin vehículo")).toBeDefined();
    const btn = screen.getByRole("button", {
      name: "Iniciar diagnóstico",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
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
  });
});
