import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    options: { component: config.component },
  }),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

const { mockForgotPassword } = vi.hoisted(() => ({
  mockForgotPassword: vi.fn(),
}));

vi.mock("../../../src/lib/api", () => ({
  api: { forgotPassword: mockForgotPassword },
}));

import { Route } from "../../../src/routes/forgot-password";
const ForgotPasswordPage = (
  Route as unknown as { options: { component: React.ComponentType } }
).options.component;

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an email field and a link back to /login", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByPlaceholderText("tu@email.com")).toBeDefined();
    const backLink = screen.getByText(/Volver a iniciar sesión|Iniciar sesión/i);
    expect(backLink.closest("a")?.getAttribute("href")).toBe("/login");
  });

  it("validates the email before submitting", async () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));
    await waitFor(() => {
      expect(screen.getByText("Email inválido")).toBeDefined();
    });
    expect(mockForgotPassword).not.toHaveBeenCalled();
  });

  it("calls api.forgotPassword and always shows the generic success message", async () => {
    mockForgotPassword.mockResolvedValueOnce(undefined);
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText("tu@email.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));

    await waitFor(() => {
      expect(mockForgotPassword).toHaveBeenCalledWith("a@b.com");
    });
    await waitFor(() => {
      expect(
        screen.getByText(
          /Si el email existe, te hemos enviado un enlace de recuperación/i,
        ),
      ).toBeDefined();
    });
  });

  it("shows the same generic success message even when the request fails", async () => {
    mockForgotPassword.mockRejectedValueOnce(new Error("network down"));
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByPlaceholderText("tu@email.com"), {
      target: { value: "a@b.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enviar/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /Si el email existe, te hemos enviado un enlace de recuperación/i,
        ),
      ).toBeDefined();
    });
  });
});
