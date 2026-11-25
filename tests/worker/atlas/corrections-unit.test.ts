import { describe, expect, it } from "vitest";
import {
  computeCorrectionDiff,
  mergeSuggestionDiff,
  parseSuggestionBody,
  type CurrentEntryState,
} from "../../../worker/atlas/corrections";
import { loadParasiteDataset } from "../../../worker/atlas/datasets/parasites/index";
import type { ParasiteFields } from "../../../worker/atlas/templates/parasite";

function psoroptes() {
  return loadParasiteDataset().entries.find((e) => e.key === "psoroptes-ovis")!;
}

function stored(
  overrides: Partial<ParasiteFields> = {},
  learnerAliases: string[] = [],
): CurrentEntryState {
  const base = psoroptes();
  return {
    commonName: base.commonName,
    fields: { ...(base.fields as ParasiteFields), ...overrides },
    learnerAliases,
  };
}

describe("computeCorrectionDiff", () => {
  it("diffs only the selected keys, using stored values", () => {
    const base = psoroptes();
    const current = stored({ significance: "Causes sheep scab.", majorOrgan: "back" });
    expect(computeCorrectionDiff(base, current, ["significance"])).toEqual({
      significance: { from: base.fields.significance, to: "Causes sheep scab." },
    });
  });

  it("drops a selected key whose stored value equals the dataset", () => {
    const base = psoroptes();
    expect(computeCorrectionDiff(base, stored(), ["zoonotic"])).toEqual({});
  });

  it("diffs the common name and treats null as the dataset name", () => {
    const base = psoroptes();
    expect(
      computeCorrectionDiff(base, { ...stored(), commonName: "Scab mite" }, ["commonName"]),
    ).toEqual({ commonName: { from: base.commonName, to: "Scab mite" } });
    expect(
      computeCorrectionDiff(base, { ...stored(), commonName: null }, ["commonName"]),
    ).toEqual({});
  });

  it("treats stored learner aliases as additions to the dataset aliases", () => {
    const base = psoroptes();
    expect(computeCorrectionDiff(base, stored({}, ["Scab mite"]), ["aliases"])).toEqual({
      aliases: { from: base.aliases, to: [...base.aliases, "Scab mite"] },
    });
    expect(computeCorrectionDiff(base, stored({}, []), ["aliases"])).toEqual({});
  });

  it("dedupes learner aliases the way the entry view does", () => {
    const base = psoroptes();
    expect(
      computeCorrectionDiff(base, stored({}, ["Scab mite", "scab-mite", " x "]), ["aliases"]),
    ).toEqual({
      aliases: { from: base.aliases, to: [...base.aliases, "Scab mite"] },
    });
  });

  it("compares objects by value, not key order", () => {
    const base = psoroptes();
    const withPpp = { ...base, fields: { ...base.fields, pppDays: { min: 10, max: 14 } } };
    expect(
      computeCorrectionDiff(
        withPpp,
        {
          ...stored(),
          fields: { ...(withPpp.fields as ParasiteFields), pppDays: { max: 14, min: 10 } },
        },
        ["pppDays"],
      ),
    ).toEqual({});
  });
});

describe("mergeSuggestionDiff", () => {
  it("adds this save's keys and keeps earlier suggested keys", () => {
    const base = psoroptes();
    const prior = JSON.stringify({
      significance: { from: base.fields.significance, to: "Earlier" },
    });
    expect(
      mergeSuggestionDiff(prior, base, stored({ significance: "Earlier", majorOrgan: "back" }), [
        "majorOrgan",
      ]),
    ).toEqual({
      significance: { from: base.fields.significance, to: "Earlier" },
      majorOrgan: { from: base.fields.majorOrgan, to: "back" },
    });
  });

  it("revalues earlier keys from current storage and the current dataset", () => {
    const base = psoroptes();
    const prior = JSON.stringify({
      significance: { from: "stale dataset", to: "Earlier" },
    });
    expect(
      mergeSuggestionDiff(prior, base, stored({ significance: "Later", majorOrgan: "back" }), [
        "majorOrgan",
      ]),
    ).toEqual({
      significance: { from: base.fields.significance, to: "Later" },
      majorOrgan: { from: base.fields.majorOrgan, to: "back" },
    });
  });

  it("reads a malformed stored diff as empty", () => {
    const base = psoroptes();
    for (const bad of ["not json", "[1]", "null"]) {
      expect(
        mergeSuggestionDiff(bad, base, stored({ majorOrgan: "back" }), ["majorOrgan"]),
      ).toEqual({ majorOrgan: { from: base.fields.majorOrgan, to: "back" } });
    }
  });

  it("removes earlier keys whose stored value is back to the dataset", () => {
    const base = psoroptes();
    const prior = JSON.stringify({
      significance: { from: base.fields.significance, to: "Earlier" },
      majorOrgan: { from: base.fields.majorOrgan, to: "back" },
    });
    expect(
      mergeSuggestionDiff(prior, base, stored({ majorOrgan: "back" }), ["significance"]),
    ).toEqual({ majorOrgan: { from: base.fields.majorOrgan, to: "back" } });
  });
});

describe("parseSuggestionBody", () => {
  it("selects keys from the patch and trims note and link", () => {
    expect(
      parseSuggestionBody({
        patch: {
          fields: { significance: "x", notAField: 1 },
          commonName: "Scab mite",
          aliases: ["Scab mite"],
          canonicalName: "Psoroptes ovis",
        },
        note: "  per WOAH  ",
        sourceUrl: " https://example.org/scab ",
      }),
    ).toEqual({
      keys: ["significance", "commonName", "aliases"],
      canonicalName: "Psoroptes ovis",
      note: "per WOAH",
      sourceUrl: "https://example.org/scab",
    });
    expect(parseSuggestionBody({ patch: {} })).toEqual({
      keys: [],
      canonicalName: null,
      note: null,
      sourceUrl: null,
    });
  });

  it("rejects bad input", () => {
    expect(() => parseSuggestionBody({ patch: {}, note: "x".repeat(1001) })).toThrow(
      /at most 1000/,
    );
    expect(() =>
      parseSuggestionBody({ patch: {}, sourceUrl: "javascript:alert(1)" }),
    ).toThrow(/http or https/);
    expect(() =>
      parseSuggestionBody({ patch: {}, sourceUrl: "ftp://example.org/x" }),
    ).toThrow(/http or https/);
    expect(() => parseSuggestionBody({ note: "x" })).toThrow(/patch required/);
  });
});
