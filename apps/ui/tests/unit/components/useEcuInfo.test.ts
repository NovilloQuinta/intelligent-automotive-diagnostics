import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useEcuInfo } from "../../../src/components/dashboard/useEcuInfo";
import * as apiModule from "../../../src/lib/api";

vi.mock("../../../src/lib/api", () => ({
  api: {
    getEcuInfo: vi.fn(),
  },
}));

const mockApi = vi.mocked(apiModule.api);

describe("useEcuInfo", () => {
  it("should return empty array and not call api when no selectedId", () => {
    const { result } = renderHook(() => useEcuInfo(null));

    expect(result.current.ecus).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(mockApi.getEcuInfo).not.toHaveBeenCalled();
  });

  it("should call api.getEcuInfo and return ecus when selectedId is set", async () => {
    const sampleEcus = [
      {
        id: 0,
        vehicleId: 0,
        name: "Engine Control Unit",
        requestAddr: "7E0",
        responseAddr: "7E8",
        type: "ECM",
        protocol: "ISO 15765-4 (CAN 11/500)",
      },
    ];
    mockApi.getEcuInfo.mockResolvedValue(sampleEcus);

    const { result } = renderHook(() => useEcuInfo("audi-a3-idle"));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ecus).toEqual(sampleEcus);
    expect(result.current.error).toBeNull();
  });

  it("should set error when api fails", async () => {
    mockApi.getEcuInfo.mockRejectedValue(new Error("Not found"));

    const { result } = renderHook(() => useEcuInfo("audi-a3-idle"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Not found");
    expect(result.current.ecus).toEqual([]);
  });
});
