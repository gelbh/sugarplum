import type { SvgIconComponent } from "@mui/icons-material";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import HighlightOff from "@mui/icons-material/HighlightOff";
import HelpOutline from "@mui/icons-material/HelpOutline";
import Restaurant from "@mui/icons-material/Restaurant";

export type ZoonoticGlyph = {
  Icon: SvgIconComponent;
  archetype: string;
};

const GLYPHS: Record<string, SvgIconComponent> = {
  yes: CheckCircleOutline,
  no: HighlightOff,
  potential: HelpOutline,
  foodborne: Restaurant,
};

const LABELS: Record<string, string> = {
  yes: "Yes",
  no: "No",
  potential: "Possible",
  foodborne: "Foodborne",
};

/** Resolve a zoonotic term to an MUI glyph (no photo strip). */
export function resolveZoonoticGlyph(term: string): ZoonoticGlyph | null {
  const Icon = GLYPHS[term];
  if (!Icon) return null;
  return { Icon, archetype: term };
}

export function zoonoticPortraitLabel(term: string): string {
  return LABELS[term] ?? term;
}
