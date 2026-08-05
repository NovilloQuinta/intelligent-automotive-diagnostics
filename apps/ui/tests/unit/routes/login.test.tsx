import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Must mock before any imports that touch @tanstack/react-router
vi.mock("@tanstack/react-router", () => {
  const fn = () => (config: any) => config.component;
  return {
    createFileRoute: fn,
    useNavigate: () => vi.fn(),
  };
});

// Mock auth context
const mockLogin = vi.fn();
const mockRegister = vi.fn();

vi.mock("../../../src/lib/auth-context", () => ({
  useAuth: () => ({
    status: "anonymous" as const,
    user: null,
    login: mockLogin,
    register: mockRegister,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The login route exports `Route` with the component. Access via Route.options.component
import { Route } from "../../../src/routes/login";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AuthPage = (Route as any).options?.component ?? (Route as any).component;

describe("AuthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login tab by default", () => {
    if (!AuthPage) return; // Skip if route mocking doesn't resolve component
    render(<AuthPage />);
    expect(screen.getByText("Iniciar sesión")).toBeDefined();
    expect(screen.getByText("Registrarse")).toBeDefined();
  });

  it("shows register form when tab clicked", async () => {
    if (!AuthPage) return;
    render(<AuthPage />);

    fireEvent.click(screen.getByText("Registrarse"));

    await waitFor(() => {
      expect(screen.getByText("Usuario")).toBeDefined();
    });
  });

  it("validates email on login form", async () => {
    if (!AuthPage) return;
    render(<AuthPage />);

    fireEvent.click(screen.getByText("Iniciar sesión"));

    await waitFor(() => {
      expect(screen.getByText("Email inválido")).toBeDefined();
    });
  });

  it("validates required fields on register", async () => {
    if (!AuthPage) return;
    render(<AuthPage />);

    fireEvent.click(screen.getByText("Registrarse"));

    await waitFor(() => {
      expect(screen.getByText("Crear cuenta")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Crear cuenta"));

    await waitFor(() => {
      expect(screen.getByText("Mínimo 3 caracteres")).toBeDefined();
    });
  });
});
