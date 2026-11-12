import type { ClimateBandTerm } from "../../worker/atlas/datasets/vocab";
import countryGeo from "./countryGeo.json";
import type { DistributionMeta, MapRegionId } from "./distributionTags";

type CountryGeo = {
  name: string;
  region: MapRegionId;
  lat: number;
};

const GEO = countryGeo as Record<string, CountryGeo>;

function matchesBand(lat: number, band: ClimateBandTerm): boolean {
  const abs = Math.abs(lat);
  switch (band) {
    case "tropical":
      return abs <= 23.5;
    case "subtropical":
      return abs > 23.5 && abs <= 35;
    case "warm-humid":
      return abs <= 35;
    case "temperate":
      return abs > 35 && abs <= 66.5;
    case "arid":
      // Coarse: subtropical arid belt latitudes; real arid is sparse.
      return abs > 15 && abs <= 35;
    case "arctic":
      return lat >= 66.5;
    case "antarctic":
      return lat <= -66.5;
    default:
      return false;
  }
}

function geoId(isoNumericId: string | number): string {
  const raw = String(isoNumericId);
  return /^\d+$/.test(raw) ? raw.padStart(3, "0") : raw;
}

/** 0..1 fill weight for a Natural Earth ISO-numeric country id. */
export function countryHeatWeight(
  isoNumericId: string | number,
  meta: DistributionMeta,
): number {
  const geo = GEO[geoId(isoNumericId)];
  if (!geo) return 0;

  const regionHit =
    meta.worldwide || meta.regions.some((r) => r === regionTerm(geo.region));
  if (!regionHit && meta.regions.length > 0 && !meta.worldwide) return 0;

  const bandHit =
    meta.bands.length > 0 &&
    meta.bands.some((b) => matchesBand(geo.lat, b));

  if (meta.worldwide) {
    if (meta.bands.length === 0) return 0.42;
    return bandHit ? 0.92 : 0.28;
  }

  if (meta.regions.length > 0) {
    if (!regionHit) return 0;
    if (meta.bands.length === 0) return 0.78;
    return bandHit ? 0.95 : 0.45;
  }

  if (meta.bands.length > 0) return bandHit ? 0.88 : 0;
  return 0;
}

function regionTerm(
  id: MapRegionId,
): DistributionMeta["regions"][number] {
  switch (id) {
    case "na":
      return "north-america";
    case "sa":
      return "south-america";
    case "eu":
      return "europe";
    case "af":
      return "africa";
    case "as":
      return "asia";
    case "oc":
      return "oceania";
    case "an":
      return "antarctica";
  }
}

/** Amber ramp: off / cool worldwide / hot endemic. */
export function heatFill(
  weight: number,
  mute: string,
  soft: string,
  hot: string,
): string {
  if (weight <= 0.05) return mute;
  if (weight < 0.55) return soft;
  return hot;
}

/** Binary-ish opacity so off land never reads as a weak highlight. */
export function heatOpacity(weight: number): number {
  if (weight <= 0.05) return 1;
  if (weight < 0.55) return 0.72;
  return 1;
}
