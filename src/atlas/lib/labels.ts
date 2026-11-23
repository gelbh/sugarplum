import type { AtlasTier, ParasiteGroup } from "../types";

export const TIER_LABELS: Record<AtlasTier, string> = {
  key: "Key",
  frequent: "Frequent",
  standard: "Standard",
};

export const TIER_ORDER: AtlasTier[] = ["key", "frequent", "standard"];

export const GROUP_LABELS: Record<
  ParasiteGroup,
  { plural: string; common: string }
> = {
  protozoan: { plural: "Protozoa", common: "Single-celled parasites" },
  nematode: { plural: "Nematodes", common: "Roundworms" },
  cestode: { plural: "Cestodes", common: "Tapeworms" },
  trematode: { plural: "Trematodes", common: "Flukes" },
  arthropod: { plural: "Arthropods", common: "Mites, ticks and insects" },
};

/** Vocabulary taxa ("Galba truncatula", "Radix") are capitalised; render them in italics. */
export const isTaxonTerm = (term: string) => /^[A-Z]/.test(term);

export const termLabel = (term: string) =>
  isTaxonTerm(term) ? term : term[0].toUpperCase() + term.slice(1);

export function hostSummary(hosts: string[], max = 2): string {
  if (hosts.length === 0) return "";
  const shown = hosts.slice(0, max).join(", ");
  const rest = hosts.length - max;
  const text = rest > 0 ? `${shown} +${rest}` : shown;
  return isTaxonTerm(text) ? text : text[0].toUpperCase() + text.slice(1);
}

export function pppLabel(
  ppp: { min: number; max: number } | null,
): string | null {
  if (ppp === null) return null;
  return ppp.min === ppp.max
    ? `${ppp.min} days`
    : `${ppp.min} to ${ppp.max} days`;
}
