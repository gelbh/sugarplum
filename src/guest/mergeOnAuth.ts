import { endGuestLocal } from "./endGuestLocal";
import {
  buildGuestImportPayload,
  type GuestImportPayload,
  type GuestImportStoreLike,
} from "./importPayload";
import { exitGuest, isGuest } from "./session";
import { GUEST_STORE_KEY, peekGuestStore } from "./store";

export const SNAPSHOT_KEY = "sugarplum.guest.merge.v1";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function localBackend(storage?: Store): Store {
  return storage ?? localStorage;
}

function sessionBackend(storage?: Store): Store {
  return storage ?? sessionStorage;
}

function parseStoreRaw(raw: string | null): GuestImportStoreLike | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GuestImportStoreLike;
    if (
      !parsed ||
      !Array.isArray(parsed.decks) ||
      !Array.isArray(parsed.cards)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearSnapshot(session?: Store): void {
  try {
    sessionBackend(session).removeItem(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Persist guest store JSON to sessionStorage before OAuth navigation.
 * Clears guest flag only (not the store) so post-OAuth me() uses the session cookie.
 */
export function snapshotGuestForMerge(local?: Store, session?: Store): void {
  try {
    const raw = localBackend(local).getItem(GUEST_STORE_KEY);
    if (raw) sessionBackend(session).setItem(SNAPSHOT_KEY, raw);
  } catch {
    /* private mode / quota */
  }
  exitGuest(local);
}

export type MergeOnAuthDeps = {
  local?: Store;
  session?: Store;
  importGuest?: (
    body: GuestImportPayload,
  ) => Promise<{ deckCount: number; cardCount: number }>;
};

async function defaultImportGuest(
  body: GuestImportPayload,
): Promise<{ deckCount: number; cardCount: number }> {
  const { importGuestLocal } = await import("../api/client");
  return importGuestLocal(body);
}

/**
 * After auth: POST paste decks/cards, then wipe guest local; soft-fail keeps store.
 * Prefer live guest store; fall back to OAuth session snapshot.
 */
export async function tryMergeGuestAfterAuth(
  deps?: MergeOnAuthDeps,
): Promise<"merged" | "skipped" | "failed"> {
  const local = deps?.local;
  const session = deps?.session;
  const importGuest = deps?.importGuest ?? defaultImportGuest;

  const live = peekGuestStore(local);
  const fromSnapshot = parseStoreRaw(
    (() => {
      try {
        return sessionBackend(session).getItem(SNAPSHOT_KEY);
      } catch {
        return null;
      }
    })(),
  );
  const store = live ?? fromSnapshot;
  const payload = store ? buildGuestImportPayload(store) : null;

  if (!payload) {
    if (isGuest(local) || live != null || fromSnapshot != null) {
      endGuestLocal(local);
    }
    clearSnapshot(session);
    return "skipped";
  }

  try {
    await importGuest(payload);
    endGuestLocal(local);
    clearSnapshot(session);
    return "merged";
  } catch {
    return "failed";
  }
}
