import { describe, expect, it } from "vitest";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { severityMeta } from "../../../src/components/dashboard/severityMeta";
import { COLORS } from "../../../src/components/dashboard/types";

describe("severityMeta", () => {
  it("maps critical severity", () => {
    const meta = severityMeta("critical");

    expect(meta.label).toBe("CRÍTICO");
    expect(meta.color).toBe(COLORS.destructive);
    expect(meta.bg).toBe("rgba(255,51,51,0.10)");
    expect(meta.border).toBe("rgba(255,51,51,0.35)");
    expect(meta.icon).toBe(ShieldAlert);
  });

  it("maps high severity", () => {
    const meta = severityMeta("high");

    expect(meta.label).toBe("ALTA");
    expect(meta.color).toBe(COLORS.destructive);
    expect(meta.bg).toBe("rgba(255,51,51,0.08)");
    expect(meta.border).toBe("rgba(255,51,51,0.3)");
    expect(meta.icon).toBe(AlertTriangle);
  });

  it("maps medium severity", () => {
    const meta = severityMeta("medium");

    expect(meta.label).toBe("MEDIA");
    expect(meta.color).toBe(COLORS.warning);
    expect(meta.bg).toBe("rgba(245,179,1,0.08)");
    expect(meta.border).toBe("rgba(245,179,1,0.3)");
    expect(meta.icon).toBe(AlertTriangle);
  });

  it("maps low severity via the default branch", () => {
    const meta = severityMeta("low");

    expect(meta.label).toBe("BAJA");
    expect(meta.color).toBe(COLORS.accent);
    expect(meta.bg).toBe("rgba(0,212,170,0.08)");
    expect(meta.border).toBe("rgba(0,212,170,0.3)");
    expect(meta.icon).toBe(CheckCircle2);
  });
});
