/** Guest = no account; data stays in localStorage on this device. */

export const GUEST_FLAG_KEY = "sugarplum.guest";
export const GUEST_USER_ID = "guest-local";

export const GUEST_USER = {
  id: GUEST_USER_ID,
  email: "guest@local",
  google_linked: false,
  is_admin: false,
} as const;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function store(storage?: Store): Store {
  return storage ?? localStorage;
}

export function isGuest(storage?: Store): boolean {
  try {
    return store(storage).getItem(GUEST_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Enter guest mode (seed cards via ensureGuestStore separately). */
export function enterGuest(storage?: Store): void {
  try {
    store(storage).setItem(GUEST_FLAG_KEY, "1");
  } catch {
    /* private mode */
  }
}

/** Leave guest mode (does not wipe demo cards unless clearGuestStore). */
export function exitGuest(storage?: Store): void {
  try {
    store(storage).removeItem(GUEST_FLAG_KEY);
  } catch {
    /* ignore */
  }
}
