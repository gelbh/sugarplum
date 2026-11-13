export type AnatomyPathMatch =
  { kind: "hub" } | { kind: "scene"; sceneId: string };

const HUB = /^\/anatomy\/?$/;
const SCENE = /^\/anatomy\/([^/]+)\/?$/;

export function matchAnatomyPath(pathname: string): AnatomyPathMatch | null {
  if (HUB.test(pathname)) return { kind: "hub" };
  const m = pathname.match(SCENE);
  if (!m) return null;
  try {
    const sceneId = decodeURIComponent(m[1]);
    // Reject traversal / nested segments that would escape /anatomy/<id>/.
    if (
      !sceneId ||
      sceneId.includes("/") ||
      sceneId.includes("\\") ||
      sceneId.includes("..")
    ) {
      return null;
    }
    return { kind: "scene", sceneId };
  } catch {
    return null;
  }
}

export const anatomyHubHref = () => "/anatomy";

export type AnatomySceneHrefOpts = {
  /** Region ids to activate on open (`?region=` repeated). */
  regions?: string[];
};

export function anatomySceneHref(
  sceneId: string,
  opts?: AnatomySceneHrefOpts,
): string {
  const path = `/anatomy/${encodeURIComponent(sceneId)}`;
  const regions = opts?.regions?.filter((id) => id.trim().length > 0) ?? [];
  if (regions.length === 0) return path;
  const params = new URLSearchParams();
  for (const id of regions) params.append("region", id);
  return `${path}?${params.toString()}`;
}

/** `?region=` values from a location search string (unknown ids left to the viewer). */
export function regionsFromSearch(search: string): string[] {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  return params
    .getAll("region")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** Legacy limb pack → species mega-scene. */
export function canonicalAnatomySceneId(sceneId: string): string {
  if (sceneId === "canine-limb") return "canine";
  return sceneId;
}
