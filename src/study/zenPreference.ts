export const ZEN_STORAGE_KEY = "sugarplum.study.zen";

export function loadZenPreference(
  storage: Pick<Storage, "getItem"> = localStorage,
): boolean {
  try {
    return storage.getItem(ZEN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveZenPreference(
  on: boolean,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(ZEN_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
