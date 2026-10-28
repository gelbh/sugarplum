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

export function materialDisplayName(
  filename: string | null | undefined,
): string {
  const trimmed = typeof filename === "string" ? filename.trim() : "";
  return trimmed || "Untitled material";
}
