import type { AtlasImageView } from "../types";

/** Prefer the selected stage imageId; else entry lifecycle_diagram. */
export function lifecyclePanelImage(
  images: AtlasImageView[],
  stageImageId: string | null,
): AtlasImageView | null {
  if (stageImageId) {
    const stage = images.find((img) => img.id === stageImageId);
    if (stage) return stage;
  }
  return images.find((img) => img.role === "lifecycle_diagram") ?? null;
}
