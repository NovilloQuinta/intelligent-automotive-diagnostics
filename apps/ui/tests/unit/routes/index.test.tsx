import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockHasTokens } = vi.hoisted(() => ({
  mockHasTokens: { value: true },
}));

// Mock the router infrastructure: createFileRoute(path) -> (config) -> Route.
// The real redirect() throws a sentinel the router catches; we replicate the
// sentinel throw so beforeLoad's contract can be asserted directly.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({ ...config }),
  redirect: (opts: { to: string }) => {
    throw Object.assign(new Error(`Redirect to ${opts.to}`), { to: opts.to });
  },
}));

vi.mock("../../../src/lib/api", () => ({
  api: { hasTokens: () => mockHasTokens.value },
}));

import { Route } from "../../../src/routes/index";

describe("index route", () => {
  beforeEach(() => {
    mockHasTokens.value = true;
  });

  it("should pass beforeLoad when tokens exist", () => {
    expect(() => (Route as unknown as { beforeLoad: () => void }).beforeLoad()).not.toThrow();
  });

  it("should throw a redirect to /login when no tokens exist", () => {
    mockHasTokens.value = false;

    let thrown: { to?: string } | null = null;
    try {
      (Route as unknown as { beforeLoad: () => void }).beforeLoad();
    } catch (e) {
      thrown = e as { to?: string };
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.to).toBe("/login");
  });

  it("should expose the DashboardPage as the route component", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((Route as any).component).toBeDefined();
  });
});
