import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { DashboardLayout } from "../../../src/components/layout/DashboardLayout";
import type { Scenario } from "../../../src/components/dashboard/types";

const { mockAuthUser } = vi.hoisted(() => ({
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
  activeSection: "vehicle" as const,
  onSectionChange: vi.fn(),
  scenarios: [scenario],
  selectedId: "audi-a3",
  onSelectVehicle: vi.fn(),
  telemetry: { loading: false, streamOk: true },
  onLogout: vi.fn(),
};

describe("DashboardLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser.isAdmin = false;
  });

  it("should propagate dtcCount and hasDiagnosis to the Sidebar unchanged", () => {
    render(
      <DashboardLayout {...baseProps} dtcCount={7} hasDiagnosis={true}>
        <div>content</div>
      </DashboardLayout>,
    );

    const dtcButton = screen.getByTitle("Códigos DTC");
    expect(dtcButton.querySelector(".bg-destructive")).not.toBeNull();
    expect(screen.getByText("7")).toBeDefined();
  });

  it("should not show a DTC badge on the Sidebar when dtcCount is undefined", () => {
    render(
      <DashboardLayout {...baseProps}>
        <div>content</div>
      </DashboardLayout>,
    );

    const dtcButton = screen.getByTitle("Códigos DTC");
    expect(dtcButton.querySelector(".bg-destructive")).toBeNull();
  });

  it("should forward streamOk and loading to the TopBar", () => {
    render(
      <DashboardLayout
        {...baseProps}
        telemetry={{ loading: true, streamOk: false }}
      >
        <div>content</div>
      </DashboardLayout>,
    );

    expect(screen.getByText("Sin conexión")).toBeDefined();
    const vehicleButton = screen.getByRole("button", {
      name: /Audi A3 1.6 TDI/,
    }) as HTMLButtonElement;
    expect(vehicleButton.disabled).toBe(true);
  });

  it("should call onLogout when the TopBar logout button is clicked", () => {
    render(
      <DashboardLayout {...baseProps}>
        <div>content</div>
      </DashboardLayout>,
    );

    fireEvent.click(screen.getByTitle("Cerrar sesión"));

    expect(baseProps.onLogout).toHaveBeenCalledTimes(1);
  });

  it("should call onSectionChange with the section id when a sidebar item is clicked", () => {
    render(
      <DashboardLayout {...baseProps}>
        <div>content</div>
      </DashboardLayout>,
    );

    fireEvent.click(screen.getByTitle("Diagnóstico"));

    expect(baseProps.onSectionChange).toHaveBeenCalledWith("diagnosis");
  });

  it("should render the children inside the main content area", () => {
    render(
      <DashboardLayout {...baseProps}>
        <div>section content</div>
      </DashboardLayout>,
    );

    expect(screen.getByText("section content")).toBeDefined();
  });
});
