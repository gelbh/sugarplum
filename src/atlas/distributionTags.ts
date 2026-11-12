import type {
  ClimateBandTerm,
  DistributionRegionTerm,
} from "../../worker/atlas/datasets/vocab";

export type MapRegionId =
  | "na"
  | "sa"
  | "eu"
  | "af"
  | "as"
  | "oc"
  | "an";

export type ClimateBand = ClimateBandTerm;

export type DistributionTags = {
  worldwide: boolean;
  regions: MapRegionId[];
  bands: ClimateBand[];
};

export type DistributionMeta = {
  worldwide: boolean;
  regions: DistributionRegionTerm[];
  bands: ClimateBandTerm[];
};

const REGION_TO_TERM: Record<MapRegionId, DistributionRegionTerm> = {
  na: "north-america",
  sa: "south-america",
  eu: "europe",
  af: "africa",
  as: "asia",
  oc: "oceania",
  an: "antarctica",
};

const TERM_TO_REGION: Record<DistributionRegionTerm, MapRegionId> = {
  "north-america": "na",
  "south-america": "sa",
  europe: "eu",
  africa: "af",
  asia: "as",
  oceania: "oc",
  antarctica: "an",
};

const REGION_LABELS: Record<DistributionRegionTerm, string> = {
  "north-america": "North America",
  "south-america": "South America",
  europe: "Europe",
  africa: "Africa",
  asia: "Asia",
  oceania: "Oceania",
  antarctica: "Antarctica",
};

const BAND_LABELS: Record<ClimateBandTerm, string> = {
  tropical: "Tropical",
  subtropical: "Subtropical",
  "warm-humid": "Warm humid",
  temperate: "Temperate",
  arid: "Arid",
  arctic: "Arctic",
  antarctic: "Antarctic",
};

const ALL_LAND: MapRegionId[] = ["na", "sa", "eu", "af", "as", "oc"];

/** Drop clauses that deny presence (rare/uncommon/absent/except …). */
export function stripNegatedDistributionClauses(text: string): string {
  return text
    .replace(
      /\b(very\s+)?(rare|uncommon|absent|not\s+found|not\s+reported|never\s+reported|never)\s+(in|from|on)\s+[^.;]+/gi,
      " ",
    )
    .replace(/\b(except|excluding|excepting|apart\s+from)\s+[^.;]+/gi, " ")
    .replace(/\bno\s+(longer\s+)?(in|from)\s+[^.;]+/gi, " ");
}

