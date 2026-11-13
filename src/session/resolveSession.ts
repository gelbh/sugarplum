import { ApiError, probeAccount, type AuthUser } from "../api/client";
import {
  GUEST_USER,
  isGuest as isGuestFlag,
} from "../guest/session";

export type SessionUser = AuthUser;

export type ResolveSessionResult =
  | { status: "authenticated"; user: SessionUser }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export type ResolveSessionDeps = {
  isGuest: () => boolean;
  /** Always probes the account session (no guest short-circuit). */
  me: () => Promise<SessionUser>;
  guestUser: SessionUser;
  /** Guest flag was set and account probe succeeded (merge + clear guest). */
  onAccountFromGuest: () => void | Promise<void>;
};

async function defaultOnAccountFromGuest(): Promise<void> {
  const { tryMergeGuestAfterAuth } = await import("../guest/mergeOnAuth");
  await tryMergeGuestAfterAuth();
}

const defaults: ResolveSessionDeps = {
  isGuest: () => isGuestFlag(),
  me: () => probeAccount(),
  guestUser: { ...GUEST_USER },
  onAccountFromGuest: defaultOnAccountFromGuest,
};

export async function resolveSession(
  deps: Partial<ResolveSessionDeps> = {},
): Promise<ResolveSessionResult> {
  const { isGuest, me, guestUser, onAccountFromGuest } = {
    ...defaults,
    ...deps,
  };
  const wasGuest = isGuest();
  try {
    const user = await me();
    if (wasGuest) await onAccountFromGuest();
    return { status: "authenticated", user };
  } catch (err) {
    // Guest flag set: keep local guest usable on 401 and offline/5xx me probes.
    if (wasGuest) {
      return { status: "authenticated", user: guestUser };
    }
    if (err instanceof ApiError && err.status === 401) {
      return { status: "unauthenticated" };
    }
    const message =
      err instanceof Error ? err.message : "Couldn't verify session";
    return { status: "error", message };
  }
}
