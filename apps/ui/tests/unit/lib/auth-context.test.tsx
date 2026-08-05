import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../../src/lib/auth-context";
import { api } from "../../../src/lib/api";
import type { AuthUser } from "../../../src/components/dashboard/types";

const MOCK_USER: AuthUser = {
  id: 1,
  username: "juan",
  email: "j@b.com",
  userType: "individual",
  createdAt: "2026-01-01",
  isWorkshop: false,
};

const MOCK_TOKENS = { accessToken: "access-abc", refreshToken: "refresh-xyz" };

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

  it("authenticates on bootstrap when /me succeeds", async () => {
    localStorage.setItem("iad.accessToken", "tok");
    localStorage.setItem("iad.refreshToken", "rtok");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MOCK_USER,
      }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("authed");
    });
    expect(result.current.user).toMatchObject(MOCK_USER);
  });

  it("goes anonymous on bootstrap when /me fails — no stored-user fallback", async () => {
    localStorage.setItem("iad.accessToken", "tok");
    localStorage.setItem("iad.refreshToken", "rtok");
    // A legacy stored user must be ignored
    localStorage.setItem("iad.user", JSON.stringify(MOCK_USER));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("anonymous");
    });
    expect(result.current.user).toBeNull();
  });

  it("authenticates after login when /me succeeds", async () => {
    const mockFetch = vi
      .fn()
      // login
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_TOKENS })
      // getMe
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_USER });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login({ email: "a@b.com", password: "secret" });
    });

    expect(result.current.status).toBe("authed");
    expect(result.current.user).toMatchObject(MOCK_USER);
  });

  it("goes anonymous after login when /me fails — no stored-user fallback", async () => {
    const mockFetch = vi
      .fn()
      // login
      .mockResolvedValueOnce({ ok: true, json: async () => MOCK_TOKENS })
      // getMe fails
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login({ email: "a@b.com", password: "secret" });
    });

    expect(result.current.status).toBe("anonymous");
    expect(result.current.user).toBeNull();
  });

  it("logout delegates to api.logout and resets state", async () => {
    const logoutSpy = vi.spyOn(api, "logout").mockResolvedValue(undefined);
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("anonymous");
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("anonymous");
    expect(result.current.user).toBeNull();
  });

  it("stays loading while getMe is pending on bootstrap", async () => {
    localStorage.setItem("iad.accessToken", "tok");
    localStorage.setItem("iad.refreshToken", "rtok");

    let resolveMe!: (value: { ok: boolean; json: () => Promise<AuthUser> }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveMe = resolve;
          }),
      ),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    // getMe is still pending — bootstrap has not settled yet
    expect(result.current.status).toBe("loading");

    await act(async () => {
      resolveMe({ ok: true, json: async () => MOCK_USER });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("authed");
    });
    expect(result.current.user).toMatchObject(MOCK_USER);
  });

  it("authenticates after register with the returned user", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe("anonymous");
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...MOCK_TOKENS, user: MOCK_USER }),
      }),
    );

    await act(async () => {
      await result.current.register({
        username: "juan",
        email: "j@b.com",
        password: "12345678",
        userType: "individual",
      });
    });

    expect(result.current.status).toBe("authed");
    expect(result.current.user).toMatchObject(MOCK_USER);
  });

  it("goes anonymous when register fails", async () => {
    // Bootstrap with valid tokens → authed
    localStorage.setItem("iad.accessToken", "tok");
    localStorage.setItem("iad.refreshToken", "rtok");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({ ok: true, json: async () => MOCK_USER }),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe("authed");
    });

    // Register call fails with validation details
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({ details: [{ message: "email taken" }] }),
      }),
    );

    await act(async () => {
      await expect(
        result.current.register({
          username: "juan",
          email: "taken@b.com",
          password: "12345678",
          userType: "individual",
        }),
      ).rejects.toThrow("email taken");
    });

    expect(result.current.status).toBe("anonymous");
    expect(result.current.user).toBeNull();
  });

  it("ignores getMe resolution after unmount", async () => {
    localStorage.setItem("iad.accessToken", "tok");
    localStorage.setItem("iad.refreshToken", "rtok");

    let resolveMe!: (value: { ok: boolean; json: () => Promise<AuthUser> }) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveMe = resolve;
          }),
      ),
    );

    const { result, unmount } = renderHook(() => useAuth(), { wrapper });
    unmount();

    await act(async () => {
      resolveMe({ ok: true, json: async () => MOCK_USER });
    });

    // State updates are skipped after unmount — status never becomes authed
    expect(result.current.status).toBe("loading");
  });

  it("ignores getMe rejection after unmount", async () => {
    localStorage.setItem("iad.accessToken", "tok");
    localStorage.setItem("iad.refreshToken", "rtok");

    let rejectMe!: (reason: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            rejectMe = reject;
          }),
      ),
    );

    const { result, unmount } = renderHook(() => useAuth(), { wrapper });
    unmount();

    await act(async () => {
      rejectMe(new TypeError("offline"));
    });

    // The rejection is swallowed after unmount — status stays loading
    expect(result.current.status).toBe("loading");
  });

  it("throws when used outside of an AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth() must be used inside <AuthProvider>",
    );
  });
});
