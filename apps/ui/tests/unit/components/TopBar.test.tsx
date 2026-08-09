import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TopBar } from "../../../src/components/dashboard/TopBar";
import type { Scenario } from "../../../src/components/dashboard/types";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// useClock is timing-based (interval) and covered by its own test file;
// here we stub it for deterministic clock assertions.
const { mockClockNow, mockOnLogout } = vi.hoisted(() => ({
  mockClockNow: { value: new Date(2026, 0, 1, 12, 30, 45) as Date | null },
  mockOnLogout: vi.fn(),
}));

vi.mock("../../../src/components/dashboard/useClock", () => ({
  useClock: () => mockClockNow.value,
}));

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

const baseProps = {
  scenarios: [scenario],
  selectedId: "audi-a3",
  onSelect: vi.fn(),
  loading: false,
  onLogout: mockOnLogout,
};

describe("TopBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClockNow.value = new Date(2026, 0, 1, 12, 30, 45);
  });

  it("should render branding, connection status, clock and the selected vehicle", () => {
    render(<TopBar {...baseProps} />);

    expect(screen.getByText(/Intelligent Automotive/)).toBeDefined();
    expect(screen.getByText("OBD-II · AI Assisted Workshop Tool")).toBeDefined();
    expect(screen.getByText("Conectado")).toBeDefined();
    expect(screen.getByText("12:30:45")).toBeDefined();
    expect(screen.getByRole("button", { name: /Audi A3 1.6 TDI/ })).toBeDefined();
  });

  it("should call onLogout when the logout button is clicked", () => {
    render(<TopBar {...baseProps} />);

    fireEvent.click(screen.getByTitle("Cerrar sesión"));

    expect(mockOnLogout).toHaveBeenCalledTimes(1);
  });

  it("should render a link to /profile", () => {
    render(<TopBar {...baseProps} />);

    const link = screen.getByTitle("Mi perfil");
    expect(link.getAttribute("href")).toBe("/profile");
  });

  it("should disable the vehicle selector while loading", () => {
    render(<TopBar {...baseProps} loading={true} selectedId="" />);

    const btn = screen.getByRole("button", {
      name: /Seleccionar vehículo/,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("should show the placeholder and disable the selector when no scenarios exist", () => {
    render(<TopBar {...baseProps} scenarios={[]} selectedId="" />);

    expect(screen.getByText("Seleccionar vehículo")).toBeDefined();
    const btn = screen.getByRole("button", {
      name: /Seleccionar vehículo/,
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("should show the clock placeholder when useClock returns null", () => {
    mockClockNow.value = null;
    render(<TopBar {...baseProps} scenarios={[]} selectedId="" />);

    expect(screen.getByText("--:--:--")).toBeDefined();
  });
});
