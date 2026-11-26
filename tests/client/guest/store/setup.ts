import { clearGuestStore } from "../../../../src/guest/store";

export const COMPOSITION_NOW = new Date("2026-11-01T12:00:00.000Z");

export const STORE_KEY = "sugarplum.guest.store.v1";

export function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

export function installGuestStoreTestEnv() {
  const storage = memoryStorage();
  clearGuestStore(storage);
  return { storage };
}
