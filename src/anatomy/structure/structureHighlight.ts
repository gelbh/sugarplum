export type HighlightMode = "none" | "selected" | "hover" | "both";

/** Distinct from hover white so selection reads after pointer leave. */
export const SELECTION_EMISSIVE_HEX = 0x66bbff;
export const SELECTION_EMISSIVE_INTENSITY = 0.45;
export const HOVER_EMISSIVE_HEX = 0xffffff;
export const HOVER_EMISSIVE_MIN_INTENSITY = 0.55;

export function highlightModeFor(
  structureId: string,
  selectedId: string | null,
  hoveredId: string | null,
): HighlightMode {
  const selected = selectedId === structureId;
  const hovered = hoveredId === structureId;
  if (selected && hovered) return "both";
  if (selected) return "selected";
  if (hovered) return "hover";
  return "none";
}
