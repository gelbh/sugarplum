import { describe, expect, it } from "vitest";
import {
  damerauLevenshtein,
  materialMentionsForPack,
  tokenMatches,
} from "../../src/atlas/hub/packMatch";
import type { FocusMaterial } from "../../src/atlas/hub/focusScan";
import type { NameMatchEntry } from "../../src/atlas/hub/nameMatch";

// Short synthetic snippets only; never paste lecture slide text here.
function named(
  canonicalName: string,
  commonName: string | null = null,
  aliases: string[] = [],
): NameMatchEntry {
  return { canonicalName, commonName, aliases };
}

function material(text: string, filename: string | null = null): FocusMaterial {
  return {
    id: "m1",
    filename,
    sourceRole: "lecture",
    pages: [{ page: 1, text }],
  };
}

const hits = (entry: NameMatchEntry, text: string) =>
  materialMentionsForPack(entry, material(text));

describe("damerauLevenshtein", () => {
  it("counts an adjacent swap as one edit", () => {
    expect(damerauLevenshtein("ambylomma", "amblyomma")).toBe(1);
    expect(damerauLevenshtein("cyanosis", "cynotis")).toBe(2);
    expect(damerauLevenshtein("ixodid", "ixodes")).toBe(2);
  });
});

describe("tokenMatches", () => {
  it("needs an exact match below 7 characters", () => {
    expect(tokenMatches("ixodid", "ixodes")).toBe(false);
    expect(tokenMatches("canis", "canis")).toBe(true);
  });

  it("allows 1 edit at 7 characters and 2 edits at 8 or more", () => {
    expect(tokenMatches("cynotix", "cynotis")).toBe(true);
    expect(tokenMatches("cyanoti", "cynotis")).toBe(false);
    expect(tokenMatches("cyanosis", "cynotis")).toBe(true);
  });
});

describe("materialMentionsForPack", () => {
  it("rule 1: matches existing name forms, including aliases", () => {
    const otodectes = named("Otodectes cynotis", "ear mite");
    expect(hits(otodectes, "Ear mite in cats")).toBe(true);
    const demodex = named("Demodex canis", null, ["follicular mite"]);
    expect(hits(demodex, "The follicular mite lives in follicles")).toBe(true);
  });

  it("rule 1: matches filename separators", () => {
    const file = material("", "Week2_Fasciola_hepatica.pdf");
    expect(materialMentionsForPack(named("Fasciola hepatica"), file)).toBe(true);
  });

  it("rule 2: genus with the epithet nearby", () => {
    expect(hits(named("Demodex canis"), "Demodex (canis, bovis, etc)")).toBe(
      true,
    );
  });

  it("rule 2: a binomial split across a line break", () => {
    expect(hits(named("Psoroptes ovis"), "Sheep scab: Psoroptes\novis")).toBe(
      true,
    );
  });

  it("rule 2: an epithet more than 60 characters away does not count", () => {
    const far = `Demodex ${"x".repeat(61)} canis`;
    expect(hits(named("Demodex canis"), far)).toBe(false);
  });

  it("rule 5: a misspelled epithet", () => {
    const text = "Otodectes cyanosis in the ear canal";
    expect(hits(named("Otodectes cynotis"), text)).toBe(true);
  });

  it("rule 5: a transposed genus", () => {
    const text = "Ambylomma americanum ticks";
    expect(hits(named("Amblyomma americanum"), text)).toBe(true);
  });

  it("rule 3: genus plus spp. matches every species in the genus", () => {
    const text = "Ixodes spp. are hard ticks";
    expect(hits(named("Ixodes ricinus"), text)).toBe(true);
    expect(hits(named("Ixodes hexagonus"), text)).toBe(true);
    expect(hits(named("Ixodes ricinus"), "Ixodes sp. on a dog")).toBe(true);
    expect(hits(named("Ixodes ricinus"), "Ixodes species overview")).toBe(
      true,
    );
  });

  it("rule 3: the plural marker must start within 8 characters", () => {
    const text = "Ixodes are common; many spp. exist";
    expect(hits(named("Ixodes ricinus"), text)).toBe(false);
  });

  it("rule 4: a bare genus matches a spp. entry only", () => {
    const text = "Babesia in cattle blood smears";
    expect(hits(named("Babesia spp."), text)).toBe(true);
    expect(hits(named("Babesia bigemina"), text)).toBe(false);
  });

  it("does not match a near-miss genus under 7 characters", () => {
    const ixodes = named("Ixodes ricinus");
    expect(hits(ixodes, "Ixodid ticks feed for days")).toBe(false);
    expect(hits(ixodes, "Ixodid species, ricinus-like mouthparts")).toBe(false);
  });

  it("does not match a different genus with the same epithet", () => {
    expect(hits(named("Toxocara canis"), "Demodex (canis, bovis)")).toBe(false);
  });
});

describe("materialMentionsForPack window boundaries", () => {
  const demodex = named("Demodex canis");
  // Digits are not name tokens and single spaces survive normalization, so
  // the padding sets the gap exactly.
  const padded = (gap: number, marker: string) =>
    `Demodex ${"1".repeat(gap - 2)} ${marker}`;
  const gapOf = (text: string, marker: string) =>
    text.indexOf(marker, "Demodex".length) - "Demodex".length;

  it("rule 2: an epithet gap of 60 matches and 61 does not", () => {
    const at60 = padded(60, "canis");
    const at61 = padded(61, "canis");
    expect(gapOf(at60, "canis")).toBe(60);
    expect(gapOf(at61, "canis")).toBe(61);
    expect(hits(demodex, at60)).toBe(true);
    expect(hits(demodex, at61)).toBe(false);
  });

  it("rule 3: a plural marker gap of 8 matches and 9 does not", () => {
    for (const marker of ["spp", "sp.", "species"]) {
      const at8 = padded(8, marker);
      const at9 = padded(9, marker);
      expect(gapOf(at8, marker)).toBe(8);
      expect(gapOf(at9, marker)).toBe(9);
      expect(hits(demodex, at8)).toBe(true);
      expect(hits(demodex, at9)).toBe(false);
    }
  });

  it("rule 3: bare sp without a dot does not match", () => {
    expect(hits(demodex, "Demodex sp here")).toBe(false);
    expect(hits(demodex, "Demodex sp, mites")).toBe(false);
    expect(hits(demodex, "Demodex sp")).toBe(false);
    expect(hits(demodex, "Demodex sp. here")).toBe(true);
  });
});
