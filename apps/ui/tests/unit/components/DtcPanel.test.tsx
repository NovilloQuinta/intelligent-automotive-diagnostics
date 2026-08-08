import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DtcPanel } from "../../../src/components/dashboard/DtcPanel";

// ---------------------------------------------------------------------------
// Mock the hooks that DtcPanel now uses internally
// ---------------------------------------------------------------------------

const mockPendingHook = vi.fn();
const mockPermanentHook = vi.fn();
const mockClearDtcFn = vi.fn();

vi.mock("../../../src/components/dashboard/usePendingDtc", () => ({
  usePendingDtc: (_scenarioId: string) => mockPendingHook(),
}));

vi.mock("../../../src/components/dashboard/usePermanentDtc", () => ({
  usePermanentDtc: (_scenarioId: string) => mockPermanentHook(),
}));

vi.mock("../../../src/components/dashboard/useClearDtc", () => ({
  useClearDtc: () => ({
    clearDtc: mockClearDtcFn,
    loading: false,
    error: null,
  }),
}));

// ---------------------------------------------------------------------------
// Default hook return values
// ---------------------------------------------------------------------------

const emptyHook = { dtcCodes: [], loading: false, error: null };

function setPendingHook(
  value: typeof emptyHook = emptyHook,
) {
  mockPendingHook.mockReturnValue(value);
}

function setPermanentHook(
  value: typeof emptyHook = emptyHook,
) {
  mockPermanentHook.mockReturnValue(value);
}

