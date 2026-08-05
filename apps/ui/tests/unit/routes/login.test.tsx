import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockAuthState = { status: "anonymous" as string, user: null as unknown, login: vi.fn(), register: vi.fn(), logout: vi.fn() };

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    options: { component: config.component },
  }),
  Navigate: ({ to }: { to: string }) => `<navigate data-to="${to}" data-testid="navigate" />` as unknown as JSX.Element,
  useNavigate: () => vi.fn(),
}));

vi.mock("../../../src/lib/auth-context", () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { Route } from "../../../src/routes/login";
const AuthPage = (Route as unknown as { options: { component: React.ComponentType } }).options.component;

describe("AuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.status = "anonymous";
    mockAuthState.user = null;
  });

  it("renders login tab by default", () => {
    render(<AuthPage />);
    expect(screen.getByRole("tab", { name: /Iniciar sesión/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Registrarse/i })).toBeDefined();
  });

  it("shows register form when tab clicked", async () => {
    render(<AuthPage />);
    fireEvent.mouseDown(screen.getByText("Registrarse"));
    await waitFor(() => {
      expect(screen.getByText("Usuario")).toBeDefined();
    });
  });

  it("validates email on login form", async () => {
    render(<AuthPage />);
    fireEvent.click(screen.getByRole("button", { name: /Iniciar sesión/i }));
    await waitFor(() => {
      expect(screen.getByText("Email inválido")).toBeDefined();
    });
  });

  it("validates required fields on register", async () => {
    render(<AuthPage />);
    fireEvent.mouseDown(screen.getByText("Registrarse"));
    await waitFor(() => {
      expect(screen.getByText("Crear cuenta")).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: /Crear cuenta/i }));
    await waitFor(() => {
      expect(screen.getByText("Mínimo 3 caracteres")).toBeDefined();
    });
  });

  it("renders loading state", () => {
    mockAuthState.status = "loading";
    render(<AuthPage />);
    expect(screen.getByText("Cargando…")).toBeDefined();
  });

  it("renders Navigate when authed", () => {
    mockAuthState.status = "authed";
    const { container } = render(<AuthPage />);
    expect(container.innerHTML).toContain('data-to="/"');
  });

  it("submits login form and calls login", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    mockAuthState.login = login;
    render(<AuthPage />);

    fireEvent.change(screen.getByPlaceholderText("tu@email.com"), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /Iniciar sesión/i }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({ email: "a@b.com", password: "password123" });
    });
  });

  it("switches between login and register tabs", async () => {
    render(<AuthPage />);
    // Start on login tab
    expect(screen.getByPlaceholderText("tu@email.com")).toBeDefined();

    // Switch to register
    fireEvent.mouseDown(screen.getByText("Registrarse"));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("usuario123")).toBeDefined();
    });

    // Switch back to login
    fireEvent.click(screen.getByRole("tab", { name: /Iniciar sesión/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("tu@email.com")).toBeDefined();
    });
  });

  it("submits register form with required fields", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    mockAuthState.register = register;
    const { container } = render(<AuthPage />);

    fireEvent.mouseDown(screen.getByText("Registrarse"));
    await waitFor(() => {
      expect(screen.getByText("Crear cuenta")).toBeDefined();
    });

    const usernameInput = container.querySelector('#reg-username') as HTMLInputElement;
    const emailInput = container.querySelector('#reg-email') as HTMLInputElement;
    const passwordInput = container.querySelector('#reg-password') as HTMLInputElement;
    fireEvent.change(usernameInput, { target: { value: "juan" } });
    fireEvent.change(emailInput, { target: { value: "j@b.com" } });
    fireEvent.change(passwordInput, { target: { value: "12345678" } });
    fireEvent.click(screen.getByRole("button", { name: /Crear cuenta/i }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith(expect.objectContaining({
        username: "juan",
        email: "j@b.com",
        password: "12345678",
        userType: "individual",
      }));
    });
  });
});
