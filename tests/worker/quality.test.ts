import { describe, expect, it } from "vitest";
import { filterDraftsByQuality } from "../../worker/generation/quality";
import { harvestRuleDrafts } from "../../worker/generation/rules";
import type { CardDraft } from "../../worker/generation/schema";

function qa(front: string, back: string): CardDraft {
  return {
    type: "qa",
    front,
    back,
    provenance: { pages: [1], excerpt: front },
  };
}

function mcq(front: string, back: string, options: string[]): CardDraft {
  return {
    type: "mcq",
    front,
    back,
    options,
    provenance: { pages: [1], excerpt: front },
  };
}

describe("filterDraftsByQuality", () => {
  it("drops short fronts, table-header dumps, and multi-sentence backs", () => {
    const kept = qa("What is ATP?", "Adenosine triphosphate");
    const drafts = [
      qa("Phylum", "Hosts Family"),
      qa("ab", "too short front"),
      qa("What causes malaria?", "A. One. B. Two. C. Three."),
      kept,
    ];
    expect(filterDraftsByQuality(drafts)).toEqual([kept]);
  });

  it("keeps short glossary fronts that rules harvest", () => {
    const glossary = qa("mitochondria", "powerhouse of the cell");
    expect(filterDraftsByQuality([glossary])).toEqual([glossary]);
  });

  it("keeps very short non-question glossary fronts (≥3 chars)", () => {
    const dna = qa("DNA", "deoxyribonucleic acid");
    expect(filterDraftsByQuality([dna])).toEqual([dna]);
  });

  it("still drops non-glossary fronts shorter than 8 chars", () => {
    const shortQ = qa("What?", "too short question front");
    expect(filterDraftsByQuality([shortQ])).toEqual([]);
  });

  it("keeps rule-harvested glossary after Layer-1 (harvest→filter)", () => {
    const drafts = harvestRuleDrafts("mitochondria: powerhouse of the cell");
    expect(drafts.map((d) => d.front)).toEqual(["mitochondria"]);
    expect(filterDraftsByQuality(drafts).map((d) => d.front)).toEqual([
      "mitochondria",
    ]);
  });

  it("keeps valid mcq and drops invalid option sets", () => {
    const valid = mcq("What is ATP?", "Adenosine triphosphate", [
      "Adenosine triphosphate",
      "Glucose",
      "DNA",
    ]);
    const tooFew = mcq("What is ATP?", "Adenosine triphosphate", [
      "Adenosine triphosphate",
      "Glucose",
    ]);
    const dupes = mcq("What is ATP?", "Adenosine triphosphate", [
      "Adenosine triphosphate",
      "Glucose",
      "Glucose",
    ]);
    const wrongBack = mcq("What is ATP?", "Water", [
      "Adenosine triphosphate",
      "Glucose",
      "DNA",
    ]);
    expect(filterDraftsByQuality([valid])).toEqual([valid]);
    expect(filterDraftsByQuality([tooFew, dupes, wrongBack])).toEqual([]);
    expect(filterDraftsByQuality([valid, tooFew])).toEqual([valid]);
  });

  it("keeps a normal cloze", () => {
    const cloze: CardDraft = {
      type: "cloze",
      front: "The powerhouse is the {{c1::mitochondria}}.",
      back: "mitochondria",
      provenance: { pages: [1], excerpt: "powerhouse" },
    };
    expect(filterDraftsByQuality([cloze])).toEqual([cloze]);
  });

  it("keeps cloze with empty Extra back (answer lives in front)", () => {
    const cloze: CardDraft = {
      type: "cloze",
      front: "The powerhouse is the {{c1::mitochondria}}.",
      back: "",
      provenance: { pages: [1], excerpt: "powerhouse" },
    };
    expect(filterDraftsByQuality([cloze])).toEqual([cloze]);
  });

  it("still drops qa when back is shorter than MIN_BACK", () => {
    const short = qa("What is the powerhouse of the cell?", "x");
    expect(filterDraftsByQuality([short])).toEqual([]);
  });

  it("keeps questions that end with a table-column word", () => {
    const hostQ = qa("What is the definitive host?", "Dogs and cats");
    expect(filterDraftsByQuality([hostQ])).toEqual([hostQ]);
  });

  it("drops lecture-table junk from real harvest (0c24a8cf)", () => {
    const mito = qa("mitochondria", "powerhouse of the cell");
    const atp = qa("What is ATP?", "Adenosine triphosphate");
    const cloze: CardDraft = {
      type: "cloze",
      front: "The powerhouse is the {{c1::mitochondria}}.",
      back: "mitochondria",
      provenance: { pages: [1], excerpt: "powerhouse" },
    };
    const junk = [
      qa("Entamoebidae Definitive", "Multiple"),
      qa("to large intestine", "passed in faeces"),
      qa("Eimeriidae Definitive", "depends on"),
      qa("Cats", "Chronic"),
      qa("comb", "\u201DBlackhead\u201D."),
    ];
    expect(filterDraftsByQuality([...junk, mito, atp, cloze])).toEqual([
      mito,
      atp,
      cloze,
    ]);
  });

  it("keeps QA backs with typographic apostrophe contractions", () => {
    const dna = qa("What is DNA?", "Deoxyribonucleic acid. It\u2019s genetic.");
    expect(filterDraftsByQuality([dna])).toEqual([dna]);
  });

  it("keeps question fronts that start with a preposition", () => {
    const organelle = qa(
      "In which organelle does glycolysis occur?",
      "Cytoplasm",
    );
    const atp = qa("what is ATP?", "Adenosine triphosphate");
    expect(filterDraftsByQuality([organelle, atp])).toEqual([organelle, atp]);
  });

  it("keeps glossary/pipe pairs with a one-word back", () => {
    const harvested = harvestRuleDrafts("Capital of France | Paris\n");
    expect(harvested.map((d) => d.front)).toEqual(["Capital of France"]);
    expect(filterDraftsByQuality(harvested).map((d) => d.back)).toEqual([
      "Paris",
    ]);
  });

  it("keeps yes/no answers only when the front is a question", () => {
    const yesQ = qa("Is ATP a nucleotide?", "yes");
    const yesJunk = qa("ATP present", "yes");
    expect(filterDraftsByQuality([yesQ, yesJunk])).toEqual([yesQ]);
  });

  it("drops residual regen leftovers: section headers, thin glossary, tautology", () => {
    const mito = qa("mitochondria", "powerhouse of the cell");
    const atp = qa("What is ATP?", "Adenosine triphosphate");
    const cloze: CardDraft = {
      type: "cloze",
      front: "The powerhouse is the {{c1::mitochondria}}.",
      back: "mitochondria",
      provenance: { pages: [1], excerpt: "powerhouse" },
    };
    const residual = [
      qa("Pathogenesis in cattle", "Females affected: abortion."),
      qa("Endometriosis", "Inflammation."),
      qa(
        "What is the significance of Trichomonas in free-range flocks?",
        "Especially in free-range flocks.",
      ),
      qa("Free-range flocks", "Especially in free-range flocks."),
    ];
    expect(filterDraftsByQuality([...residual, mito, atp, cloze])).toEqual([
      mito,
      atp,
      cloze,
    ]);
  });

  it("keeps section-header-shaped fronts when the back is substantive", () => {
    const treatment = qa(
      "Treatment of choice for coccidiosis",
      "Amprolium mixed in feed for poultry",
    );
    const diagnosis = qa(
      "Diagnosis of blackhead",
      "Necrotic lesions in the caecum and liver",
    );
    const clinical = qa(
      "Clinical signs in dogs",
      "Bloody diarrhoea and weight loss",
    );
    expect(filterDraftsByQuality([treatment, diagnosis, clinical])).toEqual([
      treatment,
      diagnosis,
      clinical,
    ]);
  });

  it("keeps either/or answers that reuse question nouns", () => {
    const insulin = qa(
      "Does insulin increase or decrease blood glucose?",
      "Decrease blood glucose",
    );
    const shortChoice: CardDraft = {
      type: "qa",
      front: "Does glucagon increase or decrease blood glucose?",
      back: "Increase",
      provenance: {
        pages: [1],
        excerpt: "glucagon increases blood glucose",
      },
    };
    const caseous: CardDraft = {
      type: "qa",
      front: "Is the lesion caseous or purulent?",
      back: "Caseous",
      provenance: { pages: [1], excerpt: "caseous necrosis" },
    };
    expect(filterDraftsByQuality([insulin, shortChoice, caseous])).toEqual([
      insulin,
      shortChoice,
      caseous,
    ]);
  });

  it("keeps English-stem questions with short excerpts (not false binomials)", () => {
    const hosts: CardDraft = {
      type: "qa",
      front: "What are the definitive hosts of Eimeria tenella?",
      back: "Chickens",
      provenance: {
        pages: [1],
        excerpt: "Eimeria tenella infects chickens",
      },
    };
    const transmit: CardDraft = {
      type: "qa",
      front: "How does Giardia duodenalis transmit between hosts?",
      back: "Faecal-oral route",
      provenance: {
        pages: [1],
        excerpt: "Giardia duodenalis transmits faecal-orally",
      },
    };
    expect(filterDraftsByQuality([hosts, transmit])).toEqual([hosts, transmit]);
  });

  it("keeps leading drug/organ clozes (not only topic-genus blanks)", () => {
    const metro: CardDraft = {
      type: "cloze",
      front: "{{c1::Metronidazole}} is the drug of choice for trichomoniasis.",
      back: "Metronidazole",
      provenance: {
        pages: [1],
        excerpt: "Metronidazole is the drug of choice",
      },
    };
    const liverLead: CardDraft = {
      type: "cloze",
      front: "{{c1::Liver}} is reached via the portal vein.",
      back: "Liver",
      provenance: {
        pages: [1],
        excerpt: "reach the liver via the portal vein",
      },
    };
    expect(filterDraftsByQuality([metro, liverLead])).toEqual([
      metro,
      liverLead,
    ]);
  });

  it("drops post-regen failures from live cards (0c24a8cf) and keeps controls", () => {
    const mito = qa("mitochondria", "powerhouse of the cell");
    const gallinaeHost: CardDraft = {
      type: "qa",
      front: "What is the primary host for Trichomonas gallinae?",
      back: "Pigeons and other birds",
      provenance: {
        pages: [1],
        excerpt: "Trichomonas gallinae primarily infects pigeons.",
      },
    };
    const liverCloze: CardDraft = {
      type: "cloze",
      front:
        "Histomonas meleagridis trophozoites reach the {{c1::liver}} via the portal vein.",
      back: "liver",
      provenance: {
        pages: [1],
        excerpt: "trophozoites reach the liver via the portal vein",
      },
    };
    const cryptoMcq: CardDraft = {
      type: "mcq",
      front:
        "Which Cryptosporidium species is the primary cause of disease in young calves?",
      back: "C. parvum",
      options: ["C. parvum", "C. baileyi", "C. meleagridis"],
      provenance: {
        pages: [1],
        excerpt:
          "In cattle, C. parvum is the primary cause of disease in young calves.",
      },
    };
    const leadFillerTautology = qa(
      "What is the significance of Trichomonas in free-range flocks?",
      "Especially in free-range flocks.",
    );

    const hostTautologies = [
      qa(
        "What is the significance of Encephalitozoon cuniculi in rabbits?",
        "Rabbits",
      ),
      qa(
        "What is the significance of Encephalitozoon cuniculi in wild rodents?",
        "Wild rodents",
      ),
      qa(
        "What is the significance of Encephalitozoon cuniculi in humans?",
        "Humans",
      ),
    ];
    const wrongOrganism: CardDraft = {
      type: "qa",
      front: "What is the major organ infected by Trichomonas gallinae?",
      back: "Liver and caecum (large intestine)",
      provenance: {
        pages: [1],
        excerpt: "Liver and caecum (large intestine).",
      },
    };
    const longCloze: CardDraft = {
      type: "cloze",
      front:
        "Giardia duodenalis cysts are passed in the faeces of infected individuals and ingested by the next host in {{c1::faecally contaminated food, water or hands}}.",
      back: "faecally contaminated food, water or hands",
      provenance: {
        pages: [1],
        excerpt:
          "Ingested by next host in faecally contaminated food, water or hands",
      },
    };
    const leadingGenusCloze: CardDraft = {
      type: "cloze",
      front:
        "{{c1::Eimeria}} species are transmitted via ingestion of oocysts passed in the faeces of infected animals.",
      back: "Eimeria",
      provenance: {
        pages: [1],
        excerpt: "Oocysts passed in faeces...",
      },
    };

    expect(
      filterDraftsByQuality([
        ...hostTautologies,
        wrongOrganism,
        longCloze,
        leadingGenusCloze,
        leadFillerTautology,
        mito,
        gallinaeHost,
        liverCloze,
        cryptoMcq,
      ]),
    ).toEqual([mito, gallinaeHost, liverCloze, cryptoMcq]);
  });
});
