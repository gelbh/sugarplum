import { describe, expect, it } from "vitest";
import { buildCoverageLedger } from "../../worker/generation/coverage";
import type { CardDraft } from "../../worker/generation/schema";

function qa(front: string, back: string, excerpt: string): CardDraft {
  return {
    type: "qa",
    front,
    back,
    provenance: { pages: [1], excerpt },
  };
}

describe("buildCoverageLedger", () => {
  it("lists uncovered material lines as gaps", () => {
    const material =
      "ATP is adenosine triphosphate.\nCells make ATP in the mitochondria.\nUnicorn enzyme is fake.";
    const drafts = [
      qa(
        "What is ATP?",
        "Adenosine triphosphate",
        "ATP is adenosine triphosphate",
      ),
    ];
    const ledger = buildCoverageLedger(material, drafts);
    expect(ledger.draft_count).toBe(1);
    expect(ledger.covered[0]).toContain("ATP is adenosine triphosphate");
    expect(ledger.gaps.some((g) => /mitochondria/i.test(g))).toBe(true);
    expect(ledger.gaps.some((g) => /unicorn/i.test(g))).toBe(true);
  });

  it("returns empty gaps when every line is covered", () => {
    const material = "ATP is adenosine triphosphate.";
    const drafts = [
      qa(
        "What is ATP?",
        "Adenosine triphosphate",
        "ATP is adenosine triphosphate",
      ),
    ];
    expect(buildCoverageLedger(material, drafts).gaps).toEqual([]);
  });

  it("caps gaps at 20", () => {
    const lines = Array.from(
      { length: 30 },
      (_, i) => `Fact line number ${i} about topic.`,
    );
    const ledger = buildCoverageLedger(lines.join("\n"), []);
    expect(ledger.gaps).toHaveLength(20);
  });

  it("keeps one copy of a repeated uncovered line", () => {
    const line = "Unicorn enzyme is fake.";
    const ledger = buildCoverageLedger(`${line}\n${line}`, []);
    expect(ledger.gaps).toEqual([line]);
  });

  it("does not let a duplicate consume a cap slot", () => {
    const lines = Array.from(
      { length: 20 },
      (_, i) => `Fact line number ${i} about topic.`,
    );
    const material = [...lines.slice(0, 19), lines[0], lines[19]].join("\n");
    const ledger = buildCoverageLedger(material, []);
    expect(ledger.gaps).toHaveLength(20);
    expect(ledger.gaps[19]).toBe(lines[19]);
  });

  it("skips ultra-short chrome lines", () => {
    const material = "ab\nATP is adenosine triphosphate.\nxy";
    const ledger = buildCoverageLedger(material, []);
    expect(ledger.gaps).toEqual(["ATP is adenosine triphosphate."]);
  });

  it("handles occlusion drafts without throwing", () => {
    const material = "Labelled liver on the plate.\nUnrelated kidney note here.";
    const occlusion: CardDraft = {
      type: "occlusion",
      front: {
        image_key: "img1",
        regions: [
          { id: "r1", x: 0.1, y: 0.1, w: 0.2, h: 0.2, label: "liver" },
        ],
        mode: "hide_one",
      },
      back: { answer: "liver" },
      provenance: { pages: [1], excerpt: "Labelled liver on the plate" },
    };
    const ledger = buildCoverageLedger(material, [occlusion]);
    expect(ledger.draft_count).toBe(1);
    expect(ledger.covered[0]).toContain("Labelled liver");
    expect(ledger.gaps.some((g) => /kidney/i.test(g))).toBe(true);
  });
});
