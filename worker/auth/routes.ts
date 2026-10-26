import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env";
import { getDb } from "../db/client";
import {
  hashPassword,
  isPasswordLongEnough,
  verifyPassword,
} from "./password";
import {
  createSession,
  destroySession,
  requireUser,
  type AuthVariables,
} from "./session";

type AuthEnv = { Bindings: Env; Variables: AuthVariables };

type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
};

function newUserId(): string {
  return crypto.randomUUID();
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes("@")) return null;
  return trimmed;
}

export const authRoutes = new Hono<AuthEnv>();

authRoutes.post("/register", async (c) => {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!email) throw new HTTPException(400, { message: "Valid email required" });
  if (!isPasswordLongEnough(password)) {
    throw new HTTPException(400, {
      message: "Password must be at least 12 characters",
    });
  }

  const db = getDb(c.env);
  const existing = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (existing) {
    throw new HTTPException(409, { message: "Email already registered" });
  }

  const id = newUserId();
  const passwordHash = await hashPassword(password);
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO users (id, email, password_hash, oauth_subject, created_at) VALUES (?, ?, ?, NULL, ?)",
    )
    .bind(id, email, passwordHash, createdAt)
    .run();

  await createSession(c, id);
  return c.json({ id, email }, 201);
});

authRoutes.post("/login", async (c) => {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    throw new HTTPException(400, { message: "Email and password required" });
  }

  const db = getDb(c.env);
  const user = await db
    .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();

  if (!user?.password_hash) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }

  await createSession(c, user.id);
  return c.json({ id: user.id, email: user.email });
});

authRoutes.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const userId = await requireUser(c);
  const db = getDb(c.env);
  const user = await db
    .prepare("SELECT id, email FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: string; email: string }>();

  if (!user) throw new HTTPException(401, { message: "Unauthorized" });
  return c.json(user);
});
