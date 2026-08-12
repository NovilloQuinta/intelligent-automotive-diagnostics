import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, useState } from "react";
import { useCognitiveDiagnosis } from "../../../src/components/dashboard/useCognitiveDiagnosis";
import type { CognitiveOutput, ConversationItem } from "../../../src/lib/api";
import { ApiHttpError } from "../../../src/lib/api-errors";

vi.mock("../../../src/lib/api", () => ({
  api: {
    getCognitiveDiagnosis: vi.fn(),
  },
  GENERIC_ERROR_MESSAGE:
    "Ha ocurrido un problema. Si el problema persiste, contacta con soporte.",
}));

import { api } from "../../../src/lib/api";

/**
 * El QueryClient se crea una sola vez por montaje, no en cada render.
 * Con `new QueryClient()` en el cuerpo, cada re-render estrenaba cliente y la
 * cache escrita por la mutacion desaparecia: los asserts leian null de forma
 * intermitente segun el orden de los renders.
 */
function wrapper({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  );
  return createElement(QueryClientProvider, { client: qc }, children);
}

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
    vi.mocked(api.getCognitiveDiagnosis).mockRejectedValue(
      new Error("not called"),
    );
  });

  it("maps the returned observations to AI rows", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

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
      undefined,
    );
    expect(result.current.loading).toBe(false);
  });

  it("sets loading while the cognitive call is in flight", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockImplementation(
      () => new Promise(() => {}),
    );

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

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

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.pidRows).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("reset clears the rows and the loading flag", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });
    await waitFor(() => {
      expect(result.current.pidRows).toHaveLength(1);
    });

    act(() => {
      result.current.reset();
    });

    await waitFor(() => {
      expect(result.current.pidRows).toBeNull();
    });
    expect(result.current.loading).toBe(false);
  });

  it("does not call the API when there is no selected scenario", async () => {
    const { result } = renderHook(() => useCognitiveDiagnosis(""), { wrapper });

    await act(async () => {
      await result.current.trigger();
    });

    expect(api.getCognitiveDiagnosis).not.toHaveBeenCalled();
    expect(result.current.pidRows).toBeNull();
  });

  it("stores the diagnosis text from the cognitive response", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger("¿Por qué tiembla?");
    });

    await waitFor(() => {
      expect(result.current.diagnosisText).toBe("Narrativa");
    });
    expect(result.current.severity).toBe("low");
    expect(result.current.confidence).toBe(0.8);
    expect(result.current.recommendations).toEqual(["Revisar bujías"]);
  });

  it("accumulates conversation history across triggers", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValueOnce(
      cognitiveOutput(),
    );

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger("¿Por qué tiembla?");
    });

    await waitFor(() => {
      expect(result.current.conversationHistory).toHaveLength(2);
    });
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

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger("¿Por qué tiembla?");
    });

    await waitFor(() => {
      expect(result.current.conversationHistory).toHaveLength(2);
    });
    const firstHistory = result.current.conversationHistory;

    await act(async () => {
      await result.current.trigger("¿Y eso por qué?");
    });

    await waitFor(() => {
      expect(result.current.conversationHistory).toHaveLength(4);
    });
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

  it("clears pidRows when selectedId changes to a different vehicle", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result, rerender } = renderHook(
      ({ id }) => useCognitiveDiagnosis(id),
      { initialProps: { id: "kawa-z900" }, wrapper },
    );

    await act(async () => {
      await result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.pidRows).toHaveLength(1);
    });

    rerender({ id: "audi-a3" });

    await waitFor(() => {
      expect(result.current.pidRows).toBeNull();
    });
    expect(result.current.loading).toBe(false);
  });

  it("exposes error.kind 'timeout' and the message on a 504 rejection", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockRejectedValue(
      new ApiHttpError("La petición tardó demasiado", 504),
    );

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.error).toEqual({
        kind: "timeout",
        message: "La petición tardó demasiado",
      });
    });
  });

  it("exposes error.kind 'too_many_steps' on a 422 rejection", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockRejectedValue(
      new ApiHttpError(
        "El diagnóstico necesitó demasiados pasos. Prueba con una pregunta más concreta.",
        422,
      ),
    );

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.error?.kind).toBe("too_many_steps");
    });
    expect(result.current.error?.message).toBe(
      "El diagnóstico necesitó demasiados pasos. Prueba con una pregunta más concreta.",
    );
  });

  it("exposes error.kind 'unavailable' on a 404 rejection", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockRejectedValue(
      new ApiHttpError("No disponible", 404),
    );

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.error?.kind).toBe("unavailable");
    });
  });

  it("exposes error.kind 'unknown' with a non-empty message for a non-ApiHttpError rejection", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockRejectedValue(
      new Error("network exploded"),
    );

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.error?.kind).toBe("unknown");
    });
    expect(result.current.error?.message).toBeTruthy();
  });

  it("clears a previous error to null while a new trigger() is in flight", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockRejectedValueOnce(
      new ApiHttpError("La petición tardó demasiado", 504),
    );

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    let resolveSecond!: (v: CognitiveOutput) => void;
    vi.mocked(api.getCognitiveDiagnosis).mockImplementationOnce(
      () => new Promise((resolve) => (resolveSecond = resolve)),
    );

    act(() => {
      void result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });

    await act(async () => {
      resolveSecond(cognitiveOutput());
      await Promise.resolve();
    });
  });

  it("clears a previous error to null once the next trigger() resolves successfully", async () => {
    vi.mocked(api.getCognitiveDiagnosis)
      .mockRejectedValueOnce(new ApiHttpError("La petición tardó demasiado", 504))
      .mockResolvedValueOnce(cognitiveOutput());

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    await act(async () => {
      await result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });

  it("clears the conversation thread when the vehicle changes", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(cognitiveOutput());

    const { result, rerender } = renderHook(
      ({ id }) => useCognitiveDiagnosis(id),
      { initialProps: { id: "kawa-z900" }, wrapper },
    );

    await act(async () => {
      await result.current.trigger("¿Por qué tiembla?");
    });

    await waitFor(() => {
      expect(result.current.conversationHistory).toHaveLength(2);
    });

    rerender({ id: "audi-a3" });

    // Arrastrar el hilo del coche anterior haria que la IA respondiera sobre
    // un vehiculo que ya no esta en pantalla.
    await waitFor(() => {
      expect(result.current.conversationHistory).toHaveLength(0);
    });
    expect(result.current.diagnosisText).toBeNull();
  });

  it("stores the sessionId returned by the cognitive output", async () => {
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue({
      ...cognitiveOutput(),
      sessionId: 42,
    });

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.sessionId).toBe(42);
    });
  });

  it("resends the stored sessionId on a follow-up trigger", async () => {
    vi.mocked(api.getCognitiveDiagnosis)
      .mockResolvedValueOnce({ ...cognitiveOutput(), sessionId: 42 })
      .mockResolvedValueOnce({
        ...cognitiveOutput(),
        diagnosis: "Segunda respuesta",
        sessionId: 42,
      });

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });
    await waitFor(() => {
      expect(result.current.sessionId).toBe(42);
    });

    await act(async () => {
      await result.current.trigger("¿Y eso por qué?");
    });

    await waitFor(() => {
      expect(result.current.conversationHistory).toHaveLength(3);
    });
    expect(api.getCognitiveDiagnosis).toHaveBeenLastCalledWith(
      "kawa-z900",
      "¿Y eso por qué?",
      expect.any(Array),
      42,
    );
  });

  it("clears the sessionId and thread when trigger() has no query (new diagnosis)", async () => {
    vi.mocked(api.getCognitiveDiagnosis)
      .mockResolvedValueOnce({ ...cognitiveOutput(), sessionId: 42 })
      .mockResolvedValueOnce({ ...cognitiveOutput(), sessionId: 7 });

    const { result } = renderHook(() => useCognitiveDiagnosis("kawa-z900"), {
      wrapper,
    });

    await act(async () => {
      await result.current.trigger();
    });
    await waitFor(() => {
      expect(result.current.sessionId).toBe(42);
    });

    await act(async () => {
      await result.current.trigger();
    });

    await waitFor(() => {
      expect(result.current.sessionId).toBe(7);
    });
    // Una sesion nueva NO reenvia el sessionId anterior ni el hilo previo.
    expect(api.getCognitiveDiagnosis).toHaveBeenLastCalledWith(
      "kawa-z900",
      undefined,
      undefined,
      undefined,
    );
    expect(result.current.conversationHistory).toHaveLength(1);
    expect(result.current.conversationHistory[0]).toEqual({
      __type: "raw_response",
      data: { text: "Narrativa" },
    });
  });
});
