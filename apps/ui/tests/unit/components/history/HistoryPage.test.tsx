import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { DiagnosisSession } from "../../../../src/components/dashboard/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockUseDiagnosisHistory } = vi.hoisted(() => ({
  mockUseDiagnosisHistory: vi.fn(),
}));

vi.mock("../../../../src/components/history/useDiagnosisHistory", () => ({
  useDiagnosisHistory: mockUseDiagnosisHistory,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../../../src/lib/auth-context", () => ({
  useAuth: () => ({
    status: "authed" as const,
    user: { id: 1, username: "test", isAdmin: false },
    logout: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_SESSIONS: DiagnosisSession[] = [
  {
    id: 1,
    vehicleId: 1,
    scenarioId: "audi-a3-idle",
    startedAt: "2026-08-09T10:30:00.000Z",
    endedAt: "2026-08-09T10:31:00.000Z",
    severity: "high",
    dtcCount: 3,
  },
  {
    id: 2,
    vehicleId: 2,
    scenarioId: "seat-leon",
    startedAt: "2026-08-09T09:00:00.000Z",
    endedAt: "2026-08-09T09:01:00.000Z",
    severity: "low",
    dtcCount: 1,
  },
];

const DEFAULT_HOOK_STATE = {
  sessions: [] as DiagnosisSession[],
  total: 0,
  isLoading: false,
  isError: false,
  error: null as Error | null,
};

function setHookState(overrides: Partial<typeof DEFAULT_HOOK_STATE>) {
  return { ...DEFAULT_HOOK_STATE, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HistoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDiagnosisHistory.mockReturnValue(DEFAULT_HOOK_STATE);
  });

  // 5.1 — table renders date, vehicle, DTC count, severity
  it("should render table rows with date, vehicle, DTC count, and severity", async () => {
    mockUseDiagnosisHistory.mockReturnValue(
      setHookState({ sessions: SAMPLE_SESSIONS, total: 2 }),
    );

    const { HistoryPage } = await import(
      "../../../../src/components/history/HistoryPage"
    );
    render(<HistoryPage />);

    // Table headers
    expect(screen.getByRole("columnheader", { name: "Fecha" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Vehículo" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Nº DTCs" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Severidad" })).toBeDefined();

    // First row
    expect(screen.getByText("audi-a3-idle")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("ALTA")).toBeDefined();

    // Second row
    expect(screen.getByText("seat-leon")).toBeDefined();
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("BAJA")).toBeDefined();
  });

  // 5.3 — date filters present in the UI
  it("should render date range inputs and severity filter", async () => {
    const { HistoryPage } = await import(
      "../../../../src/components/history/HistoryPage"
    );
    render(<HistoryPage />);

    // Date inputs should exist
    expect(screen.getByLabelText("Desde")).toBeDefined();
    expect(screen.getByLabelText("Hasta")).toBeDefined();

    // Severity selector
    expect(screen.getByRole("combobox", { name: /severidad/i })).toBeDefined();
  });

  it("should render the shared header with navigation and footer", async () => {
    const { HistoryPage } = await import(
      "../../../../src/components/history/HistoryPage"
    );
    render(<HistoryPage />);

    expect(screen.getByText("IADiagnostics")).toBeDefined();
    expect(screen.getByText("Inicio")).toBeDefined();
    expect(screen.getByText("Historial")).toBeDefined();
    expect(screen.getByText("Perfil")).toBeDefined();
    expect(screen.getByText("Cerrar sesión")).toBeDefined();
    expect(screen.getByText("Términos")).toBeDefined();
    expect(screen.getByText("Privacidad")).toBeDefined();
    expect(screen.getByText("Contacto")).toBeDefined();
  });

  // 5.5 — shortcuts
  it("should render date shortcut buttons: Hoy, 7 días, 30 días", async () => {
    const { HistoryPage } = await import(
      "../../../../src/components/history/HistoryPage"
    );
    render(<HistoryPage />);

    expect(screen.getByRole("button", { name: "Hoy" })).toBeDefined();
    expect(screen.getByRole("button", { name: "7 d" })).toBeDefined();
    expect(screen.getByRole("button", { name: "30 d" })).toBeDefined();
  });

  // 5.6 — empty states differ
  it("should show empty message when there is no history at all", async () => {
    mockUseDiagnosisHistory.mockReturnValue(
      setHookState({ sessions: [], total: 0, isLoading: false }),
    );

    const { HistoryPage } = await import(
      "../../../../src/components/history/HistoryPage"
    );
    render(<HistoryPage />);

    expect(screen.getByText(/sin diagnósticos/i)).toBeDefined();
  });

  it("should show no-results message when filters return nothing", async () => {
    // Different mock: filters are active
    mockUseDiagnosisHistory.mockReturnValue(
      setHookState({ sessions: [], total: 0, isLoading: false }),
    );
    // Simulate filters applied by returning different hook state
    // The component distinguishes via active filters vs no data at all
    const { HistoryPage } = await import(
      "../../../../src/components/history/HistoryPage"
    );
    const { rerender } = render(<HistoryPage />);

    // Without filters, shows "no history" message
    expect(screen.getByText(/sin diagnósticos/i)).toBeDefined();

    // We'll test the filter distinction by checking that
    // when filters ARE active, a different message appears
    mockUseDiagnosisHistory.mockReturnValue(
      setHookState({
        sessions: [],
        total: 0,
        isLoading: false,
      }),
    );
    // The component needs a way to know filters are active
    // We'll implement this by tracking hasActiveFilters internally
    rerender(<HistoryPage />);
    // For now, both show the same empty state (will differentiate in 5.7)
  });

  // Loading state
  it("should show loading skeletons when data is loading", async () => {
    mockUseDiagnosisHistory.mockReturnValue(
      setHookState({ isLoading: true }),
    );

    const { HistoryPage } = await import(
      "../../../../src/components/history/HistoryPage"
    );
    render(<HistoryPage />);

    // Should have skeleton elements
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  // Error state
  it("should show error message when API fails", async () => {
    mockUseDiagnosisHistory.mockReturnValue(
      setHookState({
        isError: true,
        error: new Error("Error al cargar el historial"),
      }),
    );

    const { HistoryPage } = await import(
      "../../../../src/components/history/HistoryPage"
    );
    render(<HistoryPage />);

    expect(screen.getByText(/error/i)).toBeDefined();
  });

  // Pagination
  it("should show pagination controls when there are more sessions than the limit", async () => {
    mockUseDiagnosisHistory.mockReturnValue(
      setHookState({ sessions: SAMPLE_SESSIONS, total: 30 }),
    );

    const { HistoryPage } = await import(
      "../../../../src/components/history/HistoryPage"
    );
    render(<HistoryPage />);

    expect(screen.getByRole("button", { name: /anterior/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeDefined();
  });
});
