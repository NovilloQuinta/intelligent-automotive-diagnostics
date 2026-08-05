import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../../src/lib/auth-context";

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("transitions to anonymous when no tokens exist", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // When no tokens exist, it goes directly to anonymous (no /me call needed)
    await waitFor(() => {
      expect(result.current.status).toBe("anonymous");
    });
    expect(result.current.user).toBeNull();
  });

  it("attempts validation when tokens exist", async () => {
    localStorage.setItem("iad.accessToken", "tok");
    localStorage.setItem("iad.refreshToken", "rtok");

    // /api/auth/me returns 404 (not implemented yet) → falls back to stored user
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    }));

    const { result } = renderHook(() => useAuth(), { wrapper });

    // Should go to anonymous since no stored user and /me failed
    await waitFor(() => {
      expect(result.current.status).toBe("anonymous");
    });
  });

  it("logout sets status to anonymous", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("anonymous");
    });

    // Can call logout even when anonymous
    result.current.logout();
    expect(result.current.status).toBe("anonymous");
  });
});
