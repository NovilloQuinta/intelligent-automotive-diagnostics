import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
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
const { mockClockNow, mockOnLogout, mockAuthUser } = vi.hoisted(() => ({
  mockClockNow: { value: new Date(2026, 0, 1, 12, 30, 45) as Date | null },
  mockOnLogout: vi.fn(),
  mockAuthUser: {
    id: 1,
    username: "test",
    email: "test@test.com",
    userType: "individual" as const,
    isWorkshop: false,
    isAdmin: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
}));

vi.mock("../../../src/components/dashboard/useClock", () => ({
  useClock: () => mockClockNow.value,
}));

vi.mock("../../../src/lib/auth-context", () => ({
  useAuth: () => ({
    status: "authed" as const,
    user: mockAuthUser,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const scenarioWifi: Scenario = {
  id: "audi-a3",
  name: "Audi A3 1.6 TDI",
  vehicleType: "car",
  connectionType: "wifi",
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

const scenarioUsb: Scenario = {
  ...scenarioWifi,
  id: "usb",
  name: "ELM327 USB",
  connectionType: "usb",
};

const scenarioBluetooth: Scenario = {
  ...scenarioWifi,
  id: "bt",
  name: "ELM327 Bluetooth",
  connectionType: "bluetooth",
};

const baseProps = {
  scenarios: [scenarioWifi],
  selectedId: "audi-a3",
  onSelect: vi.fn(),
  loading: false,
  streamOk: true,
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
    expect(
      screen.getByText("Herramienta OBD-II · Diagnóstico Asistido por IA"),
    ).toBeDefined();
    expect(screen.getByText("Conectado")).toBeDefined();
    expect(screen.getByText("12:30:45")).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Audi A3 1.6 TDI/ }),
    ).toBeDefined();
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

  it("should show 'Sin conexión' when streamOk is false", () => {
    render(<TopBar {...baseProps} streamOk={false} />);

    expect(screen.getByText("Sin conexión")).toBeDefined();
    expect(screen.queryByText("Conectado")).toBeNull();
  });

  it("should NOT show the admin link when the user is not an admin", () => {
    mockAuthUser.isAdmin = false;
    render(<TopBar {...baseProps} />);

    expect(screen.queryByTitle("Panel de administración")).toBeNull();
  });

  it("should show the admin link when the user is an admin", () => {
    mockAuthUser.isAdmin = true;
    render(<TopBar {...baseProps} />);

    expect(
      screen.getByTitle("Panel de administración"),
    ).toBeDefined();
    expect(screen.getByText("Admin")).toBeDefined();
  });

  it("should show a WiFi icon when the selected scenario has connectionType 'wifi'", () => {
    render(<TopBar {...baseProps} />);

    expect(screen.getByTestId("connection-wifi")).toBeDefined();
    expect(screen.queryByTestId("connection-usb")).toBeNull();
    expect(screen.queryByTestId("connection-bluetooth")).toBeNull();
  });

  it("should show a USB icon when the selected scenario has connectionType 'usb'", () => {
    render(
      <TopBar
        {...baseProps}
        scenarios={[scenarioUsb]}
        selectedId="usb"
      />,
    );

    expect(screen.getByTestId("connection-usb")).toBeDefined();
    expect(screen.queryByTestId("connection-wifi")).toBeNull();
    expect(screen.queryByTestId("connection-bluetooth")).toBeNull();
  });

  it("should show a Bluetooth icon when the selected scenario has connectionType 'bluetooth'", () => {
    render(
      <TopBar
        {...baseProps}
        scenarios={[scenarioBluetooth]}
        selectedId="bt"
      />,
    );

    expect(screen.getByTestId("connection-bluetooth")).toBeDefined();
    expect(screen.queryByTestId("connection-wifi")).toBeNull();
    expect(screen.queryByTestId("connection-usb")).toBeNull();
  });

  it("should not show any connection icon when no scenario is selected", () => {
    render(<TopBar {...baseProps} selectedId="" />);

    expect(screen.queryByTestId("connection-wifi")).toBeNull();
    expect(screen.queryByTestId("connection-usb")).toBeNull();
    expect(screen.queryByTestId("connection-bluetooth")).toBeNull();
  });
});
