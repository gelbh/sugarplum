export type AnatomyPathMatch =
  { kind: "hub" } | { kind: "scene"; sceneId: string };

const HUB = /^\/anatomy\/?$/;
const SCENE = /^\/anatomy\/([^/]+)\/?$/;

export function matchAnatomyPath(pathname: string): AnatomyPathMatch | null {
  if (HUB.test(pathname)) return { kind: "hub" };
  const m = pathname.match(SCENE);
  if (!m) return null;
  return { kind: "scene", sceneId: decodeURIComponent(m[1]) };
}

export const anatomyHubHref = () => "/anatomy";

export const anatomySceneHref = (sceneId: string) =>
  `/anatomy/${encodeURIComponent(sceneId)}`;
