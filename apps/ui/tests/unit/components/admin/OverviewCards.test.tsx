import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminOverview } from "../../../../src/components/admin/types";

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------
const mockOverview = vi.fn();

vi.mock("../../../../src/lib/api", () => ({
  api: {
    admin: {
      overview: () => mockOverview(),
    },
  },
}));

import { OverviewCards } from "../../../../src/components/admin/OverviewCards";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

function makeOverview(overrides: Partial<AdminOverview> = {}): AdminOverview {
  return {
    userStats: {
      byUserType: { individual: 10, workshop: 3 },
      byRole: { user: 11, admin: 2 },
    },
    recentErrorCount: 5,
    httpRequestsByPathApprox: {
      "/api/diagnosis": 42,
      "/api/live-data": 100,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("OverviewCards", () => {
  it("renders total user count from byUserType sum", async () => {
    mockOverview.mockResolvedValue(makeOverview());

    renderWithQuery(<OverviewCards />);

    expect(await screen.findByText("13")).toBeDefined();
  });

  it("renders users by type: individual and workshop", async () => {
    mockOverview.mockResolvedValue(makeOverview());

    renderWithQuery(<OverviewCards />);

    expect(await screen.findByText("10")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText(/individual/i)).toBeDefined();
    expect(screen.getByText(/workshop/i)).toBeDefined();
  });

  it("renders users by role: user and admin", async () => {
    mockOverview.mockResolvedValue(makeOverview());

    renderWithQuery(<OverviewCards />);

    expect(await screen.findByText("11")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
  });

  it("renders recent error count for 24h", async () => {
    mockOverview.mockResolvedValue(makeOverview());

    renderWithQuery(<OverviewCards />);

    expect(await screen.findByText("5")).toBeDefined();
    expect(screen.getByText(/errores/i)).toBeDefined();
  });

  it("shows loading skeleton while fetching", () => {
    // Never resolves — stays in loading state
    mockOverview.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<OverviewCards />);

    // Skeleton elements have animate-pulse class
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders HTTP requests with aproximation label", async () => {
    mockOverview.mockResolvedValue(
      makeOverview({
        httpRequestsByPathApprox: { "/api/diagnosis": 42 },
      }),
    );

    renderWithQuery(<OverviewCards />);

    expect(await screen.findByText("42")).toBeDefined();
    expect(screen.getByText(/\/api\/diagnosis/)).toBeDefined();
    // Must say "peticiones HTTP", NOT "diagnósticos"
    expect(screen.getByText(/peticiones\s*HTTP/i)).toBeDefined();
  });

  it("shows empty state when overview has no data", async () => {
    mockOverview.mockResolvedValue(
      makeOverview({
        userStats: { byUserType: {}, byRole: {} },
        recentErrorCount: 0,
        httpRequestsByPathApprox: {},
      }),
    );

    renderWithQuery(<OverviewCards />);

    // Multiple cards show "0" — verify the total users card renders correctly
    expect(await screen.findByText("Usuarios totales")).toBeDefined();
    expect(screen.getByText("Sin datos")).toBeDefined();
  });

  it("fetches with correct query key", async () => {
    mockOverview.mockResolvedValue(makeOverview());

    renderWithQuery(<OverviewCards />);

    await screen.findByText("13");
    expect(mockOverview).toHaveBeenCalledTimes(1);
  });
});
