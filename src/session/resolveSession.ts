import { ApiError, me as meApi, type AuthUser } from "../api/client";
import { GUEST_USER, isGuest as isGuestFlag } from "../guest/session";

export type SessionUser = AuthUser;

export type ResolveSessionResult =
  | { status: "authenticated"; user: SessionUser }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export type ResolveSessionDeps = {
  isGuest: () => boolean;
  me: () => Promise<SessionUser>;
  guestUser: SessionUser;
};

const defaults: ResolveSessionDeps = {
  isGuest: () => isGuestFlag(),
  me: () => meApi(),
  guestUser: { ...GUEST_USER },
};

export async function resolveSession(
  deps: Partial<ResolveSessionDeps> = {},
): Promise<ResolveSessionResult> {
  const { isGuest, me, guestUser } = { ...defaults, ...deps };
  if (isGuest()) {
    return { status: "authenticated", user: guestUser };
  }
  try {
    const user = await me();
    return { status: "authenticated", user };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return { status: "unauthenticated" };
    }
    const message =
      err instanceof Error ? err.message : "Couldn't verify session";
    return { status: "error", message };
  }
}
