import { describe, expect, it } from "vitest";
import { bundledAtlasSource } from "../../src/atlas/hub/bundledSource";
import {
  NO_FILTERS,
  applyFilters,
  browseSections,
  entryHosts,
  focusActive,
  focusGroupRows,
  groupRows,
  hostOptions,
  matchesSearch,
  matchesTaxonomy,
  organOptions,
  packHidden,
  packHiddenIds,
  packIsActive,
  packVisible,
  revealsHidden,
  railSections,
  sortTable,
} from "../../src/atlas/hub/filter";
import type { AtlasEntryView } from "../../src/atlas/types";
import {
  HOST_TERM_KEYS,
  ORGAN_TERMS,
  ORGAN_TERM_KEYS,
  hostCovers,
  organCovers,
} from "../../worker/atlas/datasets/vocab";
import { PARASITE_GROUPS } from "../../worker/atlas/templates/parasite";

const entries = await bundledAtlasSource.list("subj_1");
const byId = (id: string) => entries.find((e) => e.id === id)!;
const ids = (list: { id: string }[]) => list.map((e) => e.id);

function withTier(
  entry: AtlasEntryView,
  tier: AtlasEntryView["tier"],
  reason = "test",
): AtlasEntryView {
  return {
    ...entry,
    tier,
    reason: tier === null ? null : reason,
    focusMaterialIds: tier === null ? [] : ["mat-1"],
  };
}

describe("applyFilters", () => {
  it("matches a broader host term against specific hosts", () => {
    const hits = applyFilters(entries, { ...NO_FILTERS, host: "mammal" });
    expect(ids(hits)).toContain("dipylidium-caninum");
    expect(ids(hits)).not.toContain("davainea-proglottina");
  });

  it("matches the liver organ through bile ducts", () => {
    expect(ORGAN_TERMS["bile ducts"].broader).toEqual(["liver"]);
    expect(byId("fasciola-hepatica").fields.majorOrgan).toBe("bile ducts");
    const hits = applyFilters(entries, { ...NO_FILTERS, organ: "liver" });
    expect(ids(hits)).toContain("fasciola-hepatica");
    expect(ids(hits)).not.toContain("dipylidium-caninum");
  });

  it("keeps yes and potential zoonoses only when asked", () => {
    const hits = applyFilters(entries, { ...NO_FILTERS, zoonoticOnly: true });
    expect(hits.every((e) => e.fields.zoonotic !== "no")).toBe(true);
    expect(hits.every((e) => e.fields.zoonotic !== null)).toBe(true);
    expect(ids(hits)).toContain("fasciola-hepatica");
  });

  it("limits to the selected groups", () => {
    const hits = applyFilters(entries, { ...NO_FILTERS, groups: ["cestode"] });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.fields.group === "cestode")).toBe(true);
  });

  it("Protozoa group filter includes both lifecycle types", () => {
    const hits = applyFilters(entries, {
      ...NO_FILTERS,
      groups: ["protozoan"],
    });
    expect(ids(hits)).toContain("giardia-duodenalis");
    expect(ids(hits)).toContain("toxoplasma-gondii");
    expect(hits.every((e) => e.fields.group === "protozoan")).toBe(true);
  });

  it("limits to the selected Focus tier", () => {
    const mixed = [
      withTier(byId("fasciola-hepatica"), "key"),
      withTier(byId("dipylidium-caninum"), "frequent"),
      withTier(byId("toxocara-canis"), "standard"),
    ];
    const hits = applyFilters(mixed, { ...NO_FILTERS, tier: "key" });
    expect(ids(hits)).toEqual(["fasciola-hepatica"]);
  });
});

describe("matchesTaxonomy", () => {
  it("keeps family mates and drops other families", () => {
    const family = byId("toxocara-cati").fields.family!;
    const hits = entries.filter((e) =>
      matchesTaxonomy(e, { rank: "family", value: family }),
    );
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.every((e) => e.fields.family === family)).toBe(true);
    expect(ids(hits)).toContain("toxocara-cati");
    expect(ids(hits)).not.toContain("fasciola-hepatica");
  });

  it("passes everything when the filter is null", () => {
    expect(entries.every((e) => matchesTaxonomy(e, null))).toBe(true);
  });
});

