import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  loadGroupFiles,
  loadParasiteDataset,
} from "../../../worker/atlas/datasets/parasites/index";
import manifest from "../../eval/atlas/course-taxa.json";

const parasitesDir = join(
  fileURLToPath(new URL("../../..", import.meta.url)),
  "public/atlas/parasites",
);

describe("built-in parasite dataset", () => {
  const dataset = loadParasiteDataset();
  const files = loadGroupFiles();

  it("lists every authored entry in the course manifest", () => {
    const listed = new Set(manifest.taxa.map((t) => t.canonicalName));
    for (const e of dataset.entries)
      expect(listed.has(e.canonicalName), e.canonicalName).toBe(true);
  });

  it.each(files.map((f) => [f.file, f] as const))(
    "%s covers every manifest taxon assigned to it",
    (file, f) => {
      const authored = new Set(f.entries.map((e) => e.canonicalName));
      const missing = manifest.taxa
        .filter((t) => t.file === file && !authored.has(t.canonicalName))
        .map((t) => t.canonicalName);
      expect(missing).toEqual([]);
    },
  );

  it("authors every manifest file", () => {
    const authored = new Set(files.map((f) => f.file));
    expect(
      [...new Set(manifest.taxa.map((t) => t.file))].filter(
        (f) => !authored.has(f),
      ),
    ).toEqual([]);
  });

  it("records every known slide misspelling on its entry", async () => {
    const { KNOWN_MISSPELLINGS } = await import("../../../worker/atlas/names");
    const all = new Set(
      dataset.entries.flatMap((e) =>
        e.misspellings.map((m) => m.split(" ")[0]),
      ),
    );
    for (const genus of KNOWN_MISSPELLINGS)
      expect(all.has(genus), genus).toBe(true);
  });

  it("places each family in one order and phylum", () => {
    const seen = new Map<string, string>();
    for (const { fields: f } of dataset.entries) {
      if (!f.family) continue;
      const rank = `${f.phylum} > ${f.order}`;
      expect(seen.get(f.family) ?? rank, f.family).toBe(rank);
      seen.set(f.family, rank);
    }
  });

  it("gives every lifecycle stage a host role", () => {
    const missing = dataset.entries.flatMap((e) =>
      e.fields.lifecycleStages
        .filter((s) => s.hostRole === null)
        .map((s) => `${e.key}: ${s.name}`),
    );
    expect(missing).toEqual([]);
  });

  it("names a lifecycle stage in every onHostStages value", () => {
    const stray = dataset.entries.flatMap((e) => {
      const names = new Set(e.fields.lifecycleStages.map((s) => s.name));
      if (names.size === 0) return [];
      return e.fields.onHostStages
        .filter((s) => !names.has(s))
        .map((s) => `${e.key}: ${s}`);
    });
    expect(stray).toEqual([]);
  });

  it("requires every dataset image file under public/atlas/parasites", () => {
    const missing = dataset.entries.flatMap((e) =>
      e.images.flatMap((img) => {
        const paths = [img.file];
        if (img.file.endsWith(".webp")) {
          paths.push(`${img.file.slice(0, -5)}-blur.webp`);
        }
        return paths
          .filter((file) => !existsSync(join(parasitesDir, e.key, file)))
          .map((file) => `${e.key}: ${file}`);
      }),
    );
    expect(missing).toEqual([]);
  });

  it("requires credit and license on every dataset image", () => {
    const incomplete = dataset.entries.flatMap((e) =>
      e.images
        .filter((img) => !img.credit.trim() || !img.license.trim())
        .map((img) => `${e.key}/${img.id}`),
    );
    expect(incomplete).toEqual([]);
  });

  it("allows at most one hero image per entry", () => {
    const extras = dataset.entries
      .filter((e) => e.images.filter((img) => img.isHero).length > 1)
      .map((e) => e.key);
    expect(extras).toEqual([]);
  });

  it("ships pilot lifecycle_diagram images and never marks them hero", () => {
    const diagrams = dataset.entries.flatMap((e) =>
      e.images
        .filter((img) => img.role === "lifecycle_diagram")
        .map((img) => ({ key: e.key, id: img.id, isHero: img.isHero })),
    );
    expect(diagrams).toEqual(
      expect.arrayContaining([
        {
          key: "fasciola-hepatica",
          id: "lifecycle",
          isHero: false,
        },
        {
          key: "taenia-saginata",
          id: "lifecycle",
          isHero: false,
        },
      ]),
    );
    expect(diagrams.filter((d) => d.isHero)).toEqual([]);
  });

  function expectInfectiveStageLocks(
    expected: Record<string, string>,
    group?: string,
  ) {
    if (group) {
      const groupKeys = dataset.entries
        .filter((e) => e.fields.group === group)
        .map((e) => e.key)
        .sort();
      expect(groupKeys).toEqual(Object.keys(expected).sort());
    }
    for (const [key, stageName] of Object.entries(expected)) {
      const entry = dataset.entries.find((e) => e.key === key);
      expect(entry, key).toBeDefined();
      const infective = (entry?.fields.lifecycleStages ?? []).filter(
        (s) => s.infective,
      );
      expect(infective, key).toHaveLength(1);
      expect(infective[0]?.name, key).toBe(stageName);
      expect(infective[0]?.transmission, key).toBeTruthy();
      expect(
        entry?.refs.some((r) => r.field === "lifecycleStages"),
        `${key} lifecycleStages ref`,
      ).toBe(true);
    }
  }

  it("marks exactly one infective stage on phase-1 enrichment pilots", () => {
    expectInfectiveStageLocks({
      "fasciola-hepatica": "metacercaria",
      "haemonchus-contortus": "L3",
      "giardia-duodenalis": "cyst",
      "strongylus-vulgaris": "L3",
    });
  });

  it("marks exactly one infective stage on every trematode entry", () => {
    expectInfectiveStageLocks(
      {
        "fasciola-hepatica": "metacercaria",
        "fasciola-gigantica": "metacercaria",
        "fascioloides-magna": "metacercaria",
        "dicrocoelium-dendriticum": "metacercaria",
        "calicophoron-daubneyi": "metacercaria",
        "paramphistomum-cervi": "metacercaria",
        "fasciolopsis-buski": "metacercaria",
        "clonorchis-sinensis": "metacercaria",
        "opisthorchis-felineus": "metacercaria",
        "schistosoma-spp": "cercaria",
      },
      "trematode",
    );
  });

  it("marks exactly one infective stage on every cestode entry", () => {
    expectInfectiveStageLocks(
      {
        "anoplocephala-perfoliata": "cysticercoid",
        "dipylidium-caninum": "cysticercoid",
        "davainea-proglottina": "cysticercoid",
        "raillietina-spp": "cysticercoid",
        "moniezia-expansa": "cysticercoid",
        "taenia-hydatigena": "cysticercus",
        "taenia-ovis": "cysticercus",
        "taenia-multiceps": "coenurus",
        "taenia-saginata": "cysticercus",
        "taenia-solium": "cysticercus",
        "echinococcus-granulosus": "hydatid cyst",
        "echinococcus-multilocularis": "hydatid cyst",
        "diphyllobothrium-latum": "plerocercoid",
      },
      "cestode",
    );
  });

  it("marks exactly one infective stage on every nematode entry", () => {
    expectInfectiveStageLocks(
      {
        "toxocara-canis": "larvated egg",
        "toxocara-cati": "larvated egg",
        "toxascaris-leonina": "larvated egg",
        "ancylostoma-caninum": "L3",
        "uncinaria-stenocephala": "L3",
        "strongyloides-stercoralis": "L3",
        "trichuris-vulpis": "larvated egg",
        "crenosoma-vulpis": "L3",
        "oslerus-osleri": "L1",
        "filaroides-hirthi": "L1",
        "aelurostrongylus-abstrusus": "L3",
        "angiostrongylus-vasorum": "L3",
        "dirofilaria-immitis": "L3",
        "dirofilaria-repens": "L3",
        "capillaria-aerophila": "egg",
        "capillaria-plica": "L1",
        "spirocerca-lupi": "L3",
        "ascaridia-galli": "larvated egg",
        "heterakis-gallinarum": "larvated egg",
        "syngamus-trachea": "larvated egg",
        "anisakis-simplex": "L3 in marine fish",
        "contracaecum-osculatum": "L3 in marine fish",
        "pseudoterranova-decipiens": "L3 in marine fish",
        "parascaris-equorum": "larvated egg",
        "strongyloides-westeri": "L3",
        "cylicostephanus-longibursatus": "L3",
        "strongylus-equinus": "L3",
        "strongylus-edentatus": "L3",
        "strongylus-vulgaris": "L3",
        "oxyuris-equi": "larvated egg",
        "habronema-spp": "L3",
        "draschia-megastoma": "L3",
        "parafilaria-multipapillosa": "larva",
        "onchocerca-cervicalis": "L3",
        "thelazia-lacrymalis": "L3",
        "dictyocaulus-arnfieldi": "L3",
        "metastrongylus-apri": "L3",
        "hyostrongylus-rubidus": "L3",
        "ascaris-suum": "egg",
        "strongyloides-ransomi": "L3",
        "trichuris-suis": "egg",
        "trichinella-spiralis": "nurse cell larva",
        "teladorsagia-circumcincta": "L3",
        "haemonchus-contortus": "L3",
        "trichostrongylus-spp": "L3",
        "strongyloides-papillosus": "L3",
        "bunostomum-trigonocephalum": "L3",
        "capillaria-longipes": "infective larva in egg",
        "chabertia-ovina": "L3",
        "oesophagostomum-venulosum": "L3",
        "trichuris-ovis": "egg",
        "nematodirus-battus": "L3",
        "muellerius-capillaris": "L3",
        "protostrongylus-rufescens": "L3",
        "dictyocaulus-filaria": "L3",
        "ostertagia-ostertagi": "L3",
        "dictyocaulus-viviparus": "L3",
        "onchocerca-ochengi": "L3",
      },
      "nematode",
    );
  });

  it("marks exactly one infective stage on every protozoan entry", () => {
    expectInfectiveStageLocks(
      {
        "entamoeba-histolytica": "cyst",
        "giardia-duodenalis": "cyst",
        "balantidium-coli": "cyst",
        "eimeria-spp": "oocyst",
        "cryptosporidium-spp": "oocyst",
        "tritrichomonas-foetus": "trophozoite",
        "histomonas-meleagridis": "stage in Heterakis egg",
        "encephalitozoon-cuniculi": "spore",
        "toxoplasma-gondii": "tissue cyst with bradyzoites",
        "neospora-caninum": "tissue cyst with bradyzoites",
        "sarcocystis-spp": "sarcocyst with bradyzoites",
        "besnoitia-besnoiti": "tissue cyst with bradyzoites",
        "babesia-spp": "gametocyte",
        "theileria-spp": "merozoite and piroplasm",
        "leishmania-infantum": "promastigote",
        "trypanosoma-spp": "metacyclic trypomastigote",
        "plasmodium-spp": "gametocyte",
        "hepatozoon-canis": "gamont",
      },
      "protozoan",
    );
  });

  it("marks exactly one infective stage on every arthropod entry", () => {
    expectInfectiveStageLocks(
      {
        "linguatula-serrata": "nymph",
        "ctenocephalides-felis": "adult",
        "ctenocephalides-canis": "adult",
        "pulex-irritans": "adult",
        "ixodes-ricinus": "larva",
        "ixodes-hexagonus": "larva",
        "dermacentor-reticulatus": "larva",
        "rhipicephalus-sanguineus": "larva",
        "haemaphysalis-punctata": "larva",
        "sarcoptes-scabiei": "adult",
        "psoroptes-ovis": "adult",
        "otodectes-cynotis": "adult",
        "demodex-canis": "adult",
        "cheyletiella-spp": "adult",
        "chorioptes-bovis": "adult",
        "dermanyssus-gallinae": "nymph",
        "trichodectes-canis": "adult",
        "felicola-subrostratus": "adult",
        "bovicola-ovis": "adult",
        "bovicola-bovis": "adult",
        "linognathus-vituli": "adult",
        "lucilia-sericata": "larva",
        "hypoderma-bovis": "L1",
        "oestrus-ovis": "L1",
        "gasterophilus-intestinalis": "L1",
        "culicoides-spp": "adult",
        "stomoxys-calcitrans": "adult",
        "haematobia-irritans": "adult",
        "musca-autumnalis": "adult",
      },
      "arthropod",
    );
  });
});

