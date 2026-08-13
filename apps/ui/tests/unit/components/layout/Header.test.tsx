import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { Header } from "../../../../src/components/layout/Header";

describe("Header", () => {
  it("renders the brand name and auth actions by default", () => {
    render(<Header />);

    expect(screen.getByText("IADiagnostics")).toBeDefined();
    expect(screen.getByText("Iniciar sesión")).toBeDefined();
    expect(screen.getByText("Registrarse")).toBeDefined();
  });

  it("links the auth actions to /login", () => {
    render(<Header />);

    for (const label of ["Iniciar sesión", "Registrarse"]) {
      expect(screen.getByText(label).closest("a")?.getAttribute("href")).toBe(
        "/login",
      );
    }
  });

  it("hides auth actions when showAuthActions is false", () => {
    render(<Header showAuthActions={false} />);

    expect(screen.getByText("IADiagnostics")).toBeDefined();
    expect(screen.queryByText("Iniciar sesión")).toBeNull();
    expect(screen.queryByText("Registrarse")).toBeNull();
  });
});
