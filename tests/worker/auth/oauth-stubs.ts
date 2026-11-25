import { expect, vi } from "vitest";
import {
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
} from "../../../worker/auth/google";
import { OAUTH_CTX_COOKIE } from "../../../worker/auth/oauth-replay";

export function oauthCtxHeader(state: string): { cookie: string } {
  return { cookie: `${OAUTH_CTX_COOKIE}=${state}` };
}

export function stubGoogleTokenAndProfile(profile: {
  sub: string;
  email: string;
  email_verified?: boolean;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === GOOGLE_TOKEN_URL) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ access_token: "atok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === GOOGLE_USERINFO_URL) {
        return new Response(
          JSON.stringify({
            sub: profile.sub,
            email: profile.email,
            email_verified: profile.email_verified ?? true,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}