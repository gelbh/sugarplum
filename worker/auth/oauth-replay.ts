import {
  OAUTH_KV_PREFIX,
  type GoogleOAuthIntent,
} from "./google";

/** Short TTL so a duplicate iOS callback can replay without re-hitting Google. */
export const OAUTH_DONE_TTL_SECONDS = 120;

export type GoogleOAuthDone = {
  userId: string;
  intent: GoogleOAuthIntent;
};

export function oauthDoneKey(state: string): string {
  return `${OAUTH_KV_PREFIX}done:${state}`;
}

export function parseOAuthDone(raw: string): GoogleOAuthDone | null {
  try {
    const parsed = JSON.parse(raw) as GoogleOAuthDone;
    if (
      typeof parsed?.userId !== "string" ||
      (parsed.intent !== "login" && parsed.intent !== "link")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
