import { beforeEach, describe, expect, it, vi } from "vitest";

// We need to import the module fresh per test because it has module-level state
// (refreshPromise). Use dynamic import after clearing localStorage.

const MOCK_TOKENS = {
  accessToken: "access-abc",
  refreshToken: "refresh-xyz",
};

const MOCK_USER = {
  id: 1,
  username: "juan",
  email: "j@b.com",
  userType: "individual",
  createdAt: "2026-01-01",
  isWorkshop: false,
};

function setStoredTokens() {
  localStorage.setItem("iad.accessToken", MOCK_TOKENS.accessToken);
  localStorage.setItem("iad.refreshToken", MOCK_TOKENS.refreshToken);
}

describe("api", () => {
  let api: typeof import("../../../src/lib/api").api;
  let apiFetch: typeof import("../../../src/lib/api").apiFetch;
  let assertOk: typeof import("../../../src/lib/api").assertOk;
  let GENERIC_ERROR_MESSAGE: typeof import("../../../src/lib/api").GENERIC_ERROR_MESSAGE;

  beforeEach(async () => {
    localStorage.clear();
    vi.restoreAllMocks();
    // Re-import to reset module-level refreshPromise
    const mod = await import("../../../src/lib/api");
    api = mod.api;
    apiFetch = mod.apiFetch;
    assertOk = mod.assertOk;
    GENERIC_ERROR_MESSAGE = mod.GENERIC_ERROR_MESSAGE;
  });

  // -----------------------------------------------------------------------
  // login
  // -----------------------------------------------------------------------

  describe("login", () => {
    it("stores tokens on success", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => MOCK_TOKENS,
        }),
      );

      const result = await api.login({ email: "a@b.com", password: "secret" });

      expect(result).toEqual(MOCK_TOKENS);
      expect(localStorage.getItem("iad.accessToken")).toBe("access-abc");
      expect(localStorage.getItem("iad.refreshToken")).toBe("refresh-xyz");
    });

    it("throws on 401", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Invalid credentials" }),
        }),
      );

      await expect(
        api.login({ email: "a@b.com", password: "wrong" }),
      ).rejects.toThrow("Invalid credentials");
    });
  });

  // -----------------------------------------------------------------------
  // register (error paths through assertOk)
  // -----------------------------------------------------------------------

  describe("register errors", () => {
    it("throws joined validation messages when register fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 422,
          json: async () => ({
            error: "Validation failed",
            details: [
              { message: "email must be valid" },
              { message: "password too short" },
            ],
          }),
        }),
      );

      await expect(
        api.register({
          username: "juan",
          email: "bad@b.com",
          password: "x",
          userType: "individual",
        }),
      ).rejects.toThrow("email must be valid, password too short");
    });

    it("throws the generic message on a 500, never the raw status fallback", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => {
            throw new Error("unparseable body");
          },
        }),
      );

      await expect(
        api.register({
          username: "juan",
          email: "j@b.com",
          password: "12345678",
          userType: "individual",
        }),
      ).rejects.toThrow(GENERIC_ERROR_MESSAGE);
    });
  });

  // -----------------------------------------------------------------------
  // register
  // -----------------------------------------------------------------------

  describe("register", () => {
    it("stores tokens but never persists the user", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...MOCK_TOKENS, user: MOCK_USER }),
        }),
      );

      const result = await api.register({
        username: "juan",
        email: "j@b.com",
        password: "12345678",
        userType: "individual",
      });

      expect(result.user).toMatchObject(MOCK_USER);
      expect(result.tokens).toEqual(MOCK_TOKENS);
      expect(localStorage.getItem("iad.accessToken")).toBe("access-abc");
      expect(localStorage.getItem("iad.refreshToken")).toBe("refresh-xyz");
      expect(localStorage.getItem("iad.user")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getMe
  // -----------------------------------------------------------------------

  describe("getMe", () => {
    it("returns the user from the server without persisting it", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => MOCK_USER,
        }),
      );

      const user = await api.getMe();

      expect(user).toEqual(MOCK_USER);
      expect(localStorage.getItem("iad.user")).toBeNull();
    });

    it("throws AuthError when the server fails — no stored-user fallback", async () => {
      setStoredTokens();
      // A legacy stored user must be ignored
      localStorage.setItem("iad.user", JSON.stringify(MOCK_USER));
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 500,
        }),
      );

      await expect(api.getMe()).rejects.toThrow("Authentication required");
    });
  });

  // -----------------------------------------------------------------------
  // getScenarios (authenticated)
  // -----------------------------------------------------------------------

  describe("getScenarios", () => {
    it("adds Bearer header and unwraps { scenarios }", async () => {
      setStoredTokens();
      const scenarios = [
        { id: "audi-a3-idle", name: "Audi A3", vehicleType: "car" },
      ];
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scenarios }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.getScenarios();

      expect(result).toEqual(scenarios);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/scenarios");
      expect(init.headers).toMatchObject({
        Authorization: "Bearer access-abc",
      });
    });

    it("omits the Authorization header when no tokens are stored", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scenarios: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await api.getScenarios();

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.headers).not.toHaveProperty("Authorization");
      expect(init.headers).toMatchObject({
        "Content-Type": "application/json",
      });
    });

    it("does not attempt a refresh when a 401 arrives without tokens", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(api.getScenarios()).rejects.toThrow(GENERIC_ERROR_MESSAGE);
      // Only the original call happened — no refresh was attempted
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("shares a single refresh across concurrent 401s", async () => {
      setStoredTokens();
      const scenarios = [
        { id: "audi-a3-idle", name: "Audi A3", vehicleType: "car" },
      ];
      const mockFetch = vi
        .fn()
        // Both calls return 401
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: false, status: 401 })
        // One shared refresh call
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            accessToken: "new-access",
            refreshToken: "new-refresh",
          }),
        })
        // Both retries succeed
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenarios }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ scenarios }) });
      vi.stubGlobal("fetch", mockFetch);

      const [first, second] = await Promise.all([
        api.getScenarios(),
        api.getScenarios(),
      ]);

      expect(first).toEqual(scenarios);
      expect(second).toEqual(scenarios);
      // 2 original calls + 1 refresh + 2 retries — no duplicate refresh
      expect(mockFetch).toHaveBeenCalledTimes(5);
      expect(localStorage.getItem("iad.accessToken")).toBe("new-access");
    });

    it("refreshes token on 401 and retries", async () => {
      setStoredTokens();
      const scenarios = [
        { id: "kawa-z900", name: "Kawasaki Z900", vehicleType: "motorcycle" },
      ];
      const mockFetch = vi
        .fn()
        // First call: 401
        .mockResolvedValueOnce({ ok: false, status: 401 })
        // Refresh call
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            accessToken: "new-access",
            refreshToken: "new-refresh",
          }),
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
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Invalid refresh token" }),
        });
      vi.stubGlobal("fetch", mockFetch);

      await expect(api.getScenarios()).rejects.toThrow(
        "Authentication required",
      );
      expect(localStorage.getItem("iad.accessToken")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // refreshAccessToken (exercised through apiFetch)
  // -----------------------------------------------------------------------

  describe("refreshAccessToken", () => {
    it("throws AuthError and clears tokens when no refresh token is stored", async () => {
      setStoredTokens();
      // The first call returns 401 and simulates tokens disappearing before
      // refreshAccessToken re-reads storage
      const mockFetch = vi.fn().mockImplementation(async () => {
        localStorage.clear();
        return { ok: false, status: 401 };
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(api.getScenarios()).rejects.toThrow(
        "Authentication required",
      );
      expect(localStorage.getItem("iad.accessToken")).toBeNull();
      expect(localStorage.getItem("iad.refreshToken")).toBeNull();
    });

    it("throws AuthError and clears tokens when the refresh fetch fails", async () => {
      setStoredTokens();
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockRejectedValueOnce(new TypeError("Network request failed"));
      vi.stubGlobal("fetch", mockFetch);

      await expect(api.getScenarios()).rejects.toThrow(
        "Authentication required",
      );
      expect(localStorage.getItem("iad.accessToken")).toBeNull();
      expect(localStorage.getItem("iad.refreshToken")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // apiFetch — raw error propagation
  // -----------------------------------------------------------------------

  describe("apiFetch error handling", () => {
    it("wraps non-abort network errors into the generic message", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("Network request failed")),
      );

      await expect(apiFetch("/api/scenarios")).rejects.toThrow(
        GENERIC_ERROR_MESSAGE,
      );
    });

    it("treats TimeoutError as an abort and throws the timeout message", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue({ name: "TimeoutError" }),
      );

      await expect(apiFetch("/api/scenarios")).rejects.toThrow(
        "La petición tardó demasiado",
      );
    });

    it("wraps non-abort rejections that are not Error instances into the generic message", async () => {
      // Plain object without a `name` property
      vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce({}));
      await expect(apiFetch("/api/scenarios")).rejects.toThrow(
        GENERIC_ERROR_MESSAGE,
      );

      // null
      vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(null));
      await expect(apiFetch("/api/scenarios")).rejects.toThrow(
        GENERIC_ERROR_MESSAGE,
      );

      // string
      vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce("boom"));
      await expect(apiFetch("/api/scenarios")).rejects.toThrow(
        GENERIC_ERROR_MESSAGE,
      );
    });
  });

  // -----------------------------------------------------------------------
  // runDiagnosis
  // -----------------------------------------------------------------------

  describe("runDiagnosis", () => {
    it("posts scenarioId and returns DiagnosisResponse", async () => {
      setStoredTokens();
      const diagnosis = {
        rawData: '{"rpm":750}',
        parsedValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
        dtcCodes: [{ code: "P0301", description: "Misfire" }],
        diagnosisText: "[HIGH] P0301",
        severity: "high",
      };
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => diagnosis });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.runDiagnosis("audi-a3-idle");

      expect(result).toEqual(diagnosis);
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        scenarioId: "audi-a3-idle",
      });
    });

    it("throws the generic message on a 500, never the raw server error", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: "OBD timeout" }),
        }),
      );

      await expect(api.runDiagnosis("audi-a3-idle")).rejects.toThrow(
        GENERIC_ERROR_MESSAGE,
      );
    });
  });

  // -----------------------------------------------------------------------
  // getCognitiveDiagnosis
  // -----------------------------------------------------------------------

  describe("getCognitiveDiagnosis", () => {
    const cognitive = {
      diagnosis: "Misfire in cylinder 1",
      severity: "high",
      confidence: 0.92,
      recommendations: ["Replace spark plug"],
      toolCalls: [],
    };

    it("posts scenarioId and query and returns the cognitive output", async () => {
      setStoredTokens();
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => cognitive });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.getCognitiveDiagnosis(
        "audi-a3-idle",
        "que falla?",
      );

      expect(result).toEqual(cognitive);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/mcp/cognitive-diagnosis");
      expect(JSON.parse(init.body as string)).toEqual({
        scenarioId: "audi-a3-idle",
        query: "que falla?",
      });
    });

    it("sends conversation history when provided", async () => {
      setStoredTokens();
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => cognitive });
      vi.stubGlobal("fetch", mockFetch);

      const historyItem = {
        __type: "user_message" as const,
        content: "¿Por qué tiembla?",
      };
      await api.getCognitiveDiagnosis("audi-a3-idle", "¿Y eso por qué?", [
        historyItem,
      ]);

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        scenarioId: "audi-a3-idle",
        query: "¿Y eso por qué?",
        history: [historyItem],
      });
    });

    it("throws the generic message on a 503, never the raw server error", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({ error: "LLM unavailable" }),
        }),
      );

      await expect(api.getCognitiveDiagnosis("audi-a3-idle")).rejects.toThrow(
        GENERIC_ERROR_MESSAGE,
      );
    });

    it("throws the generic message on a 503 even when the error body is unreadable", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => {
            throw new Error("unparseable body");
          },
        }),
      );

      await expect(api.getCognitiveDiagnosis("audi-a3-idle")).rejects.toThrow(
        GENERIC_ERROR_MESSAGE,
      );
    });
  });

  // -----------------------------------------------------------------------
  // getFreezeFrame
  // -----------------------------------------------------------------------

  describe("getFreezeFrame", () => {
    it("GETs /api/freeze-frame with scenarioId and dtc and returns the frame", async () => {
      setStoredTokens();
      const frame = { dtcCode: "P0301", pidValues: { "0C": 850 } };
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ freezeFrame: frame }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.getFreezeFrame("audi-a3-idle", "P0301");

      expect(result).toEqual(frame);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/freeze-frame?scenarioId=audi-a3-idle&dtc=P0301");
      expect(init.headers).toMatchObject({
        Authorization: "Bearer access-abc",
      });
    });

    it("GETs without the dtc param when omitted", async () => {
      setStoredTokens();
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ freezeFrame: null }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.getFreezeFrame("audi-a3-idle");

      expect(result).toBeNull();
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe("/api/freeze-frame?scenarioId=audi-a3-idle");
    });

    it("returns null when the backend reports no freeze frame for the code", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ freezeFrame: null }),
        }),
      );

      const result = await api.getFreezeFrame("audi-a3-idle", "P0420");

      expect(result).toBeNull();
    });

    it("throws the generic message on a 500, never the raw server error", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: "OBD exploded" }),
        }),
      );

      await expect(api.getFreezeFrame("audi-a3-idle", "P0301")).rejects.toThrow(
        GENERIC_ERROR_MESSAGE,
      );
    });
  });

  // -----------------------------------------------------------------------
  // getEcuInfo
  // -----------------------------------------------------------------------

  describe("getEcuInfo", () => {
    it("GETs /api/ecu-info with scenarioId and returns the ECU list", async () => {
      setStoredTokens();
      const ecus = [
        {
          id: 1,
          vehicleId: 1,
          name: "Engine Control Module",
          requestAddr: "7E0",
          responseAddr: "7E8",
          type: "engine",
          protocol: "ISO 15765-4",
        },
      ];
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ecus }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.getEcuInfo("audi-a3-idle");

      expect(result).toEqual(ecus);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/ecu-info?scenarioId=audi-a3-idle");
      expect(init.headers).toMatchObject({
        Authorization: "Bearer access-abc",
      });
    });

    it("returns an empty list when the vehicle reports no ECUs", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ecus: [] }),
        }),
      );

      const result = await api.getEcuInfo("audi-a3-idle");

      expect(result).toEqual([]);
    });

    it("encodes the scenarioId in the query string", async () => {
      setStoredTokens();
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ecus: [] }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await api.getEcuInfo("audi a3/idle&x");

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe("/api/ecu-info?scenarioId=audi%20a3%2Fidle%26x");
    });

    it("throws the generic message on a 500, never the raw server error", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: async () => ({ error: "CAN bus exploded" }),
        }),
      );

      await expect(api.getEcuInfo("audi-a3-idle")).rejects.toThrow(
        GENERIC_ERROR_MESSAGE,
      );
    });
  });

  // -----------------------------------------------------------------------
  // getVehicleInfo
  // -----------------------------------------------------------------------

  describe("getVehicleInfo", () => {
    const vehicle = {
      vin: "WAUZZZ8V5JA123456",
      make: "Audi",
      model: "A3",
      year: 2018,
      engineType: "2.0 TFSI",
      manufacturer: "Audi",
      region: { country: "Germany", region: "Europe" },
      modelYearDecoded: 2018,
    };

    it("GETs /api/vehicle-info with the scenarioId and returns the vehicle", async () => {
      setStoredTokens();
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => vehicle,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await api.getVehicleInfo("audi-a3-idle");

      expect(result).toEqual(vehicle);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/vehicle-info?scenarioId=audi-a3-idle");
      expect(init.headers).toMatchObject({
        Authorization: "Bearer access-abc",
      });
    });

    it("encodes the scenarioId in the query string", async () => {
      setStoredTokens();
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => vehicle,
      });
      vi.stubGlobal("fetch", mockFetch);

      await api.getVehicleInfo("audi a3/idle&x");

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe("/api/vehicle-info?scenarioId=audi%20a3%2Fidle%26x");
    });

    it("throws the curated message when the scenario does not exist", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({ error: "Scenario not found" }),
        }),
      );

      await expect(api.getVehicleInfo("no-existe")).rejects.toThrow(
        "Scenario not found",
      );
    });
  });

  // -----------------------------------------------------------------------
  // getCapabilities
  // -----------------------------------------------------------------------

  describe("getCapabilities", () => {
    it("returns capability flags on success", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ cognitiveDiagnosis: true }),
        }),
      );

      await expect(api.getCapabilities()).resolves.toEqual({
        cognitiveDiagnosis: true,
      });
    });

    it("returns disabled flags when the endpoint responds with an error", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }),
      );

      await expect(api.getCapabilities()).resolves.toEqual({
        cognitiveDiagnosis: false,
      });
    });

    it("returns disabled flags when the request fails", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("offline")),
      );

      await expect(api.getCapabilities()).resolves.toEqual({
        cognitiveDiagnosis: false,
      });
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
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({ ok: true, json: async () => MOCK_TOKENS }),
      );
      await api.login({ email: "a@b.com", password: "s" });
      expect(api.hasTokens()).toBe(true);
    });

    it("logout revokes the refresh token server-side and clears local tokens", async () => {
      setStoredTokens();
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await api.logout();

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/auth/logout");
      expect(init.method).toBe("POST");
      expect(init.headers).toMatchObject({
        "Content-Type": "application/json",
      });
      expect(JSON.parse(init.body as string)).toEqual({
        refreshToken: MOCK_TOKENS.refreshToken,
      });
      expect(localStorage.getItem("iad.accessToken")).toBeNull();
      expect(localStorage.getItem("iad.refreshToken")).toBeNull();
    });

    it("logout is best-effort: clears local tokens even when the network fails", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("network down")),
      );

      await expect(api.logout()).resolves.toBeUndefined();

      expect(localStorage.getItem("iad.accessToken")).toBeNull();
      expect(localStorage.getItem("iad.refreshToken")).toBeNull();
    });

    it("logout clears local tokens even when the server rejects the request", async () => {
      setStoredTokens();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({ ok: false, status: 500 }),
      );

      await expect(api.logout()).resolves.toBeUndefined();

      expect(localStorage.getItem("iad.accessToken")).toBeNull();
      expect(localStorage.getItem("iad.refreshToken")).toBeNull();
    });

    it("logout does not call the server when no tokens are stored", async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal("fetch", mockFetch);

      await api.logout();

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("hasTokens returns false when only one token is stored", () => {
      localStorage.setItem("iad.accessToken", "only-access");
      expect(api.hasTokens()).toBe(false);
    });

    it("hasTokens returns false without crashing when storage access throws", () => {
      // Stub the whole localStorage global — spyOn on the jsdom instance does
      // not intercept the calls made by the module under test
      vi.stubGlobal("localStorage", {
        getItem: () => {
          throw new Error("SecurityError: storage is disabled");
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      });

      try {
        expect(api.hasTokens()).toBe(false);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  // -----------------------------------------------------------------------
  // admin
  // -----------------------------------------------------------------------

  describe("admin", () => {
    const overview: Record<string, unknown> = {
      userStats: { byUserType: { individual: 3, workshop: 1 }, byRole: { user: 3, admin: 1 } },
      recentErrorCount: 5,
      httpRequestsByPathApprox: { "/api/scenarios": 42, "/api/diagnosis": 15 },
    };

    const logs: Record<string, unknown>[] = [
      { id: 1, level: "error", message: "DB timeout", context: null, createdAt: "2026-01-01" },
    ];

    const auditLogs: Record<string, unknown>[] = [
      { id: 1, method: "POST", path: "/api/diagnosis", statusCode: 200, ip: null, userAgent: null, durationMs: 45, userId: 1, createdAt: "2026-01-01" },
    ];

    const users: Record<string, unknown>[] = [
      { id: 1, username: "admin", email: "a@b.com", userType: "individual", role: "admin", businessName: null, taxId: null, address: null, createdAt: "2026-01-01", failedLoginAttempts: 0, lockedUntil: null, isWorkshop: false, isAdmin: true },
    ];

    const knowledgeStats: Record<string, unknown> = {
      pids: { count: 120, sample: [] },
      dtcs: { count: 80, sample: [] },
      diagnoses: { count: 45, sample: [] },
    };

    const knowledgeSearchResponse: Record<string, unknown> = {
      results: [{ entry: { code: "P0301" }, distance: 0.12 }],
    };

    // -------------------------------------------------------------------
    // overview
    // -------------------------------------------------------------------

    describe("overview", () => {
      it("GETs /api/admin/overview and returns AdminOverview", async () => {
        setStoredTokens();
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => overview,
        });
        vi.stubGlobal("fetch", mockFetch);

        const result = await api.admin.overview();

        expect(result).toEqual(overview);
        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/admin/overview");
        expect(init.method).toBeUndefined();
        expect(init.headers).toMatchObject({ Authorization: "Bearer access-abc" });
      });

      it("throws the generic message on a 500", async () => {
        setStoredTokens();
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) }));
        await expect(api.admin.overview()).rejects.toThrow(GENERIC_ERROR_MESSAGE);
      });
    });

    // -------------------------------------------------------------------
    // logs
    // -------------------------------------------------------------------

    describe("logs", () => {
      it("GETs /api/admin/logs with query params and returns Paginated<AdminLog>", async () => {
        setStoredTokens();
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: logs, total: 1 }),
        });
        vi.stubGlobal("fetch", mockFetch);

        const result = await api.admin.logs({ level: "error", page: 1, pageSize: 10 });

        expect(result).toEqual({ items: logs, total: 1 });
        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/admin/logs?level=error&page=1&pageSize=10");
        expect(init.method).toBeUndefined();
      });

      it("omits undefined filter values from query params", async () => {
        setStoredTokens();
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: logs, total: 1 }),
        });
        vi.stubGlobal("fetch", mockFetch);

        await api.admin.logs({});

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toBe("/api/admin/logs");
      });

      it("encodes filter values properly", async () => {
        setStoredTokens();
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0 }),
        });
        vi.stubGlobal("fetch", mockFetch);

        await api.admin.logs({ q: "error & timeout", from: "2026-01-01T00:00:00Z" });

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain("q=error+%26+timeout");
      });
    });

    // -------------------------------------------------------------------
    // auditLogs
    // -------------------------------------------------------------------

    describe("auditLogs", () => {
      it("GETs /api/admin/audit-logs with filter params", async () => {
        setStoredTokens();
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: auditLogs, total: 1 }),
        });
        vi.stubGlobal("fetch", mockFetch);

        const result = await api.admin.auditLogs({ statusCode: 200, path: "/api/diagnosis" });

        expect(result).toEqual({ items: auditLogs, total: 1 });
        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toContain("statusCode=200");
        expect(url).toContain("path=%2Fapi%2Fdiagnosis");
      });

      it("omits undefined filter values", async () => {
        setStoredTokens();
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0 }),
        });
        vi.stubGlobal("fetch", mockFetch);

        await api.admin.auditLogs({});

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toBe("/api/admin/audit-logs");
      });
    });

    // -------------------------------------------------------------------
    // users
    // -------------------------------------------------------------------

    describe("users", () => {
      it("GETs /api/admin/users with filter params", async () => {
        setStoredTokens();
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: users, total: 1 }),
        });
        vi.stubGlobal("fetch", mockFetch);

        const result = await api.admin.users({ q: "admin", page: 1, pageSize: 20 });

        expect(result).toEqual({ items: users, total: 1 });
        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toBe("/api/admin/users?q=admin&page=1&pageSize=20");
      });

      it("omits undefined filter values", async () => {
        setStoredTokens();
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => ({ items: [], total: 0 }),
        });
        vi.stubGlobal("fetch", mockFetch);

        await api.admin.users({});

        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toBe("/api/admin/users");
      });
    });

    // -------------------------------------------------------------------
    // knowledgeStats
    // -------------------------------------------------------------------

    describe("knowledgeStats", () => {
      it("GETs /api/admin/knowledge and returns AdminKnowledgeStats", async () => {
        setStoredTokens();
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => knowledgeStats,
        });
        vi.stubGlobal("fetch", mockFetch);

        const result = await api.admin.knowledgeStats();

        expect(result).toEqual(knowledgeStats);
        const [url] = mockFetch.mock.calls[0] as [string];
        expect(url).toBe("/api/admin/knowledge");
      });
    });

    // -------------------------------------------------------------------
    // knowledgeSearch
    // -------------------------------------------------------------------

    describe("knowledgeSearch", () => {
      it("POSTs /api/admin/knowledge/search and returns KnowledgeSearchResponse", async () => {
        setStoredTokens();
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => knowledgeSearchResponse,
        });
        vi.stubGlobal("fetch", mockFetch);

        const result = await api.admin.knowledgeSearch({ text: "P0301", index: "dtcs" });

        expect(result).toEqual(knowledgeSearchResponse);
        const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/admin/knowledge/search");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({ text: "P0301", index: "dtcs" });
      });

      it("includes optional limit when provided", async () => {
        setStoredTokens();
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          json: async () => knowledgeSearchResponse,
        });
        vi.stubGlobal("fetch", mockFetch);

        await api.admin.knowledgeSearch({ text: "P0301", index: "dtcs", limit: 5 });

        const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(JSON.parse(init.body as string)).toEqual({ text: "P0301", index: "dtcs", limit: 5 });
      });
    });
  });

  // -----------------------------------------------------------------------
  // timeout
  // -----------------------------------------------------------------------

  describe("timeout", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("rejects with a timeout error and keeps tokens when the request hangs", async () => {
      setStoredTokens();
      vi.useFakeTimers();

      // Mock AbortSignal.timeout so the 10s timer is controllable.
      const controller = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
      // fetch never resolves — it only rejects when the signal aborts.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(
          (_url: string, init: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init.signal?.addEventListener("abort", () => {
                reject(
                  new DOMException("The operation was aborted.", "AbortError"),
                );
              });
            }),
        ),
      );

      const promise = api.getMe();
      // Simulate 10s elapsing and the timeout signal firing.
      await vi.advanceTimersByTimeAsync(10_000);
      controller.abort();

      await expect(promise).rejects.toThrow("La petición tardó demasiado");
      // A timeout is not an auth error — tokens must NOT be cleared.
      expect(localStorage.getItem("iad.accessToken")).toBe("access-abc");
      expect(localStorage.getItem("iad.refreshToken")).toBe("refresh-xyz");
    });

    it("resolves normally when fetch completes before the timeout", async () => {
      setStoredTokens();
      vi.spyOn(AbortSignal, "timeout");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => MOCK_USER,
        }),
      );

      const user = await api.getMe();

      expect(user).toEqual(MOCK_USER);
    });

    it("respects a caller-provided signal instead of creating a new one", async () => {
      setStoredTokens();
      const controller = new AbortController();
      const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => MOCK_USER,
      });
      vi.stubGlobal("fetch", mockFetch);

      const res = await apiFetch("/api/auth/me", {
        signal: controller.signal,
      });

      expect(res.ok).toBe(true);
      expect(timeoutSpy).not.toHaveBeenCalled();
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBe(controller.signal);
    });

    it("getCognitiveDiagnosis uses a 60s timeout", async () => {
      setStoredTokens();
      const timeoutSpy = vi
        .spyOn(AbortSignal, "timeout")
        .mockReturnValue(new AbortController().signal);
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            diagnosis: "ok",
            severity: "low",
            confidence: 0.9,
            recommendations: [],
            toolCalls: [],
          }),
        }),
      );

      await api.getCognitiveDiagnosis("scenario-1", "why?");

      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(timeoutSpy).toHaveBeenCalledWith(60_000);
    });
  });

  // -----------------------------------------------------------------------
  // assertOk — shared response error handling
  // -----------------------------------------------------------------------

  describe("assertOk", () => {
    it("resolves without throwing when the response is ok", async () => {
      const res = new Response(JSON.stringify({}), { status: 200 });

      await expect(assertOk(res, "Fallback")).resolves.toBeUndefined();
    });

    it("throws the server error message when body.error is a string", async () => {
      const res = new Response(
        JSON.stringify({ error: "Invalid credentials" }),
        {
          status: 401,
        },
      );

      await expect(assertOk(res, "Login failed (401)")).rejects.toThrow(
        "Invalid credentials",
      );
    });

    it("throws joined detail messages when body.details is an array", async () => {
      const res = new Response(
        JSON.stringify({
          error: "Validation failed",
          details: [
            { message: "Email is invalid" },
            { message: "Password too short" },
          ],
        }),
        { status: 400 },
      );

      await expect(assertOk(res, "Register failed (400)")).rejects.toThrow(
        "Email is invalid, Password too short",
      );
    });

    it("uses body.details as-is when it is a string", async () => {
      const res = new Response(
        JSON.stringify({ details: "Password too short" }),
        {
          status: 400,
        },
      );

      await expect(assertOk(res, "Register failed (400)")).rejects.toThrow(
        "Password too short",
      );
    });

    it("filters out non-string detail messages", async () => {
      const res = new Response(
        JSON.stringify({
          details: [
            { message: "Email is invalid" },
            { message: 42 },
            { message: undefined },
          ],
        }),
        { status: 400 },
      );

      await expect(assertOk(res, "Register failed (400)")).rejects.toThrow(
        "Email is invalid",
      );
    });

    it("throws the generic message when the body is not parseable on a 5xx", async () => {
      const res = new Response("not json", { status: 500 });

      await expect(assertOk(res, "Diagnosis failed (500)")).rejects.toThrow(
        GENERIC_ERROR_MESSAGE,
      );
    });

    it("throws the generic message on any 5xx, ignoring the fallback and body.error", async () => {
      const res = new Response(
        JSON.stringify({ error: "Database connection refused at 10.0.0.5" }),
        { status: 502 },
      );

      await expect(assertOk(res, "Diagnosis failed (502)")).rejects.toThrow(
        GENERIC_ERROR_MESSAGE,
      );
    });

    it("still surfaces the curated server message for 4xx responses", async () => {
      const res = new Response(
        JSON.stringify({ error: "Email already registered" }),
        { status: 409 },
      );

      await expect(assertOk(res, "Register failed (409)")).rejects.toThrow(
        "Email already registered",
      );
    });
  });
});
