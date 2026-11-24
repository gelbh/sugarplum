/**
 * @vitest-environment jsdom
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import SubjectKnowledgeBar from "../../src/study/session/SubjectKnowledgeBar";
import type { SubjectKnowledge } from "../../src/study/queue/subjectKnowledge";
import {
  CompositionSpark,
  COMPOSITION_SEGMENT_COLORS,
} from "../../src/materials";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const base: SubjectKnowledge = {
  new: 0,
  learning: 0,
  young: 0,
  mature: 0,
  total: 0,
  graduated: 0,
  graduatedPct: null,
  avgRetrievability: null,
  etk: 0,
  recallCardCount: 0,
};

function renderBar(knowledge: SubjectKnowledge): HTMLDivElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root: Root = createRoot(host);
  act(() => {
    root.render(
      createElement(SubjectKnowledgeBar, {
        knowledge,
        segmentColors: COMPOSITION_SEGMENT_COLORS,
        spark: createElement(CompositionSpark, {
          new: knowledge.new,
          learning: knowledge.learning,
          young: knowledge.young,
          mature: knowledge.mature,
          total: knowledge.total,
          height: 6,
          maxWidth: "100%",
        }),
      }),
    );
  });
  return host;
}

describe("SubjectKnowledgeBar recall caption", () => {
  it("New-heavy → pct without of-N reviewed", () => {
    const host = renderBar({
      ...base,
      new: 8,
      young: 2,
      total: 10,
      graduated: 2,
      graduatedPct: 20,
      avgRetrievability: 0.168,
      etk: 1.68,
      recallCardCount: 10,
    });
    expect(host.textContent).toMatch(/Estimated recall/);
    expect(host.textContent).toMatch(/17%/);
    expect(host.textContent).toMatch(/~1\.7 cards/);
    expect(host.textContent).not.toMatch(/reviewed/);
    host.remove();
  });

  it("all reviewed → estimated recall line", () => {
    const host = renderBar({
      ...base,
      young: 2,
      total: 2,
      graduated: 2,
      graduatedPct: 100,
      avgRetrievability: 0.5,
      etk: 1,
      recallCardCount: 2,
    });
    expect(host.textContent).toMatch(/Estimated recall/);
    expect(host.textContent).toMatch(/50%/);
    expect(host.textContent).toMatch(/~1 cards/);
    expect(host.textContent).not.toMatch(/reviewed/);
    host.remove();
  });

  it("all-New with avg 0 → show 0% recall line", () => {
    const host = renderBar({
      ...base,
      new: 4,
      total: 4,
      graduatedPct: 0,
      avgRetrievability: 0,
      etk: 0,
      recallCardCount: 4,
    });
    expect(host.textContent).toMatch(/Estimated recall/);
    expect(host.textContent).toMatch(/0%/);
    expect(host.textContent).toMatch(/~0 cards/);
    host.remove();
  });

  it("null avg → omit recall line", () => {
    const host = renderBar({
      ...base,
      new: 4,
      total: 4,
      graduatedPct: 0,
    });
    expect(host.textContent).not.toMatch(/Estimated recall/);
    host.remove();
  });
});
