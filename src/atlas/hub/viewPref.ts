export type AtlasViewMode = "grid" | "table";

const key = (userId: string) => `sugarplum.atlas.view.${userId}`;

export function readViewPref(userId: string): AtlasViewMode {
  try {
    return localStorage.getItem(key(userId)) === "table" ? "table" : "grid";
  } catch {
    return "grid";
  }
}

export function writeViewPref(userId: string, mode: AtlasViewMode): void {
  try {
    localStorage.setItem(key(userId), mode);
  } catch {
    /* storage blocked: the choice lasts for this visit only */
  }
}
