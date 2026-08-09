import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { RpmGauge } from "../../../src/components/dashboard/RpmGauge";
import { GAUGE } from "../../../src/components/dashboard/types";

// Stub the animation driver so useAnimatedNumber never fires frames and the
// displayed value stays at the initial target (deterministic assertions).
beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn());
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RpmGauge", () => {
  // The gauge is the SVG with viewBox 0 0 200 120 (lucide icons have their own SVG)
  function gaugeSvg(container: HTMLElement): SVGSVGElement {
    return container.querySelector(
      'svg[viewBox="0 0 200 120"]',
    ) as SVGSVGElement;
  }

  it("should render the SVG arc, ticks and the rounded RPM value when a number is provided", () => {
    const { container } = render(<RpmGauge value={850} loading={false} />);

    expect(screen.getByText("RPM")).toBeDefined();
    expect(screen.getByText("850")).toBeDefined();
    expect(screen.getByText("rpm")).toBeDefined();
    // bgArc + dangerZone + progress arc
    expect(gaugeSvg(container).querySelectorAll("path")).toHaveLength(3);
    // 9 ticks + 1 needle
    expect(gaugeSvg(container).querySelectorAll("line")).toHaveLength(10);
  });

  it("should draw the progress arc with the small-arc flag when below 50%", () => {
    const { container } = render(<RpmGauge value={850} loading={false} />);

    const progressArc = gaugeSvg(container).querySelectorAll("path")[2];
    expect(progressArc.getAttribute("d")).toContain("A 78 78 0 0 1");
  });

  it("should render 0 and no progress arc when value is null", () => {
    const { container } = render(<RpmGauge value={null} loading={false} />);

    expect(screen.getByText("0")).toBeDefined();
    // Only bgArc + dangerZone are drawn when pct = 0
    expect(gaugeSvg(container).querySelectorAll("path")).toHaveLength(2);
  });

  it("should use the large-arc flag and danger styling when RPM exceeds the danger threshold", () => {
    const { container } = render(<RpmGauge value={7000} loading={false} />);

    expect(GAUGE.RPM_DANGER).toBe(6500);
    const progressArc = gaugeSvg(container).querySelectorAll("path")[2];
    expect(progressArc.getAttribute("d")).toContain("A 78 78 0 1 1");
    const valueSpan = container.querySelector("span.text-destructive");
    expect(valueSpan).not.toBeNull();
    expect(valueSpan?.textContent).toMatch(/7[\.,]?000/);
  });

  it("should not apply danger styling below the danger threshold", () => {
    const { container } = render(<RpmGauge value={850} loading={false} />);

    expect(container.querySelector("span.text-destructive")).toBeNull();
    expect(container.querySelector("span.text-foreground")).not.toBeNull();
  });

  it("should show the loading placeholder instead of the number", () => {
    render(<RpmGauge value={850} loading={true} />);

    expect(screen.getByText("----")).toBeDefined();
    expect(screen.queryByText("850")).toBeNull();
  });
});
