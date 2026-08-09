import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  computeStrength,
  PASSWORD_REGEX,
  PasswordStrengthIndicator,
  PasswordStrengthMeter,
  PwdReq,
} from "../../../../src/components/auth/PasswordStrength";

describe("computeStrength", () => {
  it("returns 'none' for an empty password", () => {
    expect(computeStrength("")).toBe("none");
  });

  it("returns 'weak' for a short simple password", () => {
    expect(computeStrength("abc")).toBe("weak");
  });

  it("returns 'medium' for a password with some variety", () => {
    expect(computeStrength("abcdefgh1")).toBe("medium");
  });

  it("returns 'strong' for a long password with full variety", () => {
    expect(computeStrength("Abcdefgh123!@#")).toBe("strong");
  });
});

describe("PASSWORD_REGEX", () => {
  it("rejects a password missing complexity requirements", () => {
    expect(PASSWORD_REGEX.test("password123")).toBe(false);
  });

  it("accepts a password with uppercase, number and special char", () => {
    expect(PASSWORD_REGEX.test("Password123!")).toBe(true);
  });
});

describe("PasswordStrengthMeter", () => {
  it("renders no label for an empty password", () => {
    render(<PasswordStrengthMeter password="" />);
    expect(screen.queryByText("Débil")).toBeNull();
    expect(screen.queryByText("Segura")).toBeNull();
  });

  it("renders the strong label for a strong password", () => {
    render(<PasswordStrengthMeter password="Abcdefgh123!@#" />);
    expect(screen.getByText("Segura")).toBeDefined();
  });
});

describe("PwdReq", () => {
  it("renders the requirement text", () => {
    render(<PwdReq met={true} text="Mínimo 8 caracteres" />);
    expect(screen.getByText("Mínimo 8 caracteres")).toBeDefined();
  });
});

describe("PasswordStrengthIndicator", () => {
  it("renders nothing extra when password is empty", () => {
    render(<PasswordStrengthIndicator password="" />);
    expect(screen.queryByText("Al menos una mayúscula")).toBeNull();
  });

  it("renders the meter and requirement checklist when password is non-empty", () => {
    render(<PasswordStrengthIndicator password="Password123!" />);
    expect(screen.getByText("Al menos una mayúscula")).toBeDefined();
    expect(screen.getByText("Al menos una minúscula")).toBeDefined();
    expect(screen.getByText("Al menos un número")).toBeDefined();
    expect(screen.getByText("Al menos un carácter especial")).toBeDefined();
    expect(screen.getByText("Mínimo 8 caracteres")).toBeDefined();
  });
});
