import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MechanicChat } from "../../../src/components/dashboard/MechanicChat";

describe("MechanicChat", () => {
  const defaultProps = {
    diagnosisText: null,
    severity: null,
    confidence: null,
    recommendations: null,
    conversationHistory: [],
    loading: false,
    error: null,
    onSend: vi.fn(),
  };

  it("renders the title", () => {
    render(<MechanicChat {...defaultProps} />);
    expect(screen.getByText("Chat con el Mecánico")).toBeDefined();
  });

  it("has a text input and send button", () => {
    render(<MechanicChat {...defaultProps} />);
    expect(
      screen.getByPlaceholderText("Pregunta al mecánico..."),
    ).toBeDefined();
    expect(screen.getByText("Enviar")).toBeDefined();
  });

  it("calls onSend with the query text when send button is clicked", () => {
    const onSend = vi.fn();
    render(<MechanicChat {...defaultProps} onSend={onSend} />);

    const input = screen.getByPlaceholderText("Pregunta al mecánico...");
    fireEvent.change(input, { target: { value: "¿Por qué tiembla?" } });
    fireEvent.click(screen.getByText("Enviar"));

    expect(onSend).toHaveBeenCalledWith("¿Por qué tiembla?");
  });

  it("calls onSend on Enter key", () => {
    const onSend = vi.fn();
    render(<MechanicChat {...defaultProps} onSend={onSend} />);

    const input = screen.getByPlaceholderText("Pregunta al mecánico...");
    fireEvent.change(input, { target: { value: "problema" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSend).toHaveBeenCalledWith("problema");
  });

  it("disables the send button when input is empty", () => {
    render(<MechanicChat {...defaultProps} />);
    expect(screen.getByText("Enviar")).toBeDisabled();
  });

  it("disables input and button while loading", () => {
    render(<MechanicChat {...defaultProps} loading={true} />);
    expect(
      screen.getByPlaceholderText("Pregunta al mecánico..."),
    ).toBeDisabled();
    expect(screen.getByText("Enviar")).toBeDisabled();
  });

  it("does not show diagnosis text while loading", () => {
    render(
      <MechanicChat
        {...defaultProps}
        loading={true}
        diagnosisText="No debería verse"
        conversationHistory={[
          {
            __type: "raw_response",
            data: { text: "No debería verse" },
          },
        ]}
      />,
    );
    expect(screen.queryByText("No debería verse")).toBeNull();
  });

  it("shows the severity badge attached to the last assistant bubble, not as a separate block", () => {
    render(
      <MechanicChat
        {...defaultProps}
        diagnosisText="Fallo de encendido en cilindro 1"
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
    // El texto del diagnóstico aparece una única vez (no duplicado).
    expect(
      screen.getAllByText("Fallo de encendido en cilindro 1"),
    ).toHaveLength(1);
    expect(screen.getByText("Alta")).toBeDefined();
    expect(screen.getByText("Confianza: 92%")).toBeDefined();
  });

  it("does not attach the severity badge to an earlier assistant bubble", () => {
    render(
      <MechanicChat
        {...defaultProps}
        severity="high"
        confidence={0.92}
        conversationHistory={[
          {
            __type: "raw_response",
            data: { text: "Primera respuesta" },
          },
          { __type: "user_message", content: "otra pregunta" },
        ]}
      />,
    );
    // La última burbuja es del usuario, no del asistente: no hay badge que mostrar.
    expect(screen.queryByText("Alta")).toBeNull();
  });

  it("shows conversation history messages", () => {
    render(
      <MechanicChat
        {...defaultProps}
        conversationHistory={[
          { __type: "user_message", content: "¿Por qué tiembla?" },
          {
            __type: "raw_response",
            data: { text: "Es un fallo de encendido." },
          },
        ]}
      />,
    );
    expect(screen.getByText("¿Por qué tiembla?")).toBeDefined();
    expect(screen.getByText("Es un fallo de encendido.")).toBeDefined();
  });

  it("renders markdown formatting (bold, lists) in assistant bubbles", () => {
    render(
      <MechanicChat
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
      <MechanicChat
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
      <MechanicChat
        {...defaultProps}
        error={{ kind: "timeout", message: "La petición tardó demasiado" }}
      />,
    );
    expect(screen.getByText("La petición tardó demasiado")).toBeDefined();
  });

  it("does not show the error message while a new attempt is loading", () => {
    render(
      <MechanicChat
        {...defaultProps}
        loading={true}
        error={{ kind: "timeout", message: "La petición tardó demasiado" }}
      />,
    );
    expect(screen.queryByText("La petición tardó demasiado")).toBeNull();
  });

  it("shows no error message when error is null", () => {
    render(<MechanicChat {...defaultProps} error={null} />);
    expect(
      screen.queryByText("La petición tardó demasiado"),
    ).toBeNull();
  });

  it("does not couple the message thread container to its own scroll", () => {
    render(
      <MechanicChat
        {...defaultProps}
        conversationHistory={[
          { __type: "user_message", content: "¿Por qué tiembla?" },
        ]}
      />,
    );
    const thread = screen.getByText("¿Por qué tiembla?").parentElement;
    expect(thread?.className).not.toMatch(/max-h-80/);
    expect(thread?.className).not.toMatch(/overflow-y-auto/);
  });

  it("does not call onSend for empty or whitespace-only query", () => {
    const onSend = vi.fn();
    render(<MechanicChat {...defaultProps} onSend={onSend} />);

    const input = screen.getByPlaceholderText("Pregunta al mecánico...");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByText("Enviar"));

    expect(onSend).not.toHaveBeenCalled();
  });
});
