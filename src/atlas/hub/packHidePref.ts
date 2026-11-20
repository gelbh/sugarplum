const key = (userId: string) => `sugarplum.atlas.showHidden.${userId}`;

export function readShowHiddenPref(userId: string): boolean {
  try {
    return localStorage.getItem(key(userId)) === "1";
  } catch {
    return false;
  }
}

export function writeShowHiddenPref(userId: string, on: boolean): void {
  try {
    localStorage.setItem(key(userId), on ? "1" : "0");
  } catch {
    /* storage blocked: the choice lasts for this visit only */
  }
}
