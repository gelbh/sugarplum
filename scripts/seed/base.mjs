/**
 * Local-only bootstrap: dummy Turnstile in .dev.vars + D1 test user/deck.
 * Idempotent. Does not touch remote D1.
 *
 * Usage: npm run db:seed:local
 * Then restart `npm run dev` if Turnstile keys were just added.
 * Multi-worktree: bind Vite to a free port (see README local signed-in section).
 */

import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import {
  DB_NAME,
  LOCAL_DECK_ID,
  LOCAL_DEV_EMAIL,
  LOCAL_DEV_PASSWORD,
  LOCAL_DEV_PASSWORD_HASH,
  LOCAL_USER_ID,
  ROOT,
  run,
  runLocalSql,
  sqlLiteral,
} from "./shared.mjs";

const DEV_VARS = join(ROOT, ".dev.vars");

const DUMMY_SITE_KEY = "1x00000000000000000000AA";
const DUMMY_SECRET_KEY = "1x0000000000000000000000000000000AA";

function readDevVar(existing, key) {
  const m = existing.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim() : null;
}

function ensureDevVars() {
  const existing = existsSync(DEV_VARS) ? readFileSync(DEV_VARS, "utf8") : "";
  const lines = [];
  if (!/^TURNSTILE_SITE_KEY=/m.test(existing)) {
    lines.push(`TURNSTILE_SITE_KEY=${DUMMY_SITE_KEY}`);
  }
  if (!/^TURNSTILE_SECRET_KEY=/m.test(existing)) {
    lines.push(`TURNSTILE_SECRET_KEY=${DUMMY_SECRET_KEY}`);
  }
  if (lines.length === 0) {
    const site = readDevVar(existing, "TURNSTILE_SITE_KEY");
    const secret = readDevVar(existing, "TURNSTILE_SECRET_KEY");
    const dummy = site === DUMMY_SITE_KEY && secret === DUMMY_SECRET_KEY;
    if (!dummy) {
      console.warn(
        "Warning: .dev.vars TURNSTILE_* are not Cloudflare local dummy keys; email auth on localhost may fail. Replace with the dummy pair from the README, or delete those lines and re-run db:seed:local.",
      );
    } else {
      console.log(".dev.vars already has TURNSTILE_* dummy keys");
    }
    return { wrote: false };
  }
  const block =
    (existing && !existing.endsWith("\n") ? "\n" : "") +
    "# Local dummy Turnstile (Cloudflare always-pass). Never use in prod.\n" +
    lines.join("\n") +
    "\n";
  if (existsSync(DEV_VARS)) appendFileSync(DEV_VARS, block);
  else writeFileSync(DEV_VARS, block);
  console.log(`Wrote ${lines.join(", ")} to .dev.vars`);
  return { wrote: true };
}

export async function seed() {
  const turnstile = ensureDevVars();

  console.log("Applying local D1 migrations…");
  run("npx", ["wrangler", "d1", "migrations", "apply", DB_NAME, "--local"]);

  const createdAt = new Date().toISOString();
  const sql = [
    `INSERT INTO users (id, email, password_hash, created_at)`,
    `VALUES (${sqlLiteral(LOCAL_USER_ID)}, ${sqlLiteral(LOCAL_DEV_EMAIL)}, ${sqlLiteral(LOCAL_DEV_PASSWORD_HASH)}, ${sqlLiteral(createdAt)})`,
    `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash;`,
    ``,
    `INSERT INTO decks (id, user_id, title, subject_hint, created_at)`,
    `SELECT ${sqlLiteral(LOCAL_DECK_ID)}, id, 'Local Atlas FR', 'parasitology', ${sqlLiteral(createdAt)}`,
    `FROM users WHERE email = ${sqlLiteral(LOCAL_DEV_EMAIL)}`,
    `ON CONFLICT(id) DO NOTHING;`,
  ].join("\n");

  console.log("Seeding local test user + deck…");
  runLocalSql("base", sql);

  console.log("");
  console.log("Local signed-in smoke account:");
  console.log(`  email:    ${LOCAL_DEV_EMAIL}`);
  console.log(`  password: ${LOCAL_DEV_PASSWORD}`);
  console.log(`  deck:     Local Atlas FR (${LOCAL_DECK_ID})`);
  if (turnstile.wrote) {
    console.log("");
    console.log(
      "Restart `npm run dev` so the Worker picks up new TURNSTILE_* from .dev.vars.",
    );
  }
}
