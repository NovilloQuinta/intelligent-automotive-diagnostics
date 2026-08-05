import { beforeEach, describe, expect, it, vi } from "vitest";

// We need to import the module fresh per test because it has module-level state
// (refreshPromise). Use dynamic import after clearing localStorage.

const MOCK_TOKENS = {
  accessToken: "access-abc",
  refreshToken: "refresh-xyz",
};

function setStoredTokens() {
  localStorage.setItem("iad.accessToken", MOCK_TOKENS.accessToken);
  localStorage.setItem("iad.refreshToken", MOCK_TOKENS.refreshToken);
}

describe("api", () => {
  let api: typeof import("../../../src/lib/api").api;

  beforeEach(async () => {
    localStorage.clear();
    vi.restoreAllMocks();
    // Re-import to reset module-level refreshPromise
    api = (await import("../../../src/lib/api")).api;
  });

  // -----------------------------------------------------------------------
  // login
  // -----------------------------------------------------------------------

  describe("login", () => {
    it("stores tokens on success", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => MOCK_TOKENS,
      }));

      const result = await api.login({ email: "a@b.com", password: "secret" });

      expect(result).toEqual(MOCK_TOKENS);
      expect(localStorage.getItem("iad.accessToken")).toBe("access-abc");
      expect(localStorage.getItem("iad.refreshToken")).toBe("refresh-xyz");
    });

    it("throws on 401", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: "Invalid credentials" }),
      }));

      await expect(api.login({ email: "a@b.com", password: "wrong" }))
        .rejects.toThrow("Invalid credentials");
    });
  });

  // -----------------------------------------------------------------------
  // register
  // -----------------------------------------------------------------------

  describe("register", () => {
    it("stores tokens and user on success", async () => {
      const mockUser = { id: 1, username: "juan", email: "j@b.com", userType: "individual", createdAt: "2026-01-01", isWorkshop: false };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...MOCK_TOKENS, user: mockUser }),
      }));

      const result = await api.register({
        username: "juan", email: "j@b.com", password: "12345678", userType: "individual",
      });

      expect(result.user).toMatchObject(mockUser);
      expect(localStorage.getItem("iad.accessToken")).toBe("access-abc");
    });
  });

  // -----------------------------------------------------------------------
  // getScenarios (authenticated)
  // -----------------------------------------------------------------------

  describe("getScenarios", () => {
    it("adds Bearer header and unwraps { scenarios }", async () => {
      setStoredTokens();
      const scenarios = [{ id: "audi-a3-idle", name: "Audi A3", vehicleType: "car" }];
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scenarios }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.getScenarios();

      expect(result).toEqual(scenarios);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/scenarios");
      expect(init.headers).toMatchObject({ Authorization: "Bearer access-abc" });
    });

    it("refreshes token on 401 and retries", async () => {
      setStoredTokens();
      const scenarios = [{ id: "kawa-z900", name: "Kawasaki Z900", vehicleType: "motorcycle" }];
      const mockFetch = vi.fn()
        // First call: 401
        .mockResolvedValueOnce({ ok: false, status: 401 })
        // Refresh call
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ accessToken: "new-access", refreshToken: "new-refresh" }),
        })
        // Retry: success
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ scenarios }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.getScenarios();

      expect(result).toEqual(scenarios);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      // New token should be stored
      expect(localStorage.getItem("iad.accessToken")).toBe("new-access");
    });

    it("throws if refresh fails", async () => {
      setStoredTokens();
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "Invalid refresh token" }) });
      vi.stubGlobal("fetch", mockFetch);

      await expect(api.getScenarios()).rejects.toThrow("Authentication required");
      expect(localStorage.getItem("iad.accessToken")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // runDiagnosis
  // -----------------------------------------------------------------------

  describe("runDiagnosis", () => {
    it("posts scenarioId and returns DiagnosisResponse", async () => {
      setStoredTokens();
      const diagnosis = {
        rawData: '{"rpm":750}', parsedValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
        dtcCodes: [{ code: "P0301", description: "Misfire" }],
        diagnosisText: "[HIGH] P0301", severity: "high",
      };
      const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => diagnosis });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.runDiagnosis("audi-a3-idle");

      expect(result).toEqual(diagnosis);
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ scenarioId: "audi-a3-idle" });
    });
  });

  // -----------------------------------------------------------------------
  // hasTokens / logout
  // -----------------------------------------------------------------------

  describe("session", () => {
    it("hasTokens returns false when empty", () => {
      expect(api.hasTokens()).toBe(false);
    });

    it("hasTokens returns true after login stores tokens", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => MOCK_TOKENS }));
      await api.login({ email: "a@b.com", password: "s" });
      expect(api.hasTokens()).toBe(true);
    });

    it("logout clears all tokens", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => MOCK_TOKENS }));
      await api.login({ email: "a@b.com", password: "s" });
      api.logout();
      expect(api.hasTokens()).toBe(false);
      expect(localStorage.getItem("iad.accessToken")).toBeNull();
    });
  });
});
