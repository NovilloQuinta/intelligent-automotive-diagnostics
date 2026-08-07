import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDiagnosis } from "../../../src/components/dashboard/useDiagnosis";

vi.mock("../../../src/lib/api", () => ({
  api: {
    runDiagnosis: vi.fn(),
  },
}));

import { api } from "../../../src/lib/api";

describe("useDiagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs diagnosis and returns result", async () => {
    const mockResult = {
      rawData: '{"rpm":750}',
      parsedValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
      dtcCodes: [],
      diagnosisText: "[LOW] No faults",
      severity: "low" as const,
    };
    vi.mocked(api.runDiagnosis).mockResolvedValueOnce(mockResult);

    const { result } = renderHook(() => useDiagnosis("audi-a3-idle"));

    await act(async () => {
      await result.current.runDiagnosis();
    });

    await waitFor(() => {
      expect(result.current.result).toEqual(mockResult);
    });
    expect(result.current.loading).toBe(false);
    expect(api.runDiagnosis).toHaveBeenCalledWith("audi-a3-idle");
  });

  it("does nothing when selectedId is empty", async () => {
    const { result } = renderHook(() => useDiagnosis(""));

    await act(async () => {
      await result.current.runDiagnosis();
    });

    expect(api.runDiagnosis).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
  });

  it("sets loading true during diagnosis", async () => {
    // Never resolves — loading stays true
    vi.mocked(api.runDiagnosis).mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useDiagnosis("audi-a3-idle"));

    act(() => {
      result.current.runDiagnosis();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
  });
});
