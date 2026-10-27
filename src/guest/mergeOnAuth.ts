import { endGuestLocal } from "./endGuestLocal";
import {
  buildGuestImportPayload,
  type GuestImportPayload,
  type GuestImportStoreLike,
} from "./importPayload";
import { exitGuest, isGuest } from "./session";
import { clearGuestStore, GUEST_STORE_KEY, peekGuestStore } from "./store";

export const SNAPSHOT_KEY = "sugarplum.guest.merge.v1";
/** Set when import fails so Today can show a soft-fail toast after redirect/OAuth. */
export const MERGE_FAILED_KEY = "sugarplum.guest.merge.failed";

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
 * Clears guest flag and live store so only the snapshot can import (no cross-account leak).
 */
export function snapshotGuestForMerge(local?: Store, session?: Store): void {
  try {
    const raw = localBackend(local).getItem(GUEST_STORE_KEY);
    if (raw) sessionBackend(session).setItem(SNAPSHOT_KEY, raw);
  } catch {
    /* private mode / quota */
  }
  exitGuest(local);
  clearGuestStore(local);
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

/** Single-flight for default (production) merge; tests with inject skip the lock. */
let mergeInFlight: Promise<"merged" | "skipped" | "failed"> | null = null;

async function runMergeGuestAfterAuth(
  deps?: MergeOnAuthDeps,
): Promise<"merged" | "skipped" | "failed"> {
  const local = deps?.local;
  const session = deps?.session;
  const importGuest = deps?.importGuest ?? defaultImportGuest;

  const live = peekGuestStore(local);
  let snapshotRaw: string | null = null;
  try {
    snapshotRaw = sessionBackend(session).getItem(SNAPSHOT_KEY);
  } catch {
    snapshotRaw = null;
  }
  const fromSnapshot = parseStoreRaw(snapshotRaw);
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
    try {
      sessionBackend(session).removeItem(MERGE_FAILED_KEY);
    } catch {
      /* ignore */
    }
    return "merged";
  } catch {
    // Auth session exists: drop guest flag so me()/API use the cookie, keep store for retry.
    exitGuest(local);
    try {
      sessionBackend(session).setItem(MERGE_FAILED_KEY, "1");
    } catch {
      /* ignore */
    }
    return "failed";
  }
}

/**
 * After auth: POST paste decks/cards, then wipe guest local; soft-fail keeps store,
 * clears guest flag so the real session is used.
 */
export async function tryMergeGuestAfterAuth(
  deps?: MergeOnAuthDeps,
): Promise<"merged" | "skipped" | "failed"> {
  if (deps?.importGuest) {
    return runMergeGuestAfterAuth(deps);
  }
  if (mergeInFlight) return mergeInFlight;
  mergeInFlight = runMergeGuestAfterAuth(deps).finally(() => {
    mergeInFlight = null;
  });
  return mergeInFlight;
}

/** Clear OAuth/email merge leftovers (call on authenticated logout). */
export function clearGuestMergeArtifacts(
  local?: Store,
  session?: Store,
): void {
  clearGuestStore(local);
  clearSnapshot(session);
  try {
    sessionBackend(session).removeItem(MERGE_FAILED_KEY);
  } catch {
    /* ignore */
  }
}

/** Consume soft-fail flag for one UI toast (clears the flag). */
export function consumeMergeFailedNotice(session?: Store): boolean {
  try {
    const s = sessionBackend(session);
    if (s.getItem(MERGE_FAILED_KEY) !== "1") return false;
    s.removeItem(MERGE_FAILED_KEY);
    return true;
  } catch {
    return false;
  }
}
