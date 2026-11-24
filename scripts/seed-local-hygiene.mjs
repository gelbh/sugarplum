#!/usr/bin/env node
/**
 * Local-only: accepted cards that Deck Hub hygiene flags (essay back / compound front).
 * Idempotent for its own rows (ids prefixed seed-hygiene-*).
 * Prerequisite: npm run db:seed:local (user + deck).
 * Usage: npm run db:seed:local:hygiene
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DB_NAME = "sugarplum";
const LOCAL_DECK_ID = "00000000-0000-4000-8000-0000000000dd";
const PREFIX = "seed-hygiene-";

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function run(cmd, args) {
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
}

function main() {
  const now = new Date().toISOString();
  const essayBack = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
  const cards = [
    {
      id: `${PREFIX}essay-001`,
      front: "What is lysozyme?",
      back: essayBack,
    },
    {
      id: `${PREFIX}essay-002`,
      front: "Describe the life cycle of Fasciola hepatica in detail",
      back: Array.from({ length: 32 }, (_, i) => `parasite${i}`).join(" "),
    },
    {
      id: `${PREFIX}compound-001`,
      front: "What is X and what is Y?",
      back: "Two things",
    },
    {
      id: `${PREFIX}compound-002`,
      front: "How does A work and how does B differ?",
      back: "A then B",
    },
    {
      id: `${PREFIX}safe-001`,
      front: "What digests peptidoglycan?",
      back: "Lysozyme",
    },
  ];

  const lines = [
    `-- wipe prior hygiene FR seed`,
    `DELETE FROM cards WHERE id LIKE ${sqlLiteral(`${PREFIX}%`)};`,
  ];

  for (const card of cards) {
    lines.push(
      `INSERT INTO cards (
         id, deck_id, job_id, type, front_json, back_json, media_r2_keys_json,
         provenance_json, status, created_at, updated_at
       ) VALUES (
         ${sqlLiteral(card.id)},
         ${sqlLiteral(LOCAL_DECK_ID)},
         NULL,
         'qa',
         ${sqlLiteral(JSON.stringify(card.front))},
         ${sqlLiteral(JSON.stringify(card.back))},
         NULL,
         ${sqlLiteral(JSON.stringify({ pages: [1], excerpt: "hygiene seed" }))},
         'accepted',
         ${sqlLiteral(now)},
         ${sqlLiteral(now)}
       );`,
    );
  }

  const dir = join(tmpdir(), "sugarplum-seed-hygiene");
  mkdirSync(dir, { recursive: true });
  const sqlPath = join(dir, "local-hygiene-seed.sql");
  writeFileSync(sqlPath, `${lines.join("\n")}\n`);

  console.log("Seeding hygiene-flagged accepted cards…");
  run("npx", ["wrangler", "d1", "execute", DB_NAME, "--local", "--file", sqlPath]);

  console.log("Hygiene seed ready on Local Atlas FR:");
  console.log(`  flagged-ish: 4 (essay + compound; ids ${PREFIX}*)`);
  console.log(`  safe control: 1 (${PREFIX}safe-001)`);
  console.log("  Open Deck Hub → Hygiene / Cards workshop on Local Atlas FR.");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
