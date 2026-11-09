import type { AtlasImageView } from "./types";

/** Prefer entry lifecycle_diagram, else the selected stage imageId. */
export function lifecyclePanelImage(
  images: AtlasImageView[],
  stageImageId: string | null,
): AtlasImageView | null {
  const diagram = images.find((img) => img.role === "lifecycle_diagram");
  if (diagram) return diagram;
  if (!stageImageId) return null;
  return images.find((img) => img.id === stageImageId) ?? null;
}
