import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";

const routerMock = vi.hoisted(() => ({ invalidate: vi.fn() }));

// Must mock before any imports that touch @tanstack/react-router
vi.mock("@tanstack/react-router", () => {
  let routeConfig: unknown = null;
  return {
    createRootRouteWithContext: () => (config: unknown) => {
      routeConfig = config;
      return {
        options: config,
        useRouteContext: () => ({
          queryClient: { clear: vi.fn(), getQueryData: vi.fn() },
        }),
      };
    },
    Link: ({ to, children }: { to: string; children: ReactNode }) => (
      <a href={to}>{children}</a>
    ),
    Outlet: () => null,
    useRouter: () => ({ invalidate: routerMock.invalidate }),
  };
});

vi.mock("../../../src/lib/auth-context", () => ({
  useAuth: () => ({
    status: "anonymous",
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { Route } from "../../../src/routes/__root";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const options = (Route as any).options as {
  notFoundComponent: ComponentType;
  errorComponent: ComponentType<{ error: Error; reset: () => void }>;
};

const { notFoundComponent: NotFoundComponent, errorComponent: ErrorComponent } =
  options;

describe("__root", () => {
  beforeEach(() => {
    routerMock.invalidate.mockClear();
  });

  // RootComponent skipped — infrastructure wrapper (providers + Outlet + Toaster).
  // Covered indirectly by integration tests. Equivalent to Tier INFRA.
  it.skip("should render RootComponent with Outlet", () => {
    const RootComponent = (
      Route as unknown as { options: { component: ComponentType } }
    ).options.component;
    render(<RootComponent />);
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("should render 404 and Page not found in NotFoundComponent", () => {
    render(<NotFoundComponent />);
    expect(screen.getByText("404")).toBeDefined();
    expect(screen.getByText("Page not found")).toBeDefined();
  });

  it("should render error message and Try again calls router.invalidate and reset", () => {
    const reset = vi.fn();
    render(<ErrorComponent error={new Error("boom")} reset={reset} />);

    expect(screen.getByText("This page didn't load")).toBeDefined();

    fireEvent.click(screen.getByText("Try again"));

    expect(routerMock.invalidate).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("should not log the error to the console", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(<ErrorComponent error={new Error("boom")} reset={vi.fn()} />);

    expect(consoleError).not.toHaveBeenCalled();
  });
});
