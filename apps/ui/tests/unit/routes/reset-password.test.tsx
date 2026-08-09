import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mockSearch, mockNavigate } = vi.hoisted(() => ({
  mockSearch: { value: {} as { token?: string } },
  mockNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    options: { component: config.component },
    useSearch: () => mockSearch.value,
  }),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

const { mockResetPassword } = vi.hoisted(() => ({
  mockResetPassword: vi.fn(),
}));

vi.mock("../../../src/lib/api", () => ({
  api: { resetPassword: mockResetPassword },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { Route } from "../../../src/routes/reset-password";
const ResetPasswordPage = (
  Route as unknown as { options: { component: React.ComponentType } }
).options.component;

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.value = { token: "raw-token" };
  });

  it("shows an error state instead of the form when there is no token", () => {
    mockSearch.value = {};
    render(<ResetPasswordPage />);
    expect(screen.getByText(/enlace no es válido|token/i)).toBeDefined();
    expect(screen.queryByPlaceholderText("••••••••")).toBeNull();
  });

  it("renders the password form when a token is present", () => {
    render(<ResetPasswordPage />);
    expect(screen.getByLabelText(/Nueva contraseña/i)).toBeDefined();
    expect(screen.getByLabelText(/Confirmar contraseña/i)).toBeDefined();
  });

  it("validates password confirmation match", async () => {
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/Nueva contraseña/i), {
      target: { value: "Password123!" },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/i), {
      target: { value: "Different123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Restablecer/i }));

    await waitFor(() => {
      expect(screen.getByText("Las contraseñas no coinciden")).toBeDefined();
    });
    expect(mockResetPassword).not.toHaveBeenCalled();
  });

  it("submits the token and new password, then navigates to /login", async () => {
    mockResetPassword.mockResolvedValueOnce(undefined);
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/Nueva contraseña/i), {
      target: { value: "Password123!" },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/i), {
      target: { value: "Password123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Restablecer/i }));

    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith(
        "raw-token",
        "Password123!",
      );
    });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/login" });
    });
  });

  it("shows a server error when the token is invalid or expired", async () => {
    mockResetPassword.mockRejectedValueOnce(
      new Error("Invalid or expired token"),
    );
    render(<ResetPasswordPage />);

    fireEvent.change(screen.getByLabelText(/Nueva contraseña/i), {
      target: { value: "Password123!" },
    });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/i), {
      target: { value: "Password123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Restablecer/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid or expired token")).toBeDefined();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
