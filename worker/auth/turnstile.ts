import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LEN = 2048;

export type TurnstileAction = "register" | "login";

type SiteverifyResult = {
  success?: boolean;
  action?: string;
  "error-codes"?: string[];
  /** Present when Siteverify used a Cloudflare test/dummy secret. */
  metadata?: { result_with_testing_key?: boolean };
};

function failVerify(): never {
  throw new HTTPException(403, {
    message: "Verification failed. Please try again.",
  });
}

/** Siteverify Turnstile token; fail closed on any error. */
export async function verifyTurnstileToken(
  env: Env,
  token: unknown,
  opts: { action: TurnstileAction; remoteip?: string },
): Promise<void> {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) failVerify();

  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LEN) {
    failVerify();
  }

  try {
    const body: Record<string, string> = {
      secret,
      response: token,
    };
    if (opts.remoteip) body.remoteip = opts.remoteip;

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("turnstile siteverify http", res.status);
      failVerify();
    }

    let result: SiteverifyResult;
    try {
      result = (await res.json()) as SiteverifyResult;
    } catch (err) {
      console.error("turnstile siteverify json", err);
      failVerify();
    }

    if (result == null || typeof result !== "object") failVerify();
    if (result.success !== true) failVerify();
    // Dummy Siteverify omits action/cdata; only skip when Cloudflare marks a testing key.
    // https://developers.cloudflare.com/turnstile/troubleshooting/testing/
    const testingKey = result.metadata?.result_with_testing_key === true;
    if (!testingKey && result.action !== opts.action) failVerify();
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    console.error("turnstile siteverify error", err);
    failVerify();
  }
}
