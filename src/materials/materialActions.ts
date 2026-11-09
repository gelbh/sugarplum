export function isFigureMaterial(r2Key: string | null | undefined): boolean {
  return typeof r2Key === "string" && r2Key.includes("/figures/");
}

export function canGenerateMoreFromMaterial(material: {
  kind: string;
  status: string;
}): boolean {
  return (
    (material.kind === "paste" || material.kind === "pdf") &&
    material.status === "ready"
  );
}

/** Free-path DIY: open occlusion create with this image material. */
export function canCreateOcclusionFromMaterial(material: {
  kind: string;
  status: string;
  r2_key?: string | null;
}): boolean {
  return (
    material.kind === "image" &&
    material.status === "ready" &&
    typeof material.r2_key === "string" &&
    material.r2_key.length > 0 &&
    !isFigureMaterial(material.r2_key)
  );
}

export function materialDisplayName(
  filename: string | null | undefined,
): string {
  const trimmed = typeof filename === "string" ? filename.trim() : "";
  return trimmed || "Untitled material";
}