describe("Focus helpers", () => {
  it("hides Focus when every tier is null", () => {
    expect(focusActive(entries)).toBe(false);
    expect(railSections(entries, false).map((r) => r.heading)[0]).toBe(
      "Protozoa · Direct",
    );
  });

  it("groups rail Key then Frequent then Standard", () => {
    const mixed = [
      withTier(byId("toxocara-canis"), "standard"),
      withTier(byId("fasciola-hepatica"), "key"),
      withTier(byId("dipylidium-caninum"), "frequent"),
      withTier(byId("fascioloides-magna"), "key"),
    ];
    expect(focusActive(mixed)).toBe(true);
    expect(focusGroupRows(mixed).map((r) => r.heading)).toEqual([
      "Key",
      "Frequent",
      "Standard",
    ]);
    expect(ids(focusGroupRows(mixed)[0].entries)).toEqual([
      "fasciola-hepatica",
      "fascioloides-magna",
    ]);
    expect(railSections(mixed, true).map((r) => r.heading)).toEqual([
      "Key",
      "Frequent",
      "Standard",
    ]);
  });

  it("keeps null-tier entries in a trailing Unscanned section", () => {
    const mixed = [
      withTier(byId("toxocara-canis"), null),
      withTier(byId("fasciola-hepatica"), "key"),
      withTier(byId("dipylidium-caninum"), null),
      withTier(byId("fascioloides-magna"), "frequent"),
    ];
    expect(focusActive(mixed)).toBe(true);
    const rows = focusGroupRows(mixed);
    expect(rows.map((r) => r.heading)).toEqual([
      "Key",
      "Frequent",
      "Unscanned",
    ]);
    // Primary sort is common name: Dog roundworm before Double-pored tapeworm.
    expect(ids(rows[2].entries)).toEqual([
      "toxocara-canis",
      "dipylidium-caninum",
    ]);
    expect(
      rows
        .flatMap((r) => r.entries)
        .map((e) => e.id)
        .sort(),
    ).toEqual(mixed.map((e) => e.id).sort());
  });

  it("sorts Focus column Key before Frequent before Standard", () => {
    const mixed = [
      withTier(byId("toxocara-canis"), "standard"),
      withTier(byId("dipylidium-caninum"), "frequent"),
      withTier(byId("fasciola-hepatica"), "key"),
    ];
    expect(ids(sortTable(mixed, "focus", "asc"))).toEqual([
      "fasciola-hepatica",
      "dipylidium-caninum",
      "toxocara-canis",
    ]);
  });
});

describe("matchesSearch", () => {
  it("finds by misspelling", () => {
    expect(matchesSearch(byId("fascioloides-magna"), "fasciolides")).toBe(true);
  });

  it("finds by genus initial", () => {
    const fasciola = byId("fasciola-hepatica");
    expect(matchesSearch(fasciola, "F. hepatica")).toBe(true);
    expect(matchesSearch(fasciola, "f hepatica")).toBe(true);
    expect(matchesSearch(byId("dicrocoelium-dendriticum"), "F. hepatica")).toBe(
      false,
    );
  });

  it("finds by common name and ignores case", () => {
    expect(matchesSearch(byId("fasciola-hepatica"), "LIVER FLUKE")).toBe(true);
  });
});

