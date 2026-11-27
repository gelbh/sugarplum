import { describe, expect, it } from "vitest";
import { buildAtlasPrecraftDrafts } from "../../../worker/atlas/precraftDrafts";

const ascarisFields = {
  phylum: "Nematoda",
  order: "Ascaridida",
  family: "Ascarididae",
  group: "nematode" as const,
  definitiveHosts: ["pig"],
  intermediateHosts: [] as string[],
  paratenicHosts: ["earthworm", "beetle"],
  vectorRole: null,
  majorOrgan: "small intestine" as const,
  onHostStages: [] as string[],
  zoonotic: "yes" as const,
  distribution: "Worldwide, including wild boar and feral pigs",
  significance: "Larval migration scars the liver",
  lifecycleType: "direct" as const,
  pppDays: { min: 42, max: 56 },
  lifecycleStages: [],
  diagnosticStage: "egg",
  diagnosticTests: [],
};

describe("buildAtlasPrecraftDrafts", () => {
  it("emits species-anchored major-organ draft with matching claim and covered keys", () => {
    const result = buildAtlasPrecraftDrafts({
      entryKey: "ascaris-suum",
      canonicalName: "Ascaris suum",
      commonName: "Pig ascarid",
      aliases: [],
      fields: ascarisFields,
    });

    const organDraft = result.drafts.find(
      (d) =>
        typeof d.front === "string" &&
        d.front.includes("Ascaris suum") &&
        /major organ/i.test(d.front),
    );
    expect(organDraft).toBeDefined();
    expect(organDraft!.type).toBe("qa");
    expect(organDraft!.back).toBe("small intestine");
    expect(organDraft!.provenance.excerpt).toBe("Major organ: small intestine");

    const organClaim = result.claims.find(
      (c) =>
        c.subject === "Ascaris suum" &&
        c.source_span === organDraft!.provenance.excerpt,
    );
    expect(organClaim).toBeDefined();
    expect(organClaim!.object).toBe("small intestine");

    expect(
      result.drafts.every(
        (d) => typeof d.front !== "string" || d.front.trim() !== "Major organ",
      ),
    ).toBe(true);

    expect(result.coveredFieldKeys).toContain("majorOrgan");
    expect(result.coveredFieldKeys).toContain("commonName");
    expect(result.coveredFieldKeys).toContain("definitiveHosts");
    expect(result.coveredFieldKeys).toContain("paratenicHosts");
    expect(result.coveredFieldKeys).not.toContain("intermediateHosts");
    expect(result.coveredFieldKeys).toContain("zoonotic");
    expect(result.coveredFieldKeys).toContain("family");
    expect(result.coveredFieldKeys).toContain("group");
    expect(result.coveredFieldKeys).toContain("distribution");
    expect(result.coveredFieldKeys).toContain("diagnosticStage");
    expect(result.coveredFieldKeys).toContain("pppDays");

    const hostsDraft = result.drafts.find(
      (d) =>
        typeof d.front === "string" &&
        d.front.includes("Ascaris suum") &&
        /definitive hosts/i.test(d.front),
    );
    expect(hostsDraft?.back).toBe("pig");
    expect(hostsDraft?.provenance.excerpt).toBe("Definitive hosts: pig");

    const paratenicDraft = result.drafts.find(
      (d) =>
        typeof d.front === "string" && /paratenic hosts/i.test(d.front),
    );
    expect(paratenicDraft?.back).toBe("earthworm; beetle");
  });

  it("skips empty optional lists and unset zoonotic", () => {
    const result = buildAtlasPrecraftDrafts({
      entryKey: "thin-entry",
      canonicalName: "Toxocara canis",
      commonName: null,
      aliases: [],
      fields: {
        ...ascarisFields,
        family: null,
        definitiveHosts: ["dog"],
        intermediateHosts: [],
        paratenicHosts: [],
        majorOrgan: null,
        zoonotic: null,
        distribution: null,
        diagnosticStage: null,
        pppDays: null,
      },
    });

    expect(result.coveredFieldKeys).not.toContain("commonName");
    expect(result.coveredFieldKeys).not.toContain("family");
    expect(result.coveredFieldKeys).not.toContain("intermediateHosts");
    expect(result.coveredFieldKeys).not.toContain("paratenicHosts");
    expect(result.coveredFieldKeys).not.toContain("majorOrgan");
    expect(result.coveredFieldKeys).not.toContain("zoonotic");
    expect(result.coveredFieldKeys).not.toContain("distribution");
    expect(result.coveredFieldKeys).not.toContain("diagnosticStage");
    expect(result.coveredFieldKeys).not.toContain("pppDays");
    expect(result.coveredFieldKeys).toContain("group");
    expect(result.coveredFieldKeys).toContain("definitiveHosts");
    expect(result.drafts).toHaveLength(result.claims.length);
  });
});
