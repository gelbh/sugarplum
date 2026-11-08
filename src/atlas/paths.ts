// Main-chunk module: no dataset or worker imports here.
export const ATLAS_PATH =
  /^\/library\/subjects\/([^/]+)\/atlas(?:\/(entry|compare)\/([^/]+)(?:\/([^/]+))?)?\/?$/;

export type AtlasRoute =
  | { kind: "cabinet" }
  | { kind: "entry"; key: string }
  | { kind: "compare"; a: string; b: string };

export function matchAtlasPath(
  pathname: string,
): { subjectId: string; route: AtlasRoute } | null {
  const m = pathname.match(ATLAS_PATH);
  if (!m) return null;
  const [, subject, kind, first, second] = m;
  const subjectId = decodeURIComponent(subject);
  if (kind === "entry" && second === undefined) {
    return {
      subjectId,
      route: { kind: "entry", key: decodeURIComponent(first) },
    };
  }
  if (kind === "compare" && second !== undefined) {
    return {
      subjectId,
      route: {
        kind: "compare",
        a: decodeURIComponent(first),
        b: decodeURIComponent(second),
      },
    };
  }
  return kind === undefined ? { subjectId, route: { kind: "cabinet" } } : null;
}

export const subjectHref = (subjectId: string) =>
  `/library/subjects/${encodeURIComponent(subjectId)}`;

export const atlasHref = (subjectId: string) =>
  `${subjectHref(subjectId)}/atlas`;

export const atlasEntryHref = (subjectId: string, key: string) =>
  `${atlasHref(subjectId)}/entry/${encodeURIComponent(key)}`;
