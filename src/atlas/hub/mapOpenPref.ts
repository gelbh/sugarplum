export const MAP_OPEN_STORAGE_KEY = "sugarplum.atlas.mapOpen";

export function readMapOpen(): boolean {
  try {
    return localStorage.getItem(MAP_OPEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMapOpen(open: boolean): void {
  try {
    localStorage.setItem(MAP_OPEN_STORAGE_KEY, open ? "1" : "0");
  } catch {
    /* storage blocked: the choice lasts for this visit only */
  }
}
