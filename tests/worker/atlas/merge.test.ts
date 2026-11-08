import { describe, expect, it } from "vitest";
import { mergeCandidates, type CandidateEntry } from "../../../worker/atlas/merge";
import { parasiteFieldsSchema } from "../../../worker/atlas/templates/parasite";

function candidate(
  rawName: string,
  fields: Record<string, unknown>,
  page: number,
  materialId = "m-pa11",
  commonName: string | null = null,
): CandidateEntry {
  return {
    rawName,
    commonName,
    fields: parasiteFieldsSchema.parse(fields),
    source: { materialId, page, excerpt: `${rawName} p${page}` },
  };
}

describe("mergeCandidates", () => {
  it("merges slide spellings of one species into one corrected entry", () => {
    const { entries } = mergeCandidates([
      candidate("Ancyclostoma caninum", { family: "Ancylostomatidae" }, 16, "m-pa09", "Canine hookworm"),
      candidate("Ancylostoma caninum", { majorOrgan: "Small intestine" }, 17, "m-pa09"),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].canonicalName).toBe("Ancylostoma caninum");
    expect(entries[0].nameCorrected).toBe(true);
    expect(entries[0].commonName).toBe("Canine hookworm");
    expect(entries[0].fields.family).toBe("Ancylostomatidae");
    expect(entries[0].fields.majorOrgan).toBe("Small intestine");
  });

  it("unions host lists case-insensitively, keeping the first spelling", () => {
    const { entries } = mergeCandidates([
      candidate("Toxocara canis", { definitiveHosts: ["Dog", "wild canids"] }, 8),
      candidate("Toxocara canis", { definitiveHosts: ["dog", "human"], paratenicHosts: ["rodents"] }, 9),
    ]);
    expect(entries[0].fields.definitiveHosts).toEqual(["Dog", "wild canids", "human"]);
    expect(entries[0].fields.paratenicHosts).toEqual(["rodents"]);
  });

  it("keeps the first scalar and records a conflict for a different later value", () => {
    const { entries } = mergeCandidates([
      candidate("Dipylidium caninum", { family: "Diphyllobothriidae" }, 9),
      candidate("Dipylidium caninum", { family: "Dipylidiidae" }, 10),
      candidate("Dipylidium caninum", { family: "dipylidiidae " }, 11),
    ]);
    expect(entries[0].fields.family).toBe("Diphyllobothriidae");
    expect(entries[0].conflicts).toEqual([
      { fieldKey: "family", values: ["Diphyllobothriidae", "Dipylidiidae"] },
    ]);
  });

  it("does not record a conflict when values differ only in case or spacing", () => {
    const { entries } = mergeCandidates([
      candidate("Fasciola hepatica", { majorOrgan: "Liver" }, 6, "m-pa12"),
      candidate("Fasciola hepatica", { majorOrgan: " liver" }, 7, "m-pa12"),
    ]);
    expect(entries[0].conflicts).toEqual([]);
  });

  it("records a conflict for differing structured values", () => {
    const { entries } = mergeCandidates([
      candidate("Haemonchus contortus", { pppDays: { min: 14, max: 21 } }, 17, "m-pa07"),
      candidate("Haemonchus contortus", { pppDays: { min: 18, max: 21 } }, 18, "m-pa07"),
    ]);
    expect(entries[0].fields.pppDays).toEqual({ min: 14, max: 21 });
    expect(entries[0].conflicts).toEqual([
      { fieldKey: "pppDays", values: [{ min: 14, max: 21 }, { min: 18, max: 21 }] },
    ]);
  });

  it("adds one source per filled field and drops repeated identical sources", () => {
    const { entries } = mergeCandidates([
      candidate("Moniezia expansa", { family: "Anoplocephalidae", definitiveHosts: ["sheep"] }, 11),
      candidate("Moniezia expansa", { family: "Anoplocephalidae" }, 11),
      candidate("Moniezia expansa", { family: "Anoplocephalidae" }, 12),
    ]);
    const sources = entries[0].sources.map((s) => `${s.fieldKey}@${s.page}`);
    expect(sources).toEqual(["family@11", "definitiveHosts@11", "family@12"]);
  });

  it("puts candidates without a usable name in unnamed", () => {
    const { entries, unnamed } = mergeCandidates([
      candidate("123", { family: "Taeniidae" }, 3),
      candidate("Taenia ovis", { family: "Taeniidae" }, 4),
    ]);
    expect(entries.map((e) => e.canonicalName)).toEqual(["Taenia ovis"]);
    expect(unnamed).toHaveLength(1);
  });

  it("sorts entries by canonical name", () => {
    const { entries } = mergeCandidates([
      candidate("Toxocara canis", {}, 8),
      candidate("Ancylostoma caninum", {}, 16),
      candidate("Fasciola hepatica", {}, 6),
    ]);
    expect(entries.map((e) => e.canonicalName)).toEqual([
      "Ancylostoma caninum",
      "Fasciola hepatica",
      "Toxocara canis",
    ]);
  });
});
