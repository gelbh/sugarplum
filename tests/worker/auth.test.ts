import { describe, it, expect } from "vitest";
import { app } from "../../worker/index";
import {
  hashPassword,
  isPasswordLongEnough,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from "../../worker/auth/password";
import {
  isSessionActive,
  parseSessionRecord,
  SESSION_COOKIE,
  sessionCookieSecure,
} from "../../worker/auth/session";

describe("auth register validation", () => {
  it("rejects short password", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.co", password: "short" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing email", async () => {
    const res = await app.request("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "not-an-email",
        password: "long-enough-password",
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("password helpers", () => {
  it(`requires at least ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(isPasswordLongEnough("short")).toBe(false);
    expect(isPasswordLongEnough("a".repeat(MIN_PASSWORD_LENGTH))).toBe(true);
  });

  it("hashes and verifies with PBKDF2", async () => {
    const password = "correct-horse-battery";
    const hash = await hashPassword(password);
    expect(hash.startsWith("pbkdf2-sha256$")).toBe(true);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("wrong-password!!", hash)).toBe(false);
  });
});

describe("session helpers", () => {
  it("parses and validates session records", () => {
    const future = Date.now() + 60_000;
    const raw = JSON.stringify({ userId: "u1", expiresAt: future });
    const record = parseSessionRecord(raw);
    expect(record).toEqual({ userId: "u1", expiresAt: future });
    expect(isSessionActive(record!)).toBe(true);
    expect(isSessionActive({ userId: "u1", expiresAt: Date.now() - 1 })).toBe(
      false,
    );
    expect(parseSessionRecord("not-json")).toBeNull();
  });

  it("exports the sp_session cookie name", () => {
    expect(SESSION_COOKIE).toBe("sp_session");
  });

  it("gates Secure on https only so localhost http works", () => {
    expect(sessionCookieSecure("http://localhost:8787/api/auth/login")).toBe(
      false,
    );
    expect(sessionCookieSecure("https://sugarplum.example/api/auth/login")).toBe(
      true,
    );
    expect(sessionCookieSecure(new URL("http://127.0.0.1:5173/"))).toBe(false);
    expect(sessionCookieSecure(new URL("https://app.example/"))).toBe(true);
  });
});