describe("sortTable", () => {
  it("puts missing PPP last in both directions", () => {
    for (const dir of ["asc", "desc"] as const) {
      const sorted = sortTable(entries, "ppp", dir);
      const firstNull = sorted.findIndex((e) => e.fields.pppDays === null);
      expect(firstNull).toBeGreaterThan(0);
      expect(
        sorted.slice(firstNull).every((e) => e.fields.pppDays === null),
      ).toBe(true);
    }
    const asc = sortTable(entries, "ppp", "asc");
    expect(asc[0].fields.pppDays!.min).toBeLessThanOrEqual(
      asc[1].fields.pppDays!.min,
    );
  });

  it("sorts by name ascending", () => {
    const names = sortTable(entries, "name", "asc").map(
      (e) => e.commonName ?? e.canonicalName,
    );
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe("groupRows", () => {
  it("orders groups and omits empty ones", () => {
    const rows = groupRows(entries.filter((e) => e.fields.group !== "cestode"));
    const present = PARASITE_GROUPS.filter(
      (g) => g !== "cestode" && entries.some((e) => e.fields.group === g),
    );
    expect(present.length).toBeGreaterThan(1);
    expect(rows.map((r) => r.group)).toEqual(present);
  });
});

describe("browseSections", () => {
  it("splits Protozoa by lifecycleType and keeps other groups whole", () => {
    const sections = browseSections(entries);
    const titles = sections.map((s) => s.title);
    expect(titles).toContain("Protozoa · Direct");
    expect(titles).toContain("Protozoa · Indirect");
    expect(titles).not.toContain("Protozoa · Unspecified");
    expect(titles.indexOf("Protozoa · Direct")).toBeLessThan(
      titles.indexOf("Protozoa · Indirect"),
    );
    expect(titles).toContain("Nematodes");
    expect(titles.filter((t) => t === "Protozoa").length).toBe(0);

    const direct = sections.find((s) => s.id === "protozoan-direct")!;
    const indirect = sections.find((s) => s.id === "protozoan-indirect")!;
    expect(ids(direct.entries)).toContain("giardia-duodenalis");
    expect(ids(indirect.entries)).toContain("toxoplasma-gondii");
    expect(
      direct.entries.every((e) => e.fields.lifecycleType === "direct"),
    ).toBe(true);
    expect(
      indirect.entries.every((e) => e.fields.lifecycleType === "indirect"),
    ).toBe(true);

    const protozoaIds = entries
      .filter((e) => e.fields.group === "protozoan")
      .map((e) => e.id)
      .sort();
    expect([...ids(direct.entries), ...ids(indirect.entries)].sort()).toEqual(
      protozoaIds,
    );
  });

  it("adds Protozoa · Unspecified only when lifecycleType is null", () => {
    const base = byId("giardia-duodenalis");
    const orphan: AtlasEntryView = {
      ...base,
      id: "protozoa-orphan-test",
      fields: { ...base.fields, lifecycleType: null },
    };
    const sections = browseSections([base, orphan, byId("toxoplasma-gondii")]);
    expect(sections.map((s) => s.title)).toEqual([
      "Protozoa · Direct",
      "Protozoa · Indirect",
      "Protozoa · Unspecified",
    ]);
    expect(ids(sections[2].entries)).toEqual(["protozoa-orphan-test"]);
  });

  it("buckets missing lifecycleType with Unspecified", () => {
    const base = byId("giardia-duodenalis");
    const missing = {
      ...base,
      id: "protozoa-missing-lifecycle",
      fields: { ...base.fields, lifecycleType: undefined as unknown as null },
    };
    const sections = browseSections([base, missing]);
    const unspecified = sections.find((s) => s.id === "protozoan-unspecified")!;
    expect(ids(unspecified.entries)).toEqual(["protozoa-missing-lifecycle"]);
  });
});

describe("railSections browse split", () => {
  it("uses Protozoa lifecycle headings when Focus is off", () => {
    const headings = railSections(entries, false).map((r) => r.heading);
    expect(headings).toContain("Protozoa · Direct");
    expect(headings).toContain("Protozoa · Indirect");
    expect(headings[0]).toBe("Protozoa · Direct");
  });
});

describe("term options", () => {
  it("offers used hosts with their broader terms, parents first", () => {
    const terms = hostOptions(entries).map((o) => o.term);
    expect(terms).toContain("mammal");
    expect(terms.indexOf("mammal")).toBeLessThan(terms.indexOf("dog"));
    const unused = HOST_TERM_KEYS.filter(
      (t) => !entries.some((e) => entryHosts(e).some((h) => hostCovers(t, h))),
    );
    expect(unused.length).toBeGreaterThan(0);
    for (const t of unused) expect(terms).not.toContain(t);
  });

  it("offers only organs in use plus their parents", () => {
    const terms = organOptions(entries).map((o) => o.term);
    expect(terms).toContain("liver");
    const unused = ORGAN_TERM_KEYS.filter(
      (t) => !entries.some((e) => organCovers(t, e.fields.majorOrgan ?? "")),
    );
    expect(unused.length).toBeGreaterThan(0);
    for (const t of unused) expect(terms).not.toContain(t);
  });
});

describe("pack hiding", () => {
  const scanned = (
    entry: AtlasEntryView,
    inPack: boolean | null,
    patch: Partial<AtlasEntryView> = {},
  ): AtlasEntryView => ({ ...entry, inPack, ...patch });
  const out = scanned(byId("toxocara-canis"), false);
  const named = scanned(byId("fasciola-hepatica"), true);

  it("packIsActive is false while a focus refresh is pending", () => {
    expect(packIsActive([out, named], true)).toBe(false);
    expect(packIsActive([out, named], false)).toBe(true);
  });

  it("packIsActive is false while any entry is unscanned", () => {
    expect(packIsActive([out, scanned(named, null)], false)).toBe(false);
    expect(packIsActive([out, { ...named, inPack: undefined } as unknown as AtlasEntryView], false)).toBe(false);
    expect(packIsActive([], false)).toBe(false);
  });

  it("hides nothing when the pack is inactive", () => {
    expect(packHidden(out, false)).toBe(false);
  });

  it("never hides an unscanned entry", () => {
    expect(packHidden(scanned(out, null), true)).toBe(false);
  });

  it("never hides a learner-added entry", () => {
    expect(packHidden(scanned(out, false, { originKey: null }), true)).toBe(false);
  });

  it("never hides a pinned entry", () => {
    expect(packHidden(scanned(out, false, { override: "key" }), true)).toBe(false);
  });

  it("hides a dataset entry the pack does not mention", () => {
    expect(packHidden(out, true)).toBe(true);
    expect(packHidden(named, true)).toBe(false);
  });

  it("packHiddenIds lists hidden entries only while the pack is active", () => {
    const pinned = scanned(out, false, { id: "pinned", override: "key" });
    expect([...packHiddenIds([out, named, pinned], true)]).toEqual([out.id]);
    expect(packHiddenIds([out, named, pinned], false).size).toBe(0);
  });

  it("revealsHidden for Show hidden or a typed search", () => {
    expect(revealsHidden(false, "")).toBe(false);
    expect(revealsHidden(false, "   ")).toBe(false);
    expect(revealsHidden(true, "")).toBe(true);
    expect(revealsHidden(false, "toxo")).toBe(true);
  });

  it("packVisible shows hidden entries only when revealed", () => {
    const hidden = packHiddenIds([out, named], true);
    expect(packVisible(out, hidden, revealsHidden(false, ""))).toBe(false);
    expect(packVisible(out, hidden, revealsHidden(false, "   "))).toBe(false);
    expect(packVisible(out, hidden, revealsHidden(true, ""))).toBe(true);
    expect(packVisible(out, hidden, revealsHidden(false, "toxo"))).toBe(true);
    expect(packVisible(named, hidden, revealsHidden(false, ""))).toBe(true);
  });
});
