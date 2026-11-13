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

export const anatomySceneHref = (sceneId: string) =>
  `/anatomy/${encodeURIComponent(sceneId)}`;

/** Legacy limb pack → species mega-scene. */
export function canonicalAnatomySceneId(sceneId: string): string {
  if (sceneId === "canine-limb") return "canine";
  return sceneId;
}