/** Coarse region + climate tags from free-text distribution prose (backfill / fallback). */
export function distributionTags(text: string): DistributionTags {
  const raw = text.toLowerCase();
  const t = stripNegatedDistributionClauses(raw);

  const worldwide =
    /\b(worldwide|cosmopolitan|every inhabited continent|grazing-livestock regions on every|much of the globe|many parts of the world|most of the world)\b/.test(
      t,
    ) ||
    /\bwherever\b/.test(t) ||
    // Bare "widespread" (not "widespread across Eurasia").
    (/\bwidespread\b/.test(t) &&
      !/\bwidespread\s+(across|in|among|through)\b/.test(t));

  const regions = new Set<MapRegionId>();

  // Circumpolar / Holarctic / northern latitudes → northern landmasses.
  if (
    /\bcircumpolar\b|\bholarctic\b|\bnorthern (hemisphere|regions|latitudes)\b|\bboreal\b/.test(
      t,
    )
  ) {
    regions.add("na");
    regions.add("eu");
    regions.add("as");
  }

  // Eurasia spans Europe + Asia.
  if (/\beurasia\b|\beurasian\b/.test(t)) {
    regions.add("eu");
    regions.add("as");
  }

  // North Atlantic cold-water belt.
  if (/\bnorth atlantic\b|\bbaltic\b/.test(t)) {
    regions.add("na");
    regions.add("eu");
  }

  if (/\b(north america|usa|\bus\b|united states|foxhound|canada)\b/.test(t))
    regions.add("na");
  if (/\b(south america|latin america|chile|brazil)\b/.test(t))
    regions.add("sa");
  if (
    /\b(america|americas)\b/.test(t) &&
    !regions.has("na") &&
    !regions.has("sa")
  ) {
    regions.add("na");
    regions.add("sa");
  }
  if (
    /\b(europe|european|uk|united kingdom|britain|scotland|denmark|ireland|mediterranean|middle east|corsica)\b/.test(
      t,
    )
  ) {
    regions.add("eu");
    if (/\bmiddle east\b/.test(t)) regions.add("as");
  }
  // "Africa" and adjectival "African" / "North Africa".
  if (/\bafrica\b|\bafrican\b|\bcameroon\b/.test(t)) regions.add("af");
  if (/\b(asia|asian|japan|china|india|siberia|middle east)\b/.test(t))
    regions.add("as");
  if (/\b(australia|zealand|oceania|pacific)\b/.test(t)) regions.add("oc");
  if (/\bantarct/.test(t)) regions.add("an");

  const bands = new Set<ClimateBand>();
  if (/\btropical\b|\btropics\b|\bhot[-\s]?climate\b/.test(t))
    bands.add("tropical");
  if (/\bsubtropical\b|\bsubtropics\b/.test(t)) bands.add("subtropical");
  if (
    /\bwarm[,\s-]+humid\b|\bwarm[,\s-]+moist\b|\bwarm regions\b|\bhumid regions\b|\bhot[-\s]?humid\b|\bsummer rainfall\b/.test(
      t,
    )
  )
    bands.add("warm-humid");
  if (/\btemperate\b/.test(t)) bands.add("temperate");
  if (/\barid\b|\bdesert\b/.test(t)) bands.add("arid");
  if (/\barctic\b|\bcircumpolar\b|\bboreal\b|\bcolder seas\b|\bcold coastal\b/.test(t))
    bands.add("arctic");
  if (/\bantarct/.test(t)) bands.add("antarctic");

  return {
    worldwide,
    regions: [...regions],
    bands: [...bands],
  };
}

export function tagsToMeta(tags: DistributionTags): DistributionMeta {
  return {
    worldwide: tags.worldwide,
    regions: tags.regions.map((r) => REGION_TO_TERM[r]),
    bands: tags.bands,
  };
}

export function metaFromFields(fields: {
  distribution?: string | null;
  distributionWorldwide?: boolean;
  distributionRegions?: DistributionRegionTerm[];
  climateBands?: ClimateBandTerm[];
}): DistributionMeta {
  const hasStructured =
    fields.distributionWorldwide === true ||
    (fields.distributionRegions?.length ?? 0) > 0 ||
    (fields.climateBands?.length ?? 0) > 0;
  if (hasStructured) {
    return {
      worldwide: fields.distributionWorldwide === true,
      regions: fields.distributionRegions ?? [],
      bands: fields.climateBands ?? [],
    };
  }
  if (fields.distribution) return tagsToMeta(distributionTags(fields.distribution));
  return { worldwide: false, regions: [], bands: [] };
}

/** Region ids lit on the silhouette (worldwide lights all inhabited land). */
export function litRegions(tags: DistributionTags): Set<MapRegionId> {
  if (tags.worldwide) return new Set(ALL_LAND);
  return new Set(tags.regions);
}

export function distributionChipLabels(meta: DistributionMeta): string[] {
  const chips: string[] = [];
  if (meta.worldwide) chips.push("Worldwide");
  for (const r of meta.regions) chips.push(REGION_LABELS[r]);
  for (const b of meta.bands) chips.push(BAND_LABELS[b]);
  return [...new Set(chips)];
}

export function mapRegionIds(meta: DistributionMeta): MapRegionId[] {
  return meta.regions.map((r) => TERM_TO_REGION[r]);
}
