// Misspellings seen in vet-school parasitology lecture slides.
const GENUS_FIXES: Record<string, string> = {
  Ancyclostoma: "Ancylostoma",
  Ascarida: "Ascaridia",
  Contracecum: "Contracaecum",
  Davainae: "Davainea",
  Dicrocelium: "Dicrocoelium",
  Dictylocaulus: "Dictyocaulus",
  Eimieria: "Eimeria",
  Fasciolides: "Fascioloides",
  Raillientina: "Raillietina",
  Spirocera: "Spirocerca",
  Stongylus: "Strongylus",
  Stronyloides: "Strongyloides",
  Syngymus: "Syngamus",
  Telodorsagia: "Teladorsagia",
  Thelezia: "Thelazia",
  Toxocaris: "Toxascaris",
};

// Applied after genus fixes, so keys use the corrected genus.
const BINOMIAL_FIXES: Record<string, string> = {
  "Dicrocoelium dentriticum": "Dicrocoelium dendriticum",
  "Dictyocaulus filariae": "Dictyocaulus filaria",
  "Dictyocaulus viviparous": "Dictyocaulus viviparus",
  "Heterakis gallinarium": "Heterakis gallinarum",
  "Strongylus edentates": "Strongylus edentatus",
  "Teladorsagia circumcinta": "Teladorsagia circumcincta",
  "Toxocara leonina": "Toxascaris leonina",
  "Trichomonas fetus": "Tritrichomonas foetus",
};

const SPP_WORDS = new Set(["spp", "spp.", "sp", "sp.", "species"]);
const JOINERS = new Set(["and", "&", "or"]);

export type NormalizedName = { canonical: string; corrected: boolean };

export function normalizeParasiteName(raw: string): NormalizedName | null {
  const words = raw
    .replace(/[()]/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[.,;:]+$/, ""))
    .filter(Boolean);
  while (
    words.length > 0 &&
    JOINERS.has(words[words.length - 1].toLowerCase())
  ) {
    words.pop();
  }
  if (words.length === 0 || !/^[A-Za-z]+$/.test(words[0])) return null;
  // Slides abbreviate genera ("F. hepatica"); that is not a separate species.
  if (words[0].length === 1) return null;

  const genusCased =
    words[0][0].toUpperCase() + words[0].slice(1).toLowerCase();
  const genus = GENUS_FIXES[genusCased] ?? genusCased;

  const second = words[1]?.toLowerCase();
  let name: string;
  if (second !== undefined && JOINERS.has(second)) {
    return null;
  } else if (second === undefined || SPP_WORDS.has(second)) {
    name = `${genus} spp.`;
  } else if (/^[a-z]+$/.test(second)) {
    name = `${genus} ${second}`;
  } else {
    return null;
  }

  const canonical = BINOMIAL_FIXES[name] ?? name;
  return {
    canonical,
    corrected: genus !== genusCased || canonical !== name,
  };
}
