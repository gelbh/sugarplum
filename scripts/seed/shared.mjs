/**
 * Shared local-seed constants and D1 helpers. Local D1 only.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
export const DB_NAME = "sugarplum";

/** Fixed local credentials (never for production). */
export const LOCAL_DEV_EMAIL = "dev@local.test";
export const LOCAL_DEV_PASSWORD = "local-dev-password";
export const LOCAL_USER_ID = "00000000-0000-4000-8000-0000000000de";
export const LOCAL_DECK_ID = "00000000-0000-4000-8000-0000000000dd";

/**
 * Precomputed `hashPassword("local-dev-password")` via worker/auth/password.ts.
 * Regenerate with: node --input-type=module -e \
 *   'import { hashPassword } from "./worker/auth/password.ts"; console.log(await hashPassword("local-dev-password"))'
 */
export const LOCAL_DEV_PASSWORD_HASH =
  "pbkdf2-sha256$100000$xNXQvJK+cIeEYL60/APpsw==$gpEtfPzAyVVdn3Lw9lxsj4Mw/Jtfe3sU/o6atbqyGz8=";

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function run(cmd, args) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.status !== 0) {
    console.error(res.stdout || "");
    console.error(res.stderr || "");
    throw new Error(`${cmd} ${args.join(" ")} failed (${res.status})`);
  }
  if (res.stdout?.trim()) console.log(res.stdout.trim());
  return res;
}
