import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FreezeFramePanel } from "../../../src/components/dashboard/FreezeFramePanel";
import type { FreezeFrame } from "../../../src/components/dashboard/types";

const { mockUseFreezeFrame } = vi.hoisted(() => ({
  mockUseFreezeFrame: vi.fn(),
}));

vi.mock("../../../src/components/dashboard/useFreezeFrame", () => ({
  useFreezeFrame: mockUseFreezeFrame,
}));

const SAMPLE_FRAME: FreezeFrame = {
  dtcCode: "P0301",
  pidValues: { "0C": 850, "05": 90 },
};

describe("FreezeFramePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFreezeFrame.mockReturnValue({
      loading: false,
      frame: null,
      error: null,
    });
  });

  it("should render the empty-selection prompt when no dtc is selected", () => {
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc={null} />);

    expect(
      screen.getByText("Selecciona un código DTC para ver su freeze frame"),
    ).toBeDefined();
    expect(mockUseFreezeFrame).toHaveBeenCalledWith("audi-a3-idle", null);
  });

  it("should render a loading state while the frame is being fetched", () => {
    mockUseFreezeFrame.mockReturnValue({
      loading: true,
      frame: null,
      error: null,
    });
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc="P0301" />);

    expect(screen.getByText("Cargando freeze frame…")).toBeDefined();
  });

  it("should render the no-freeze-frame message when the API returns null", () => {
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc="P0420" />);

    expect(screen.getByText("Sin freeze frame para este código")).toBeDefined();
  });

  it("should render the error message when the request fails", () => {
    mockUseFreezeFrame.mockReturnValue({
      loading: false,
      frame: null,
      error: "Scenario not found",
    });
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc="P0301" />);

    expect(screen.getByText("Scenario not found")).toBeDefined();
  });

  it("should render a table of pidValues for the selected frame", () => {
    mockUseFreezeFrame.mockReturnValue({
      loading: false,
      frame: SAMPLE_FRAME,
      error: null,
    });
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc="P0301" />);

    expect(screen.getByText("0C")).toBeDefined();
    expect(screen.getByText("850")).toBeDefined();
    expect(screen.getByText("05")).toBeDefined();
    expect(screen.getByText("90")).toBeDefined();
    expect(screen.queryByText("Sin freeze frame para este código")).toBeNull();
  });
});