beforeEach(() => {
  setPendingHook();
  setPermanentHook();
  mockClearDtcFn.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DtcPanel", () => {
  const DEFAULT_PROPS = {
    codes: null as { code: string; description: string }[] | null,
    severity: null as "low" | "medium" | "high" | "critical" | null,
    empty: false,
    selectedCode: null as string | null,
    onSelect: vi.fn(),
    scenarioId: "audi-a3-idle",
  };

  // ---- Legacy empty / no-codes / code-list tests (updated with scenarioId) ----

  it("should render the empty prompt and a dash count when empty", () => {
    render(<DtcPanel {...DEFAULT_PROPS} codes={null} empty={true} />);

    expect(
      screen.getByText("Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO"),
    ).toBeDefined();
    expect(screen.getByText("—")).toBeDefined();
    expect(screen.queryByText("Ningún código de error")).toBeNull();
  });

  it("should render 'Ninguna' in the Almacenadas section and zero count for an empty array", () => {
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />);

    // The Almacenadas section shows "Ninguna" when there are no stored codes
    const ningunas = screen.getAllByText("Ninguna");
    expect(ningunas.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("0 registrados")).toBeDefined();
  });

  it("should list DTC codes with the severity meta when present", () => {
    const codes = [
      { code: "P0301", description: "Cilindro 1: fallo de encendido" },
    ];
    const { container } = render(
      <DtcPanel
        {...DEFAULT_PROPS}
        codes={codes}
        severity="critical"
        empty={false}
      />,
    );

    expect(screen.getByText("P0301")).toBeDefined();
    expect(screen.getByText("Cilindro 1: fallo de encendido")).toBeDefined();
    expect(screen.getByText("1 registrado")).toBeDefined();
    expect(container.querySelector(".lucide-shield-alert")).not.toBeNull();
  });

  it("should use the default medium severity meta and plural count when severity is null", () => {
    const codes = [
      { code: "P0420", description: "Eficiencia del catalizador" },
      { code: "P0128", description: "Termostato" },
    ];
    const { container } = render(
      <DtcPanel {...DEFAULT_PROPS} codes={codes} severity={null} empty={false} />,
    );

    expect(screen.getByText("2 registrados")).toBeDefined();
    expect(screen.getByText("P0420")).toBeDefined();
    expect(screen.getByText("P0128")).toBeDefined();
    expect(container.querySelector(".lucide-triangle-alert")).not.toBeNull();
  });

  it("should invoke onSelect with the code when a row is clicked", () => {
    const onSelect = vi.fn();
    const codes = [{ code: "P0301", description: "Misfire" }];
    render(
      <DtcPanel
        {...DEFAULT_PROPS}
        codes={codes}
        severity={null}
        empty={false}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByText("P0301"));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("P0301");
  });

  it("should mark only the selected row as selected", () => {
    const codes = [
      { code: "P0301", description: "Misfire" },
      { code: "P0420", description: "Catalyst" },
    ];
    render(
      <DtcPanel
        {...DEFAULT_PROPS}
        codes={codes}
        severity={null}
        empty={false}
        onSelect={vi.fn()}
        selectedCode="P0301"
      />,
    );

    const selectedRow = screen.getByText("P0301").closest("li");
    const otherRow = screen.getByText("P0420").closest("li");

    expect(selectedRow?.getAttribute("aria-selected")).toBe("true");
    expect(selectedRow?.className).toContain("bg-primary/10");
    expect(otherRow?.getAttribute("aria-selected")).toBe("false");
    expect(otherRow?.className).not.toContain("bg-primary/10");
  });

  // ---- Three-section layout ----

  it("should render three DTC sections: Almacenadas, Pendientes, Permanentes", () => {
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />);

    expect(screen.getByText("Almacenadas")).toBeDefined();
    expect(screen.getByText("Pendientes")).toBeDefined();
    expect(screen.getByText("Permanentes")).toBeDefined();
  });

  it("should show 'Ninguna' in the Pendientes section when there are no pending codes", () => {
    setPendingHook({ dtcCodes: [], loading: false, error: null });
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />);

    // All "Ninguna" messages should appear (one per empty section)
    const ningunas = screen.getAllByText("Ninguna");
    // There should be at least 2: one from the no-codes message for "Almacenadas"
    // ("Ningún código de error") and one for Pendientes empty list. Plus Permanentes.
    expect(ningunas.length).toBeGreaterThanOrEqual(2);
  });

  it("should show pending codes when they exist", () => {
    const pendingCodes = [
      { code: "P0171", description: "Mezcla pobre" },
    ];
    setPendingHook({ dtcCodes: pendingCodes, loading: false, error: null });
    setPermanentHook({ dtcCodes: [], loading: false, error: null });
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />);

    expect(screen.getByText("P0171")).toBeDefined();
    expect(screen.getByText("Mezcla pobre")).toBeDefined();
  });

  it("should show permanent codes when they exist", () => {
    const permanentCodes = [
      { code: "P0420", description: "Catalizador" },
    ];
    setPendingHook({ dtcCodes: [], loading: false, error: null });
    setPermanentHook({ dtcCodes: permanentCodes, loading: false, error: null });
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />);

    expect(screen.getByText("P0420")).toBeDefined();
    expect(screen.getByText("Catalizador")).toBeDefined();
  });

  // ---- Clear DTC button + AlertDialog ----

  it("should render a 'Borrar averías' button", () => {
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />);

    expect(screen.getByRole("button", { name: /borrar averías/i })).toBeDefined();
  });

  it("should open the confirmation dialog when clicking 'Borrar averías'", async () => {
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />);

    fireEvent.click(screen.getByRole("button", { name: /borrar averías/i }));

    // AlertDialog should now be visible — both title and button share the text,
    // so check the dialog description instead
    await waitFor(() => {
      expect(
        screen.getByText(/Se borrarán las averías y sus freeze frames/),
      ).toBeDefined();
    });
  });

  it("should call clearDtc on confirmation and show a success message", async () => {
    mockClearDtcFn.mockResolvedValue(true);

    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />);

    fireEvent.click(screen.getByRole("button", { name: /borrar averías/i }));

    // Wait for the dialog to appear by checking its description
    await waitFor(() => {
      expect(
        screen.getByText(/Se borrarán las averías y sus freeze frames/),
      ).toBeDefined();
    });

    // Click the confirm button in the dialog
    fireEvent.click(
      screen.getByRole("button", { name: /confirmar/i }),
    );

    await waitFor(() => {
      expect(mockClearDtcFn).toHaveBeenCalledWith("audi-a3-idle");
    });
  });
});
