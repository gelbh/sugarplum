export const ZEN_STORAGE_KEY = "sugarplum.study.zen";

/** Zen-first: unset defaults on; only explicit "0" opts out for desk chrome. */
export function loadZenPreference(storage?: Pick<Storage, "getItem">): boolean {
  try {
    const store = storage ?? localStorage;
    return store.getItem(ZEN_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveZenPreference(
  on: boolean,
  storage?: Pick<Storage, "setItem">,
): void {
  try {
    const store = storage ?? localStorage;
    store.setItem(ZEN_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
