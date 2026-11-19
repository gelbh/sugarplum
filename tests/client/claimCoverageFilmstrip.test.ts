/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import ClaimCoverageFilmstrip, {
  CLAIM_COVERAGE_SEGMENT_COLORS,
} from "../../src/deckHub/ClaimCoverageFilmstrip";
import type { ClaimCoverage } from "../../src/api/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const sample: ClaimCoverage = {
  summary: { total: 5, linked: 3, orphan: 2 },
  claims: [
    {
      id: "c1",
      subject: "Alpha",
      predicate: "is",
      object: "linked",
      card_id: "card-1",
      card_status: "accepted",
    },
    {
      id: "c2",
      subject: "Beta",
      predicate: "is",
      object: "orphan",
      card_id: null,
    },
  ],
};

describe("ClaimCoverageFilmstrip", () => {
  it("total 0 → renders nothing", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(
        createElement(ClaimCoverageFilmstrip, {
          coverage: { summary: { total: 0, linked: 0, orphan: 0 }, claims: [] },
        }),
      );
    });
    expect(host.querySelector("button")).toBeNull();
    host.remove();
  });

  it("spark button aria-label carries linked/total", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root: Root = createRoot(host);
    act(() => {
      root.render(
        createElement(ClaimCoverageFilmstrip, { coverage: sample }),
      );
    });
    const btn = host.querySelector("button");
    expect(btn?.getAttribute("aria-label")).toBe(
      "3 of 5 claims linked. Open claim list.",
    );
    host.remove();
  });

  it("uses plum linked and ivory-dim orphan colors", () => {
    expect(CLAIM_COVERAGE_SEGMENT_COLORS.linked).toBe("#5B2C6F");
    expect(CLAIM_COVERAGE_SEGMENT_COLORS.orphan).toBe("#D4C4B0");
  });
});
