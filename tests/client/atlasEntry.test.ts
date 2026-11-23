import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bundledAtlasSource } from "../../src/atlas/hub/bundledSource";
import { entryRefs, windowLabel } from "../../src/atlas/entry/entryFields";
import {
  entryLead,
  entryMetaLine,
  glanceRows,
  glanceSections,
  infectiveStageLabel,
  significanceFullRow,
  taxonomyTree,
} from "../../src/atlas/entry/entryGlance";
import { glanceIconFor } from "../../src/atlas/entry/glanceIcons";
import { resolveHostPortrait } from "../../src/atlas/hub/hostPortraits";
import { resolveSitePortrait } from "../../src/atlas/hub/sitePortraits";
import { resolveStagePortrait } from "../../src/atlas/hub/stagePortraits";
import { countryHeatWeight } from "../../src/atlas/hub/distributionHeat";
import {
  distributionChipLabels,
  distributionTags,
  litRegions,
  tagsToMeta,
} from "../../src/atlas/hub/distributionTags";
import { entryTitles } from "../../src/atlas/lib/entryTitles";
import { isShortcutTarget } from "../../src/atlas/hub/keys";
import { isAtlasToAtlas } from "../../src/atlas/paths";

function hostBytes(name: string): Buffer {
  return readFileSync(
    new URL(`../../public/atlas/hosts/${name}.webp`, import.meta.url),
  );
}

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

  it("folds catalog into categorized glance bands and omits empties", () => {
    const sections = glanceSections(fasciola.fields);
    const titles = sections.map((s) => s.id);
    expect(titles).toEqual(
      expect.arrayContaining([
        "taxonomy",
        "hosts",
        "body",
        "detection",
        "range",
      ]),
    );
    const rows = glanceRows(fasciola.fields);
    const keys = new Set(rows.map((r) => r.key));
    expect(keys.has("taxonomy")).toBe(true);
    expect(keys.has("distribution")).toBe(true);
    expect(keys.has("onHostStages")).toBe(true);
    expect(keys.has("paratenicHosts")).toBe(false);
    expect(keys.has("vectorRole")).toBe(false);
    const tax = rows.find((r) => r.key === "taxonomy")!;
    expect(tax.text).toMatch(/Platyhelminthes/);
    expect(tax.iconCue).toBe("trematode");
    expect(taxonomyTree(fasciola.fields).map((n) => n.field)).toEqual([
      "phylum",
      "order",
      "family",
    ]);
    expect(significanceFullRow(fasciola.fields, false)).toBeNull();
    expect(significanceFullRow(fasciola.fields, true)?.key).toBe(
      "significance",
    );
  });

  it("picks value-specific icons for fasciola cues", () => {
    const rows = glanceRows(fasciola.fields);
    const site = rows.find((r) => r.key === "majorOrgan")!;
    const infective = rows.find((r) => r.key === "infective")!;
    const tax = rows.find((r) => r.key === "taxonomy")!;
    expect(glanceIconFor(site).displayName).toMatch(/Liver/i);
    expect(glanceIconFor(infective).displayName).toMatch(/Cyst/i);
    expect(glanceIconFor(tax).displayName).toMatch(/Flatworm/i);
  });

  it("resolves host portraits via broader chain", () => {
    expect(resolveHostPortrait("sheep")?.archetype).toBe("sheep");
    expect(resolveHostPortrait("Galba truncatula")?.archetype).toBe(
      "lymnaeid snail",
    );
    expect(resolveHostPortrait("lymnaeid snail")?.src).toMatch(
      /lymnaeid-snail\.webp$/,
    );
    expect(resolveHostPortrait("human")?.src).toMatch(/human\.webp$/);
    expect(resolveHostPortrait("non-human primate")?.archetype).toBe(
      "non-human primate",
    );
    expect(resolveHostPortrait("rodent")?.archetype).toBe("rodent");
    expect(resolveHostPortrait("earthworm")?.src).toMatch(/earthworm\.webp$/);
    expect(resolveHostPortrait("Formica")?.archetype).toBe("ant");
  });

  it("maps donkey and turkey to dedicated portraits", () => {
    expect(resolveHostPortrait("donkey")).toEqual({
      src: "/atlas/hosts/donkey.webp",
      archetype: "donkey",
    });
    expect(resolveHostPortrait("turkey")).toEqual({
      src: "/atlas/hosts/turkey.webp",
      archetype: "turkey",
    });
  });

  it("ships unique donkey and turkey host webp bytes", () => {
    const donkey = hostBytes("donkey");
    const turkey = hostBytes("turkey");
    expect(donkey.equals(hostBytes("horse"))).toBe(false);
    expect(donkey.equals(hostBytes("equid"))).toBe(false);
    expect(turkey.equals(hostBytes("chicken"))).toBe(false);
    expect(turkey.equals(hostBytes("bird"))).toBe(false);
  });

  it("maps equid and bird to dedicated portraits", () => {
    expect(resolveHostPortrait("equid")).toEqual({
      src: "/atlas/hosts/equid.webp",
      archetype: "equid",
    });
    expect(resolveHostPortrait("bird")).toEqual({
      src: "/atlas/hosts/bird.webp",
      archetype: "bird",
    });
  });

  it("ships unique equid and bird host webp bytes", () => {
    const equid = hostBytes("equid");
    const bird = hostBytes("bird");
    expect(equid.equals(hostBytes("horse"))).toBe(false);
    expect(equid.equals(hostBytes("donkey"))).toBe(false);
    expect(bird.equals(hostBytes("chicken"))).toBe(false);
    expect(bird.equals(hostBytes("turkey"))).toBe(false);
    expect(bird.equals(hostBytes("pheasant"))).toBe(false);
    expect(bird.equals(hostBytes("gamebird"))).toBe(false);
  });

  it("resolves site portraits via broader chain", () => {
    expect(resolveSitePortrait("bile ducts")?.archetype).toBe("bile ducts");
    expect(resolveSitePortrait("ileum")?.src).toMatch(/ileum\.webp$/);
    expect(resolveSitePortrait("abomasum")?.archetype).toBe("abomasum");
    expect(resolveSitePortrait("skin")?.src).toMatch(/skin\.webp$/);
  });

  it("ships open-licence site Heroes plates", () => {
    const heroes: Array<{ archetype: string; file: string }> = [
      { archetype: "liver", file: "liver.webp" },
      { archetype: "lungs", file: "lungs.webp" },
      { archetype: "stomach", file: "stomach.webp" },
      { archetype: "eye", file: "eye.webp" },
      {
        archetype: "central nervous system",
        file: "central-nervous-system.webp",
      },
      { archetype: "small intestine", file: "small-intestine.webp" },
      { archetype: "trachea", file: "trachea.webp" },
      { archetype: "skin", file: "skin.webp" },
      { archetype: "urinary bladder", file: "urinary-bladder.webp" },
      { archetype: "oesophagus", file: "oesophagus.webp" },
      { archetype: "muscle", file: "muscle.webp" },
      { archetype: "caecum", file: "caecum.webp" },
      { archetype: "large intestine", file: "large-intestine.webp" },
    ];
    for (const h of heroes) {
      expect(resolveSitePortrait(h.archetype)).toEqual({
        src: `/atlas/sites/${h.file}`,
        archetype: h.archetype,
      });
      expect(
        existsSync(
          new URL(`../../public/atlas/sites/${h.file}`, import.meta.url),
        ),
      ).toBe(true);
    }
  });

  it("passes PPP min/max for the glance timeline", () => {
    const ppp = glanceRows(fasciola.fields).find((r) => r.key === "pppDays");
    expect(ppp?.pppMin).toBeTypeOf("number");
    expect(ppp?.pppMax).toBeTypeOf("number");
    expect(ppp?.pppMax).toBeGreaterThanOrEqual(ppp?.pppMin ?? 0);
  });

  it("resolves on-host stage portraits via aliases", () => {
    expect(resolveStagePortrait("adult")?.src).toMatch(/adult\.webp$/);
    expect(resolveStagePortrait("migrating L3")?.archetype).toBe("L3");
    expect(resolveStagePortrait("adult fluke")?.src).toMatch(
      /adult-fluke\.webp$/,
    );
    expect(resolveStagePortrait("schizont")?.archetype).toBe("meront");
    expect(resolveStagePortrait("egg")?.src).toMatch(/egg\.webp$/);
  });

  it("ships CDC stage heroes for open-licence plates", () => {
    for (const file of [
      "egg.webp",
      "microfilaria.webp",
      "cysticercus.webp",
      "l4.webp",
    ] as const) {
      expect(
        existsSync(new URL(`../../public/atlas/stages/${file}`, import.meta.url)),
      ).toBe(true);
    }
  });

  it("tags distribution prose into structured meta", () => {
    const world = distributionTags(
      "Warm, humid regions worldwide; uncommon in Canada",
    );
    expect(world.worldwide).toBe(true);
    expect(world.bands).toContain("warm-humid");
    expect(world.regions).not.toContain("na");
    expect(litRegions(world).has("eu")).toBe(true);
    expect(distributionChipLabels(tagsToMeta(world))).toContain("Worldwide");
    expect(distributionChipLabels(tagsToMeta(world))).toContain("Warm humid");

    const regional = distributionTags(
      "Southern Europe, Africa, Asia, the Middle East, Latin America",
    );
    expect(regional.worldwide).toBe(false);
    expect(regional.regions).toEqual(
      expect.arrayContaining(["eu", "af", "as", "sa"]),
    );

    const climate = distributionTags(
      "Tropical and subtropical regions, limited by the tick vectors",
    );
    expect(climate.bands).toEqual(
      expect.arrayContaining(["tropical", "subtropical"]),
    );
  });

  it("ignores negated continents and reads circumpolar north", () => {
    const fish = distributionTags(
      "Mostly circumpolar northern regions; very rare in South America",
    );
    expect(fish.regions).toEqual(expect.arrayContaining(["na", "eu", "as"]));
    expect(fish.regions).not.toContain("sa");
    expect(fish.bands).toContain("arctic");

    const flea = distributionTags(
      "Found in Europe; rare on dogs in North America",
    );
    expect(flea.regions).toEqual(["eu"]);

    const except = distributionTags("Worldwide except Antarctica");
    expect(except.worldwide).toBe(true);
    expect(except.regions).not.toContain("an");
    expect(except.bands).not.toContain("antarctic");
  });

  it("parses Eurasia, African, Atlantic, and warm-moist cues", () => {
    const lancet = distributionTags(
      "Widespread across Eurasia and North Africa; patchy in North America",
    );
    expect(lancet.worldwide).toBe(false);
    expect(lancet.regions).toEqual(
      expect.arrayContaining(["eu", "as", "af", "na"]),
    );

    const face = distributionTags(
      "Europe, Asia, North America and some African regions",
    );
    expect(face.regions).toEqual(
      expect.arrayContaining(["eu", "as", "na", "af"]),
    );

    const seal = distributionTags(
      "Colder seas, including the North Atlantic and the Baltic Sea",
    );
    expect(seal.regions).toEqual(expect.arrayContaining(["na", "eu"]));
    expect(seal.bands).toContain("arctic");

    const hook = distributionTags("Sheep and goats in warm, moist climates");
    expect(hook.bands).toContain("warm-humid");
  });

  it("heats warm-humid worldwide stronger in low latitudes", () => {
    const meta = {
      worldwide: true,
      regions: [] as const,
      bands: ["warm-humid" as const],
    };
    // Brazil 076, Canada 124 (ISO numeric as in world-atlas)
    expect(countryHeatWeight("076", meta)).toBeGreaterThan(
      countryHeatWeight("124", meta),
    );
    expect(countryHeatWeight("124", meta)).toBeGreaterThan(0.1);
  });

  it("lights only structured regions (Eyeworm-style)", () => {
    const meta = {
      worldwide: false,
      regions: ["north-america", "south-america", "europe", "asia"] as const,
      bands: [] as const,
    };
    // USA 840, Nigeria 566, Australia 036
    expect(countryHeatWeight("840", meta)).toBeGreaterThan(0.5);
    expect(countryHeatWeight("566", meta)).toBe(0);
    expect(countryHeatWeight("036", meta)).toBe(0);
  });
});
