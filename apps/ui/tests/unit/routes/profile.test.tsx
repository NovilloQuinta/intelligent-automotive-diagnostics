import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { AuthUser } from "../../../src/components/dashboard/types";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    options: { component: config.component },
  }),
  Navigate: ({ to }: { to: string }) =>
    (`<navigate data-to="${to}" data-testid="navigate" />` as unknown) as JSX.Element,
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const INDIVIDUAL_USER: AuthUser = {
  id: 1,
  username: "juan",
  email: "j@b.com",
  userType: "individual",
  address: "C/ Mayor 1",
  createdAt: "2026-01-01",
  isWorkshop: false,
};

const WORKSHOP_USER: AuthUser = {
  id: 2,
  username: "taller1",
  email: "taller@b.com",
  userType: "workshop",
  businessName: "Talleres AutoPro",
  taxId: "B12345678",
  address: "C/ Industria 5",
  createdAt: "2026-01-01",
  isWorkshop: true,
};

const mockAuthState = {
  status: "authed" as "loading" | "authed" | "anonymous",
  user: INDIVIDUAL_USER as AuthUser | null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

vi.mock("../../../src/lib/auth-context", () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const { mockUpdateProfile, mockChangePassword } = vi.hoisted(() => ({
  mockUpdateProfile: vi.fn(),
  mockChangePassword: vi.fn(),
}));

vi.mock("../../../src/lib/api", () => ({
  api: { updateProfile: mockUpdateProfile, changePassword: mockChangePassword },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { Route } from "../../../src/routes/profile";
const ProfilePage = (
  Route as unknown as { options: { component: React.ComponentType } }
).options.component;

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.status = "authed";
    mockAuthState.user = INDIVIDUAL_USER;
    mockAuthState.refreshUser = vi.fn().mockResolvedValue(undefined);
    mockAuthState.logout = vi.fn().mockResolvedValue(undefined);
  });

  it("redirects to /login when anonymous", () => {
    mockAuthState.status = "anonymous";
    const { container } = render(<ProfilePage />);
    expect(container.innerHTML).toContain('data-to="/login"');
  });

  it("renders the data tab prefilled with the current user, without an email field", () => {
    render(<ProfilePage />);

    const usernameInput = screen.getByDisplayValue("juan") as HTMLInputElement;
    expect(usernameInput).toBeDefined();
    expect(usernameInput.name).toBe("username");
    expect(screen.queryByLabelText(/^email$/i)).toBeNull();
  });

  it("renders the shared header (without auth actions) and footer", () => {
    render(<ProfilePage />);

    expect(screen.getByText("IADiagnostics")).toBeDefined();
    expect(screen.getByText("Términos")).toBeDefined();
    expect(screen.getByText("Privacidad")).toBeDefined();
    expect(screen.getByText("Contacto")).toBeDefined();
  });

  it("does not show workshop fields for an individual user", () => {
    render(<ProfilePage />);
    expect(screen.queryByLabelText(/Nombre del taller/i)).toBeNull();
    expect(screen.queryByLabelText(/CIF/i)).toBeNull();
  });

  it("shows workshop fields for a workshop user", () => {
    mockAuthState.user = WORKSHOP_USER;
    render(<ProfilePage />);
    expect(screen.getByDisplayValue("Talleres AutoPro")).toBeDefined();
    expect(screen.getByDisplayValue("B12345678")).toBeDefined();
  });

  it("submits profile updates and refreshes the cached user", async () => {
    mockUpdateProfile.mockResolvedValueOnce({ ...INDIVIDUAL_USER, username: "juan2" });
    render(<ProfilePage />);

    fireEvent.change(screen.getByDisplayValue("juan"), {
      target: { value: "juan2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ username: "juan2" }),
      );
    });
    await waitFor(() => {
      expect(mockAuthState.refreshUser).toHaveBeenCalledTimes(1);
    });
  });

  it("switches to the password tab and validates matching passwords", async () => {
    render(<ProfilePage />);

    fireEvent.mouseDown(screen.getByText("Contraseña"));
    await waitFor(() => {
      expect(screen.getByLabelText(/Contraseña actual/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/Contraseña actual/i), {
      target: { value: "OldPass123!" },
    });
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña$/i), {
      target: { value: "NewPass456!" },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar nueva contraseña/i), {
      target: { value: "Mismatch789!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Cambiar contraseña/i }));

    await waitFor(() => {
      expect(screen.getByText("Las contraseñas no coinciden")).toBeDefined();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it("submits a password change and logs out locally afterwards", async () => {
    mockChangePassword.mockResolvedValueOnce(undefined);
    render(<ProfilePage />);

    fireEvent.mouseDown(screen.getByText("Contraseña"));
    await waitFor(() => {
      expect(screen.getByLabelText(/Contraseña actual/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/Contraseña actual/i), {
      target: { value: "OldPass123!" },
    });
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña$/i), {
      target: { value: "NewPass456!" },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar nueva contraseña/i), {
      target: { value: "NewPass456!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Cambiar contraseña/i }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith(
        "OldPass123!",
        "NewPass456!",
      );
    });
    await waitFor(() => {
      expect(mockAuthState.logout).toHaveBeenCalledTimes(1);
    });
  });
});
