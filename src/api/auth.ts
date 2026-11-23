import { endGuestLocal } from "../guest/endGuestLocal";
import {
  clearGuestMergeArtifacts,
  tryMergeGuestAfterAuth,
} from "../guest/mergeOnAuth";
import type { GuestImportPayload } from "../guest/importPayload";
import { GUEST_USER, isGuest } from "../guest/session";
import { ensureGuestStore } from "../guest/store";
import {
  clearDueCache,
  clearPendingGrades,
  STUDY_MEDIA_CACHE,
} from "../study/kernel";
import { api } from "./core";
import type { AuthUser } from "./types";

export function importGuestLocal(body: GuestImportPayload) {
  return api<{ deckCount: number; cardCount: number }>("/api/guest/import", {
    method: "POST",
    json: body,
  });
}

export async function register(
  email: string,
  password: string,
  turnstileToken: string,
) {
  const user = await api<AuthUser>("/api/auth/register", {
    method: "POST",
    json: { email, password, turnstileToken },
  });
  await tryMergeGuestAfterAuth({ importGuest: importGuestLocal });
  return user;
}

export async function login(
  email: string,
  password: string,
  turnstileToken: string,
) {
  const user = await api<AuthUser>("/api/auth/login", {
    method: "POST",
    json: { email, password, turnstileToken },
  });
  await tryMergeGuestAfterAuth({ importGuest: importGuestLocal });
  return user;
}

export async function logout() {
  if (isGuest()) {
    endGuestLocal();
    return { ok: true };
  }
  const result = await api<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
  });
  clearDueCache();
  clearPendingGrades();
  clearGuestMergeArtifacts();
  if (typeof caches !== "undefined") {
    try {
      await caches.delete(STUDY_MEDIA_CACHE);
    } catch {
      /* Cache API missing / denied */
    }
  }
  return result;
}

/** Account cookie probe only (no guest localStorage short-circuit). */
export function probeAccount() {
  return api<AuthUser>("/api/auth/me");
}

export function me() {
  if (isGuest()) {
    ensureGuestStore();
    return Promise.resolve({ ...GUEST_USER });
  }
  return probeAccount();
}
