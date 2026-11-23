import { clearDueCache } from "../study/kernel";
import { exitGuest, GUEST_USER_ID } from "./session";
import { clearGuestStore } from "./store";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Drop guest flag, demo store, and guest due-cache (before real auth or on end guest). */
export function endGuestLocal(storage?: Store): void {
  exitGuest(storage);
  clearGuestStore(storage);
  clearDueCache(GUEST_USER_ID);
}
