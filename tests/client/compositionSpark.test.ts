/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import CompositionSpark, {
  COMPOSITION_SEGMENT_COLORS,
} from "../../src/components/CompositionSpark";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("CompositionSpark", () => {
  it("total 0 → renders nothing", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(
        createElement(CompositionSpark, {
          new: 0,
          learning: 0,
          young: 0,
          mature: 0,
          total: 0,
        }),
      );
    });
    expect(host.querySelector('[role="img"]')).toBeNull();
    host.remove();
  });

  it("mixed buckets → aria-label lists four counts", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(
        createElement(CompositionSpark, {
          new: 4,
          learning: 1,
          young: 2,
          mature: 3,
          total: 10,
        }),
      );
    });
    const img = host.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toBe(
      "3 mature, 2 young, 1 learning, 4 new",
    );
    host.remove();
  });

  it("uses operate stage colors not MUI traffic-light tokens", () => {
    expect(COMPOSITION_SEGMENT_COLORS.mature).toBe("#5B2C6F");
    expect(COMPOSITION_SEGMENT_COLORS.young).toBe("rgba(91, 44, 111, 0.55)");
    expect(COMPOSITION_SEGMENT_COLORS.learning).toBe("#C4A574");
    expect(COMPOSITION_SEGMENT_COLORS.new).toBe("#bdbdbd");
    expect(COMPOSITION_SEGMENT_COLORS.mature).not.toBe("success.main");
  });
});
