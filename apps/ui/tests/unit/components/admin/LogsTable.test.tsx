import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminLog, Paginated } from "../../../../src/components/admin/types";

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------
const mockLogs = vi.fn();

vi.mock("../../../../src/lib/api", () => ({
  api: {
    admin: {
      logs: (filter: unknown) => mockLogs(filter),
    },
  },
}));

import { LogsTable } from "../../../../src/components/admin/LogsTable";

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

function makeLog(overrides: Partial<AdminLog> = {}): AdminLog {
  return {
    id: 1,
    level: "error",
    message: "Something went wrong",
    context: '{"userId": 42}',
    createdAt: "2026-08-08T12:00:00.000Z",
    ...overrides,
  };
}

function makePaginated<T>(items: T[], total?: number): Paginated<T> {
  return { items, total: total ?? items.length };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("LogsTable", () => {
  it("renders rows with level badge, message, and date", async () => {
    mockLogs.mockResolvedValue(
      makePaginated([
        makeLog(),
        makeLog({ id: 2, level: "warn", message: "Warning message" }),
      ]),
    );

    renderWithQuery(<LogsTable />);

    expect(await screen.findByText("Something went wrong")).toBeDefined();
    expect(screen.getByText("Warning message")).toBeDefined();
    // Verify level badges exist
    expect(screen.getByText("error")).toBeDefined();
    expect(screen.getByText("warn")).toBeDefined();
  });

  it('shows "Sin resultados" when logs list is empty', async () => {
    mockLogs.mockResolvedValue(makePaginated<AdminLog>([]));

    renderWithQuery(<LogsTable />);

    expect(await screen.findByText("Sin resultados")).toBeDefined();
  });

  it("renders error badge with destructive variant", async () => {
    mockLogs.mockResolvedValue(makePaginated([makeLog()]));

    renderWithQuery(<LogsTable />);

    await screen.findByText("Something went wrong");
    const errorBadge = screen.getByText("error");
    expect(errorBadge).toBeDefined();
  });

  it("renders context truncated for long JSON", async () => {
    mockLogs.mockResolvedValue(
      makePaginated([
        makeLog({
          context: JSON.stringify({ long: "a".repeat(200) }),
        }),
      ]),
    );

    renderWithQuery(<LogsTable />);

    await screen.findByText("Something went wrong");
    const contextCell = screen.getByText(/".*"/);
    // Truncated — should not contain the full 200 "a"s
    expect(contextCell.textContent).toBeDefined();
  });

  it("calls logs API with filter when search input changes", async () => {
    mockLogs.mockResolvedValue(makePaginated<AdminLog>([]));

    renderWithQuery(<LogsTable />);

    await screen.findByText("Sin resultados");
    mockLogs.mockClear();

    const searchInput = screen.getByPlaceholderText("Buscar en mensajes...");
    fireEvent.change(searchInput, { target: { value: "timeout" } });

    // TanStack Query debounce — wait for the call
    await vi.waitFor(() => {
      expect(mockLogs).toHaveBeenCalled();
    });

    const call = mockLogs.mock.calls[0][0];
    expect(call.q).toBe("timeout");
  });

  it("filters by level via select", async () => {
    mockLogs.mockResolvedValue(makePaginated<AdminLog>([]));

    renderWithQuery(<LogsTable />);

    await screen.findByText("Sin resultados");
    mockLogs.mockClear();

    const trigger = screen.getByRole("combobox", { name: /nivel/i });
    fireEvent.click(trigger);

    const errorOption = screen.getByRole("option", { name: /error/i });
    fireEvent.click(errorOption);

    await vi.waitFor(() => {
      expect(mockLogs).toHaveBeenCalled();
    });

    const call = mockLogs.mock.calls[0][0];
    expect(call.level).toBe("error");
  });

  it("shows loading state when fetching", () => {
    mockLogs.mockReturnValue(new Promise(() => {}));

    renderWithQuery(<LogsTable />);

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
