import type { AnatomyLoadSpec } from "./AnatomyCanvas";
import { resolveAnatomyAssetUrl } from "./resolveAssetUrl";
import type { AnatomySceneManifest } from "./types";

export function buildLoads(
  sceneId: string,
  manifest: AnatomySceneManifest,
  activeRegions: Set<string>,
): AnatomyLoadSpec[] | null {
  const structures =
    manifest.regions && manifest.regions.length > 0
      ? manifest.structures.filter(
          (s) => s.region != null && activeRegions.has(s.region),
        )
      : manifest.structures;

  if (manifest.asset) {
    const url = resolveAnatomyAssetUrl(sceneId, manifest.asset);
    if (!url) return null;
    return structures.map((s) => ({
      structureId: s.id,
      url,
      node: s.node,
      region: s.region,
      label: s.label,
    }));
  }
  const loads: AnatomyLoadSpec[] = [];
  for (const s of structures) {
    if (!s.asset) return null;
    const url = resolveAnatomyAssetUrl(sceneId, s.asset);
    if (!url) return null;
    loads.push({
      structureId: s.id,
      url,
      node: s.node,
      region: s.region,
      label: s.label,
    });
  }
  return loads;
}
