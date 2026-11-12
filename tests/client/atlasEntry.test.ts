import { describe, expect, it } from "vitest";
import { bundledAtlasSource } from "../../src/atlas/bundledSource";
import { entryRefs, windowLabel } from "../../src/atlas/entryFields";
import {
  entryLead,
  entryMetaLine,
  glanceRows,
  infectiveStageLabel,
  moreFactKeys,
} from "../../src/atlas/entryGlance";
import { entryTitles } from "../../src/atlas/entryTitles";
import { isShortcutTarget } from "../../src/atlas/keys";
import { isAtlasToAtlas } from "../../src/atlas/paths";

const entries = await bundledAtlasSource.list("subj_1");
const fasciola = entries.find((e) => e.id === "fasciola-hepatica")!;

describe("common-name primacy", () => {
  it("titles every bundled entry with a non-empty common name as primary", () => {
    expect(entries.length).toBeGreaterThan(100);
    for (const e of entries) {
      const common = e.commonName!.trim();
      expect(common).toBeTruthy();
      const titles = entryTitles(e);
      expect(titles.primary).toBe(common);
      expect(titles.scientific).toBe(
        common === e.canonicalName ? null : e.canonicalName,
      );
    }
  });

  it("shows Fasciola under its common name", () => {
    expect(entryTitles(fasciola)).toEqual({
      primary: "Common liver fluke",
      scientific: "Fasciola hepatica",
    });
  });
});

describe("entryRefs", () => {
  it("numbers each source once and reuses the number across fields", () => {
    const { groups, byField } = entryRefs(fasciola.refs);
    expect(groups[0].label).toBe("Whole entry");
    const cdc = groups[0].refs.find((r) =>
      r.ref.citation.startsWith("CDC DPDx"),
    )!.n;
    expect(byField.get("definitiveHosts")).toEqual([cdc]);
    expect(byField.get("intermediateHosts")).toContain(cdc);
    expect(byField.get("intermediateHosts")).toHaveLength(2);
  });

  it("orders field groups by the template field order", () => {
    const labels = entryRefs(fasciola.refs).groups.map((g) => g.label);
    expect(labels.indexOf("Phylum")).toBeLessThan(
      labels.indexOf("Definitive hosts"),
    );
    expect(labels.indexOf("Definitive hosts")).toBeLessThan(
      labels.indexOf("Prepatent period"),
    );
  });
});

describe("windowLabel", () => {
  it("words open and closed windows", () => {
    expect(windowLabel(2, null)).toBe("From week 2");
    expect(windowLabel(2, 8)).toBe("Weeks 2 to 8");
    expect(windowLabel(null, null)).toBeNull();
  });
});

describe("isAtlasToAtlas", () => {
  it("holds only when both paths are inside an Atlas", () => {
    const home = "/atlas/a1";
    expect(isAtlasToAtlas(home, `${home}/entry/fasciola-hepatica`)).toBe(true);
    expect(isAtlasToAtlas(`${home}/entry/x`, home)).toBe(true);
    expect(isAtlasToAtlas("/library/subjects/s1", home)).toBe(false);
    expect(isAtlasToAtlas(home, "/library")).toBe(false);
  });
});

describe("isShortcutTarget", () => {
  it("ignores modified keys", () => {
    const ev = {
      key: "j",
      metaKey: true,
      target: null,
    } as unknown as KeyboardEvent;
    expect(isShortcutTarget(ev)).toBe(false);
  });
});

describe("entryGlance", () => {
  it("builds a muted meta line from group · family · lifecycle type", () => {
    const line = entryMetaLine(fasciola.fields);
    expect(line).toMatch(/Trematode/i);
    expect(line).toContain("·");
    expect(line?.toLowerCase()).not.toContain("ppp");
  });

  it("omits empty optional glance rows and never invents significance", () => {
    const rows = glanceRows(fasciola.fields);
    const keys = rows.map((r) => r.key);
    expect(keys).toContain("definitiveHosts");
    expect(keys).toContain("pppDays");
    expect(keys).toContain("diagnosticStage");
    expect(entryLead(null)).toBeNull();
    expect(entryLead("")).toBeNull();
  });

  it("truncates long significance and flags truncated", () => {
    const long = "x".repeat(400);
    const lead = entryLead(long, 160);
    expect(lead).not.toBeNull();
    expect(lead!.truncated).toBe(true);
    expect(lead!.preview.length).toBeLessThanOrEqual(160);
  });

  it("lists infective stage names when flagged", () => {
    const f = structuredClone(fasciola.fields);
    f.lifecycleStages[0].infective = true;
    expect(infectiveStageLabel(f.lifecycleStages)).toBeTruthy();
  });

  it("keeps catalog keys out of glance and in moreFactKeys", () => {
    const glance = new Set(glanceRows(fasciola.fields).map((r) => r.key));
    for (const k of [
      "phylum",
      "order",
      "distribution",
      "paratenicHosts",
    ] as const) {
      expect(glance.has(k as never)).toBe(false);
      expect(moreFactKeys()).toContain(k);
    }
  });
});
