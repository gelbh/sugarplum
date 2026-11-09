// Main-chunk module: no dataset or worker imports here.
export const ATLAS_LEGACY_PATH =
  /^\/library\/subjects\/([^/]+)\/atlas(?:\/(entry|compare)\/([^/]+)(?:\/([^/]+))?)?\/?$/;

export const ATLAS_HUB_PATH = /^\/atlas\/?$/;

export const ATLAS_PATH =
  /^\/atlas\/([^/]+)(?:\/(entry|compare)\/([^/]+)(?:\/([^/]+))?)?\/?$/;

export type AtlasRoute =
  | { kind: "cabinet" }
  | { kind: "entry"; key: string }
  | { kind: "compare"; a: string; b: string };

export type AtlasPathMatch =
  | { kind: "hub" }
  | { kind: "legacy"; subjectId: string; route: AtlasRoute }
  | { kind: "atlas"; atlasId: string; route: AtlasRoute };

function parseRoute(
  kind: string | undefined,
  first: string | undefined,
  second: string | undefined,
): AtlasRoute | null {
  if (kind === "entry" && first !== undefined && second === undefined) {
    return { kind: "entry", key: decodeURIComponent(first) };
  }
  if (kind === "compare" && first !== undefined && second !== undefined) {
    return {
      kind: "compare",
      a: decodeURIComponent(first),
      b: decodeURIComponent(second),
    };
  }
  return kind === undefined ? { kind: "cabinet" } : null;
}

export function matchAtlasPath(pathname: string): AtlasPathMatch | null {
  if (ATLAS_HUB_PATH.test(pathname)) return { kind: "hub" };

  const legacy = pathname.match(ATLAS_LEGACY_PATH);
  if (legacy) {
    const [, subject, kind, first, second] = legacy;
    const route = parseRoute(kind, first, second);
    if (!route) return null;
    return {
      kind: "legacy",
      subjectId: decodeURIComponent(subject),
      route,
    };
  }

  const m = pathname.match(ATLAS_PATH);
  if (!m) return null;
  const [, atlas, kind, first, second] = m;
  const route = parseRoute(kind, first, second);
  if (!route) return null;
  return {
    kind: "atlas",
    atlasId: decodeURIComponent(atlas),
    route,
  };
}

export const atlasHubHref = () => "/atlas";

export const atlasHref = (atlasId: string) =>
  `/atlas/${encodeURIComponent(atlasId)}`;

export const atlasEntryHref = (atlasId: string, key: string) =>
  `${atlasHref(atlasId)}/entry/${encodeURIComponent(key)}`;

export const atlasCompareHref = (atlasId: string, a: string, b: string) =>
  `${atlasHref(atlasId)}/compare/${encodeURIComponent(a)}/${encodeURIComponent(b)}`;

export const isAtlasToAtlas = (prev: string, next: string) =>
  matchAtlasPath(prev) !== null && matchAtlasPath(next) !== null;

export const atlasHeroName = (id: string) => `atlas-hero-${id}`;
