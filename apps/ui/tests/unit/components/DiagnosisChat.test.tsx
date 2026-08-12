import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiagnosisChat } from "../../../src/components/dashboard/DiagnosisChat";

describe("DiagnosisChat", () => {
  const defaultProps = {
    severity: null,
    confidence: null,
    conversationHistory: [],
    loading: false,
    error: null,
    onSend: vi.fn(),
    onLaunchDiagnosis: vi.fn(),
    canLaunch: true,
  };

  // -------------------------------------------------------------------------
  // Estado vacío
  // -------------------------------------------------------------------------

  it("shows the CTA and a context line in the empty state, without the input", () => {
    render(<DiagnosisChat {...defaultProps} />);

    expect(screen.getByText("Lanzar diagnóstico IA")).toBeDefined();
    expect(
      screen.getByText(
        "El asistente revisará DTCs, datos en vivo, freeze frames y ECUs del vehículo seleccionado.",
      ),
    ).toBeDefined();
    expect(screen.queryByPlaceholderText("Pregunta al mecánico...")).toBeNull();
  });

  it("does not show the CTA while loading", () => {
    render(<DiagnosisChat {...defaultProps} loading={true} />);

    expect(screen.queryByText("Lanzar diagnóstico IA")).toBeNull();
  });

  it("does not show the CTA once there is conversation history", () => {
    render(
      <DiagnosisChat
        {...defaultProps}
        conversationHistory={[
          { __type: "raw_response", data: { text: "Fallo de encendido." } },
        ]}
      />,
    );

    expect(screen.queryByText("Lanzar diagnóstico IA")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Estado generando
  // -------------------------------------------------------------------------

  it("shows a spinner and descriptive text while loading, with the input disabled", () => {
    render(<DiagnosisChat {...defaultProps} loading={true} />);

    expect(screen.getByText("Analizando datos OBD-II con IA…")).toBeDefined();
    expect(
      screen.getByPlaceholderText("Pregunta al mecánico..."),
    ).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // Estado diagnóstico
  // -------------------------------------------------------------------------

  it("shows the LLM output as the first message and enables the input", () => {
    render(
      <DiagnosisChat
        {...defaultProps}
        conversationHistory={[
          { __type: "raw_response", data: { text: "Fallo de encendido." } },
        ]}
      />,
    );

    expect(screen.getByText("Fallo de encendido.")).toBeDefined();
    expect(
      screen.getByPlaceholderText("Pregunta al mecánico..."),
    ).toBeEnabled();
  });

  // -------------------------------------------------------------------------
  // Gate del CTA
  // -------------------------------------------------------------------------

  it("disables the CTA when canLaunch is false", () => {
    render(<DiagnosisChat {...defaultProps} canLaunch={false} />);

    expect(
      screen.getByRole("button", { name: "Lanzar diagnóstico IA" }),
    ).toBeDisabled();
  });

  it("enables the CTA when canLaunch is true", () => {
    render(<DiagnosisChat {...defaultProps} canLaunch={true} />);

    expect(
      screen.getByRole("button", { name: "Lanzar diagnóstico IA" }),
    ).toBeEnabled();
  });

  it("calls onLaunchDiagnosis when the CTA is clicked", () => {
    const onLaunchDiagnosis = vi.fn();
    render(
      <DiagnosisChat {...defaultProps} onLaunchDiagnosis={onLaunchDiagnosis} />,
    );

    fireEvent.click(screen.getByText("Lanzar diagnóstico IA"));

    expect(onLaunchDiagnosis).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Comportamiento heredado (markdown, badge, error, follow-up)
  // -------------------------------------------------------------------------

  it("renders the title", () => {
    render(<DiagnosisChat {...defaultProps} />);
    expect(screen.getByText("Diagnóstico IA")).toBeDefined();
  });

  it("calls onSend with the query text when send button is clicked", () => {
    const onSend = vi.fn();
    render(
      <DiagnosisChat
        {...defaultProps}
        onSend={onSend}
        conversationHistory={[
          { __type: "raw_response", data: { text: "Fallo." } },
        ]}
      />,
    );

    const input = screen.getByPlaceholderText("Pregunta al mecánico...");
    fireEvent.change(input, { target: { value: "¿Por qué tiembla?" } });
    fireEvent.click(screen.getByText("Enviar"));

    expect(onSend).toHaveBeenCalledWith("¿Por qué tiembla?");
  });

  it("calls onSend on Enter key", () => {
    const onSend = vi.fn();
    render(
      <DiagnosisChat
        {...defaultProps}
        onSend={onSend}
        conversationHistory={[
          { __type: "raw_response", data: { text: "Fallo." } },
        ]}
      />,
    );

    const input = screen.getByPlaceholderText("Pregunta al mecánico...");
    fireEvent.change(input, { target: { value: "problema" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSend).toHaveBeenCalledWith("problema");
  });

  it("shows the severity badge attached to the last assistant bubble", () => {
    render(
      <DiagnosisChat
        {...defaultProps}
        severity="high"
        confidence={0.92}
        conversationHistory={[
          { __type: "user_message", content: "¿Qué le pasa?" },
          {
            __type: "raw_response",
            data: { text: "Fallo de encendido en cilindro 1" },
          },
        ]}
      />,
    );

    expect(
      screen.getAllByText("Fallo de encendido en cilindro 1"),
    ).toHaveLength(1);
    expect(screen.getByText("Alta")).toBeDefined();
    expect(screen.getByText("Confianza: 92%")).toBeDefined();
  });

  it("renders markdown formatting (bold, lists) in assistant bubbles", () => {
    render(
      <DiagnosisChat
        {...defaultProps}
        conversationHistory={[
          {
            __type: "raw_response",
            data: {
              text: "**Diagnóstico:**\n- Bujía defectuosa\n- Revisar bobina",
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("Diagnóstico:").tagName).toBe("STRONG");
    expect(screen.getByText("Bujía defectuosa").closest("li")).not.toBeNull();
    expect(screen.getByText("Revisar bobina").closest("li")).not.toBeNull();
  });

  it("renders user messages as plain text, not markdown", () => {
    render(
      <DiagnosisChat
        {...defaultProps}
        conversationHistory={[
          { __type: "user_message", content: "**no debería negritear**" },
        ]}
      />,
    );

    expect(screen.getByText("**no debería negritear**")).toBeDefined();
  });

  it("renders the error message visibly when error is not null", () => {
    render(
      <DiagnosisChat
        {...defaultProps}
        error={{ kind: "timeout", message: "La petición tardó demasiado" }}
      />,
    );

    expect(screen.getByText("La petición tardó demasiado")).toBeDefined();
  });

  it("does not show the error message while a new attempt is loading", () => {
    render(
      <DiagnosisChat
        {...defaultProps}
        loading={true}
        error={{ kind: "timeout", message: "La petición tardó demasiado" }}
      />,
    );

    expect(screen.queryByText("La petición tardó demasiado")).toBeNull();
  });

  it("does not call onSend for an empty or whitespace-only query", () => {
    const onSend = vi.fn();
    render(
      <DiagnosisChat
        {...defaultProps}
        onSend={onSend}
        conversationHistory={[
          { __type: "raw_response", data: { text: "Fallo." } },
        ]}
      />,
    );

    const input = screen.getByPlaceholderText("Pregunta al mecánico...");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByText("Enviar"));

    expect(onSend).not.toHaveBeenCalled();
  });
});
