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
      />,
    );
    expect(screen.queryByText("No debería verse")).toBeNull();
  });

  it("shows diagnosis text and severity badge when available", () => {
    render(
      <MechanicChat
        {...defaultProps}
        diagnosisText="Fallo de encendido en cilindro 1"
        severity="high"
        confidence={0.92}
      />,
    );
    expect(screen.getByText("Fallo de encendido en cilindro 1")).toBeDefined();
    expect(screen.getByText("Alta")).toBeDefined();
    expect(screen.getByText("Confianza: 92%")).toBeDefined();
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

  it("does not call onSend for empty or whitespace-only query", () => {
    const onSend = vi.fn();
    render(<MechanicChat {...defaultProps} onSend={onSend} />);

    const input = screen.getByPlaceholderText("Pregunta al mecánico...");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByText("Enviar"));

    expect(onSend).not.toHaveBeenCalled();
  });
});
