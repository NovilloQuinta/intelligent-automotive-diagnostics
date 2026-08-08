import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useCognitiveDiagnosis } from "../../../src/components/dashboard/useCognitiveDiagnosis";
import type { CognitiveOutput, ConversationItem } from "../../../src/lib/api";

vi.mock("../../../src/lib/api", () => ({
  api: {
    getCognitiveDiagnosis: vi.fn(),
  },
}));

import { api } from "../../../src/lib/api";

function cognitiveOutput(): CognitiveOutput {
  return {
    diagnosis: "Narrativa",
    severity: "low",
    confidence: 0.8,
    recommendations: ["Revisar bujías"],
    toolCalls: [],
    pidObservations: [
      {
        code: "01 42",
        name: "Voltaje del módulo de control",
        unit: "V",
        value: 10.9,
        status: "review",
      },
    ],
  };
}

describe("useCognitiveDiagnosis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps the returned observations to AI rows", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"));

    await act(async () => {
      await result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.pidRows).toEqual([
        {
          code: "01 42",
          description: "Voltaje del módulo de control",
          value: "10.9 V",
          status: "review",
          source: "ai",
        },
      ]);
    });
    expect(api.getCognitiveDiagnosis).toHaveBeenCalledWith(
      "kawa-z900",
      undefined,
      undefined,
    );
    expect(result.current.loading).toBe(false);
  });

  it("sets loading while the cognitive call is in flight", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockImplementation(
      () => new Promise(() => {}),
    );

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"));

    act(() => {
      void result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    expect(result.current.pidRows).toBeNull();
  });

  it("swallows errors and leaves pidRows empty", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"));

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.pidRows).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("reset clears the rows and the loading flag", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"));

    await act(async () => {
      await result.current.trigger();
    });
    expect(result.current.pidRows).toHaveLength(1);

    act(() => {
      result.current.reset();
    });

    expect(result.current.pidRows).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("does not call the API when there is no selected scenario", async () => {
    const { result } = renderHook(() => useCognitiveDiagnosis(""));

    await act(async () => {
      await result.current.trigger();
    });

    expect(api.getCognitiveDiagnosis).not.toHaveBeenCalled();
    expect(result.current.pidRows).toBeNull();
  });

  it("stores the diagnosis text from the cognitive response", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"));

    await act(async () => {
      await result.current.trigger("¿Por qué tiembla?");
    });

    expect(result.current.diagnosisText).toBe("Narrativa");
    expect(result.current.severity).toBe("low");
    expect(result.current.confidence).toBe(0.8);
    expect(result.current.recommendations).toEqual(["Revisar bujías"]);
  });

  it("accumulates conversation history across triggers", async () => {
    vi.mocked(api.getCognitiveDiagnosis)
      .mockResolvedValueOnce(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"));

    await act(async () => {
      await result.current.trigger("¿Por qué tiembla?");
    });

    expect(result.current.conversationHistory).toHaveLength(2);
    expect(result.current.conversationHistory[0]).toEqual({
      __type: "user_message",
      content: "¿Por qué tiembla?",
    });
    expect(result.current.conversationHistory[1]).toEqual({
      __type: "raw_response",
      data: { text: "Narrativa" },
    });
  });

  it("updates conversationHistory on next trigger keeping prior context", async () => {
    vi.mocked(api.getCognitiveDiagnosis)
      .mockResolvedValueOnce(cognitiveOutput())
      .mockResolvedValueOnce({
        ...cognitiveOutput(),
        diagnosis: "Segunda respuesta",
      });

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"));

    await act(async () => {
      await result.current.trigger("¿Por qué tiembla?");
    });

    const firstHistory = result.current.conversationHistory;

    await act(async () => {
      await result.current.trigger("¿Y eso por qué?");
    });

    expect(result.current.conversationHistory).toHaveLength(4);
    expect(result.current.conversationHistory[0]).toEqual(firstHistory[0]);
    expect(result.current.conversationHistory[1]).toEqual(firstHistory[1]);
    expect(result.current.conversationHistory[2]).toEqual({
      __type: "user_message",
      content: "¿Y eso por qué?",
    });
    expect(result.current.conversationHistory[3]).toEqual({
      __type: "raw_response",
      data: { text: "Segunda respuesta" },
    });
    expect(result.current.conversationHistory).toHaveLength(4);
  });
});
