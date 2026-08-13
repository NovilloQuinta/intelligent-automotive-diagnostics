import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockUseDiagnosisHistoryDetail, mockSessionId } = vi.hoisted(() => ({
  mockUseDiagnosisHistoryDetail: vi.fn(),
  mockSessionId: { value: "123" },
}));

vi.mock("../../../src/components/history/useDiagnosisHistoryDetail", () => ({
  useDiagnosisHistoryDetail: mockUseDiagnosisHistoryDetail,
}));

vi.mock("../../../src/components/dashboard/SessionReportPanel", () => ({
  SessionReportPanel: () => <div data-testid="session-report-panel" />,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    options: { component: config.component },
    useParams: () => ({ sessionId: mockSessionId.value }),
  }),
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../../src/lib/auth-context", () => ({
  useAuth: () => ({
    status: "authed" as const,
    user: { id: 1, username: "test", isAdmin: false },
    logout: vi.fn(),
  }),
}));

import { Route } from "../../../src/routes/history.$sessionId";
const HistoryDetailRoute = (
  Route as unknown as { options: { component: React.ComponentType } }
).options.component;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_HOOK_STATE = {
  session: null,
  reportState: null,
  isLoading: false,
  isError: false,
  error: null as Error | null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("history.$sessionId route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionId.value = "123";
    mockUseDiagnosisHistoryDetail.mockReturnValue(DEFAULT_HOOK_STATE);
  });

  it("should render the shared header and footer in the loading state", () => {
    mockUseDiagnosisHistoryDetail.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      isLoading: true,
    });
    render(<HistoryDetailRoute />);

    expect(screen.getByText("Cargando informe…")).toBeDefined();
    expect(screen.getByText("IADiagnostics")).toBeDefined();
    expect(screen.getByText("Términos")).toBeDefined();
    expect(screen.getByText("Privacidad")).toBeDefined();
    expect(screen.getByText("Contacto")).toBeDefined();
  });

  it("should render the shared header and footer in the error state", () => {
    mockUseDiagnosisHistoryDetail.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      isError: true,
      error: new Error("boom"),
    });
    render(<HistoryDetailRoute />);

    expect(screen.getByText(/Error al cargar el informe/i)).toBeDefined();
    expect(screen.getByText("IADiagnostics")).toBeDefined();
    expect(screen.getByText("Términos")).toBeDefined();
    expect(screen.getByText("Privacidad")).toBeDefined();
  });

  it("should render the shared header and footer for an invalid session id", () => {
    mockSessionId.value = "abc";
    render(<HistoryDetailRoute />);

    expect(screen.getByText("ID de sesión inválido")).toBeDefined();
    expect(screen.getByText("IADiagnostics")).toBeDefined();
    expect(screen.getByText("Términos")).toBeDefined();
    expect(screen.getByText("Privacidad")).toBeDefined();
  });

  it("should render the shared header and footer alongside the report panel", () => {
    mockUseDiagnosisHistoryDetail.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      session: {
        id: 123,
        vehicleId: null,
        scenarioId: null,
        startedAt: "2026-08-09T10:30:00.000Z",
        endedAt: null,
        severity: "low",
        dtcCount: 1,
        resultJson: null,
      },
      reportState: { severity: "low" },
    });
    render(<HistoryDetailRoute />);

    expect(screen.getByTestId("session-report-panel")).toBeDefined();
    expect(screen.getByText("IADiagnostics")).toBeDefined();
    expect(screen.getByText("Términos")).toBeDefined();
    expect(screen.getByText("Privacidad")).toBeDefined();
  });
});
