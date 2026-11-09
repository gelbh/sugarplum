import { describe, expect, it } from "vitest";
import { bundledAtlasSource } from "../../src/atlas/bundledSource";
import {
  NO_FILTERS,
  applyFilters,
  entryHosts,
  groupRows,
  hostOptions,
  matchesSearch,
  organOptions,
  sortTable,
} from "../../src/atlas/filter";
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
    const names = sortTable(entries, "name", "asc").map((e) => e.canonicalName);
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
