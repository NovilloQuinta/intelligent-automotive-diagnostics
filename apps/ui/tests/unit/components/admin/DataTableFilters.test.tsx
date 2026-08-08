import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataTableFilters } from "../../../../src/components/admin/DataTableFilters";

const BASE_PROPS = {
  onSearchChange: vi.fn(),
  onDateRangeChange: vi.fn(),
  page: 1,
  pageSize: 20,
  total: 100,
  onPageChange: vi.fn(),
  onPageSizeChange: vi.fn(),
};

describe("DataTableFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Test 1: search input ───────────────────────────────────────────
  it("should call onSearchChange when the search input changes", () => {
    const onSearchChange = vi.fn();
    render(<DataTableFilters {...BASE_PROPS} onSearchChange={onSearchChange} />);

    const input = screen.getByPlaceholderText("Buscar...");
    fireEvent.change(input, { target: { value: "error" } });

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith("error");
  });

  // ─── Test 2: date shortcut "7d" ─────────────────────────────────────
  it('should calculate correct from/to when "7 días" shortcut is clicked', () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    vi.setSystemTime(now);

    const onDateRangeChange = vi.fn();
    render(
      <DataTableFilters
        {...BASE_PROPS}
        dateShortcuts={["today", "7d", "30d"]}
        onDateRangeChange={onDateRangeChange}
      />,
    );

    const btn7d = screen.getByRole("button", { name: /7 d/i });
    fireEvent.click(btn7d);

    expect(onDateRangeChange).toHaveBeenCalledTimes(1);

    const calledWith = onDateRangeChange.mock.calls[0][0];
    expect(calledWith.from).toBe("2026-08-01T00:00:00.000Z");
    expect(calledWith.to).toBe("2026-08-08T12:00:00.000Z");
  });

  // ─── Test 3: page change ────────────────────────────────────────────
  it("should call onPageChange when a page button is clicked", () => {
    const onPageChange = vi.fn();
    render(
      <DataTableFilters
        {...BASE_PROPS}
        page={1}
        pageSize={10}
        total={50}
        onPageChange={onPageChange}
      />,
    );

    // Click page 2 button
    const page2Button = screen.getByRole("button", { name: "2" });
    fireEvent.click(page2Button);

    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  // ─── Test 4: empty state ─────────────────────────────────────────────
  it('should show "Sin resultados" when total is 0', () => {
    const onSearchChange = vi.fn();
    render(
      <DataTableFilters
        {...BASE_PROPS}
        total={0}
        onSearchChange={onSearchChange}
      />,
    );

    expect(screen.getByText("Sin resultados")).toBeDefined();
  });

  // ─── Test 5: level filter ────────────────────────────────────────────
  it("should call levelFilter.onChange when level select changes", () => {
    const levelOnChange = vi.fn();
    const levelOptions = [
      { value: "debug", label: "Debug" },
      { value: "info", label: "Info" },
      { value: "warn", label: "Warn" },
      { value: "error", label: "Error" },
    ];

    render(
      <DataTableFilters
        {...BASE_PROPS}
        levelFilter={{
          value: undefined,
          onChange: levelOnChange,
          options: levelOptions,
        }}
      />,
    );

    // Click the select trigger to open the dropdown
    const trigger = screen.getByRole("combobox", { name: /nivel/i });
    fireEvent.click(trigger);

    // Click on "Error" option
    const errorOption = screen.getByRole("option", { name: "Error" });
    fireEvent.click(errorOption);

    expect(levelOnChange).toHaveBeenCalledTimes(1);
    expect(levelOnChange).toHaveBeenCalledWith("error");
  });

  // ─── Test 6: conditional date shortcuts ──────────────────────────────
  it("should render date shortcut buttons only when dateShortcuts is provided", () => {
    const { rerender } = render(
      <DataTableFilters {...BASE_PROPS} dateShortcuts={undefined} />,
    );

    expect(screen.queryByRole("button", { name: /hoy/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /7 d/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /30 d/i })).toBeNull();

    rerender(
      <DataTableFilters {...BASE_PROPS} dateShortcuts={["today", "7d", "30d"]} />,
    );

    expect(screen.getByRole("button", { name: /hoy/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /7 d/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /30 d/i })).toBeDefined();
  });
});
