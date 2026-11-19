import { describe, expect, it } from "vitest";
import { buildClaimSpanCoverage } from "../../worker/generation/claim-span-coverage";

describe("buildClaimSpanCoverage", () => {
  it("lists uncovered material lines as gaps", () => {
    const material =
      "ATP is adenosine triphosphate.\nCells make ATP in the mitochondria.\nUnicorn enzyme is fake.";
    const claims = [
      { source_span: "ATP is adenosine triphosphate" },
    ];
    const ledger = buildClaimSpanCoverage(material, claims);
    expect(ledger.claim_count).toBe(1);
    expect(ledger.covered_units.some((u) => /ATP is adenosine/i.test(u))).toBe(
      true,
    );
    expect(ledger.gaps.some((g) => /mitochondria/i.test(g))).toBe(true);
    expect(ledger.gaps.some((g) => /unicorn/i.test(g))).toBe(true);
  });

  it("returns empty gaps when every line is covered", () => {
    const material = "ATP is adenosine triphosphate.";
    const claims = [{ source_span: "ATP is adenosine triphosphate" }];
    expect(buildClaimSpanCoverage(material, claims).gaps).toEqual([]);
  });

  it("caps gaps at 20", () => {
    const lines = Array.from(
      { length: 30 },
      (_, i) => `Fact line number ${i} about topic.`,
    );
    const ledger = buildClaimSpanCoverage(lines.join("\n"), []);
    expect(ledger.gaps).toHaveLength(20);
  });

  it("keeps one copy of a repeated uncovered line", () => {
    const line = "Unicorn enzyme is fake.";
    const ledger = buildClaimSpanCoverage(`${line}\n${line}`, []);
    expect(ledger.gaps).toEqual([line]);
  });

  it("does not let a duplicate consume a cap slot", () => {
    const lines = Array.from(
      { length: 20 },
      (_, i) => `Fact line number ${i} about topic.`,
    );
    const material = [...lines.slice(0, 19), lines[0], lines[19]].join("\n");
    const ledger = buildClaimSpanCoverage(material, []);
    expect(ledger.gaps).toHaveLength(20);
    expect(ledger.gaps[19]).toBe(lines[19]);
  });

  it("skips ultra-short chrome lines", () => {
    const material = "ab\nATP is adenosine triphosphate.\nxy";
    const ledger = buildClaimSpanCoverage(material, []);
    expect(ledger.gaps).toEqual(["ATP is adenosine triphosphate."]);
  });

  it("covers when unit is a substring of source_span", () => {
    const material = "Cells make ATP in the mitochondria.";
    const claims = [
      {
        source_span:
          "Cells make ATP in the mitochondria. Extra context retained.",
      },
    ];
    expect(buildClaimSpanCoverage(material, claims).gaps).toEqual([]);
  });

  it("does not let a short shared phrase cover distinct lines", () => {
    const material =
      "Mitochondria produces ATP in eukaryotic cells.\nChloroplasts produces ATP during photosynthesis.";
    const claims = [{ source_span: "produces ATP" }];
    const ledger = buildClaimSpanCoverage(material, claims);
    expect(ledger.gaps).toHaveLength(2);
    expect(ledger.covered_units).toEqual([]);
  });
});
