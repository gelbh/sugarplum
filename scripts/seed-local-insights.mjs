#!/usr/bin/env node
/**
 * Local-only: fill the seed-local-dev account with accepted cards, schedules,
 * and review history so Insights has something to render.
 *
 * Idempotent for its own rows (ids prefixed seed-insights-*).
 * Warning: each run resets desired_retention / r_floor on the seed user
 * (0.9 / 0.8), which overwrites local Settings experiments for that account.
 * Usage: npm run db:seed:local:insights
 * Prerequisite: npm run db:seed:local (user + deck).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const DB_NAME = "sugarplum";
const LOCAL_USER_ID = "00000000-0000-4000-8000-0000000000de";
const LOCAL_DECK_ID = "00000000-0000-4000-8000-0000000000dd";
const SUBJECT_A = "seed-insights-subject-a";
const SUBJECT_B = "seed-insights-subject-b";
const DECK_B = "seed-insights-deck-b";
const PREFIX = "seed-insights-";
const CARD_COUNT = 48;
const DAYS = 90;

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

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

function dayIso(now, daysAgo, hour, minute = 0) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

function main() {
  const rand = mulberry32(20261119);
  const now = new Date();
  const createdAt = now.toISOString();
  const lines = [];

  lines.push(`-- wipe prior insights seed`);
  lines.push(
    `DELETE FROM cards WHERE id LIKE ${sqlLiteral(`${PREFIX}%`)};`,
  );
  lines.push(
    `UPDATE decks SET subject_id = NULL
     WHERE subject_id LIKE ${sqlLiteral(`${PREFIX}%`)};`,
  );
  lines.push(`DELETE FROM decks WHERE id = ${sqlLiteral(DECK_B)};`);
  lines.push(
    `DELETE FROM subjects WHERE id LIKE ${sqlLiteral(`${PREFIX}%`)};`,
  );

  lines.push(
    `INSERT INTO subjects (id, user_id, title, created_at) VALUES
      (${sqlLiteral(SUBJECT_A)}, ${sqlLiteral(LOCAL_USER_ID)}, 'Parasitology', ${sqlLiteral(createdAt)}),
      (${sqlLiteral(SUBJECT_B)}, ${sqlLiteral(LOCAL_USER_ID)}, 'Microbiology', ${sqlLiteral(createdAt)})
     ON CONFLICT(id) DO UPDATE SET title = excluded.title;`,
  );

  lines.push(
    `UPDATE decks SET subject_id = ${sqlLiteral(SUBJECT_A)}
     WHERE id = ${sqlLiteral(LOCAL_DECK_ID)} AND user_id = ${sqlLiteral(LOCAL_USER_ID)};`,
  );

  lines.push(
    `INSERT INTO decks (id, user_id, title, subject_hint, subject_id, created_at)
     VALUES (
       ${sqlLiteral(DECK_B)},
       ${sqlLiteral(LOCAL_USER_ID)},
       'Local Insights FR',
       'microbiology',
       ${sqlLiteral(SUBJECT_B)},
       ${sqlLiteral(createdAt)}
     )
     ON CONFLICT(id) DO UPDATE SET subject_id = excluded.subject_id;`,
  );

  lines.push(
    `INSERT INTO user_study_prefs
       (user_id, intro_budget, review_budget, r_floor, desired_retention, enable_fuzz,
        enable_load_balance, easy_days_json, updated_at)
     VALUES (
       ${sqlLiteral(LOCAL_USER_ID)}, 20, 200, 0.8, 0.9, 1, 1,
       ${sqlLiteral(JSON.stringify([
         "normal",
         "normal",
         "normal",
         "normal",
         "normal",
         "normal",
         "normal",
       ]))},
       ${sqlLiteral(createdAt)}
     )
     ON CONFLICT(user_id) DO UPDATE SET
       desired_retention = 0.9,
       r_floor = 0.8,
       updated_at = excluded.updated_at;`,
  );

  const ratings = [1, 2, 3, 3, 3, 4, 4];
  let logN = 0;

  for (let i = 0; i < CARD_COUNT; i++) {
    const cardId = `${PREFIX}card-${String(i).padStart(3, "0")}`;
    const deckId = i % 3 === 0 ? DECK_B : LOCAL_DECK_ID;
    const difficulty = 3 + rand() * 6;
    const stability = 2 + rand() * 40;
    const reps = 2 + Math.floor(rand() * 12);
    const lapses = Math.floor(rand() * 3);
    const state = stability > 21 ? 2 : rand() > 0.7 ? 1 : 2;
    const scheduledDays = Math.max(1, Math.round(stability * (0.4 + rand())));

    // Mix due: ~20% overdue, ~25% due today, rest future.
    const dueRoll = rand();
    let due;
    if (dueRoll < 0.2) {
      due = dayIso(now, 1 + Math.floor(rand() * 5), 8);
    } else if (dueRoll < 0.45) {
      due = dayIso(now, 0, 6);
    } else {
      due = dayIso(now, -(1 + Math.floor(rand() * 14)), 10);
    }

    const lastReview = dayIso(now, 1 + Math.floor(rand() * 10), 9);
    const front = JSON.stringify(`Seed Q ${i + 1}?`);
    const back = JSON.stringify(`Seed A ${i + 1}`);
    const provenance = JSON.stringify({ pages: [1], excerpt: "seed" });

    lines.push(
      `INSERT INTO cards (
         id, deck_id, job_id, type, front_json, back_json, media_r2_keys_json,
         provenance_json, status, created_at, updated_at
       ) VALUES (
         ${sqlLiteral(cardId)},
         ${sqlLiteral(deckId)},
         NULL,
         'qa',
         ${sqlLiteral(front)},
         ${sqlLiteral(back)},
         NULL,
         ${sqlLiteral(provenance)},
         'accepted',
         ${sqlLiteral(dayIso(now, DAYS, 12))},
         ${sqlLiteral(createdAt)}
       );`,
    );

    lines.push(
      `INSERT INTO card_schedules (
         card_id, due, stability, difficulty, elapsed_days, scheduled_days,
         learning_steps, reps, lapses, state, last_review
       ) VALUES (
         ${sqlLiteral(cardId)},
         ${sqlLiteral(due)},
         ${stability.toFixed(3)},
         ${difficulty.toFixed(3)},
         ${(0.5 + rand() * 5).toFixed(3)},
         ${scheduledDays},
         0,
         ${reps},
         ${lapses},
         ${state},
         ${sqlLiteral(lastReview)}
       );`,
    );

    // 4–14 reviews per card across the window.
    const reviewCount = 4 + Math.floor(rand() * 11);
    for (let r = 0; r < reviewCount; r++) {
      const daysAgo = Math.floor(rand() * DAYS);
      // Skip ~18% of calendar days overall by biasing some cards quieter.
      if (rand() < 0.12) continue;
      const hour = 7 + Math.floor(rand() * 14);
      const rating = ratings[Math.floor(rand() * ratings.length)];
      const elapsed = Math.floor(rand() * 8);
      // Maturity uses pre-review scheduled_days (>= 21 = mature). Mix buckets.
      const maturityRoll = rand();
      const sched =
        maturityRoll < 0.28
          ? 21 + Math.floor(rand() * 40)
          : maturityRoll < 0.7
            ? 1 + Math.floor(rand() * 20)
            : Math.floor(rand() * 8);
      // Learning/Relearning (~22%); rest Review so young/mature can apply.
      const logState = rand() < 0.22 ? 1 : 2;
      const logId = `${PREFIX}log-${String(logN++).padStart(4, "0")}`;
      lines.push(
        `INSERT INTO review_logs (
           id, card_id, rating, scheduled_days, elapsed_days, reviewed_at, state_json
         ) VALUES (
           ${sqlLiteral(logId)},
           ${sqlLiteral(cardId)},
           ${rating},
           ${sched},
           ${elapsed},
           ${sqlLiteral(dayIso(now, daysAgo, hour, Math.floor(rand() * 50)))},
           ${sqlLiteral(JSON.stringify({ state: logState }))}
         );`,
      );
    }
  }

  const dir = join(tmpdir(), "sugarplum-seed-insights");
  mkdirSync(dir, { recursive: true });
  const sqlPath = join(dir, "local-insights-seed.sql");
  writeFileSync(sqlPath, lines.join("\n"));

  console.log(
    `Seeding ${CARD_COUNT} cards + review history for ${LOCAL_USER_ID}…`,
  );
  run("npx", ["wrangler", "d1", "execute", DB_NAME, "--local", "--file", sqlPath]);
  console.log("");
  console.log("Done. Reload /insights as dev@local.test.");
  console.log(`  cards:  ${CARD_COUNT} (ids ${PREFIX}card-*)`);
  console.log(`  logs:   ~${logN} review_logs`);
  console.log(`  decks:  Local Atlas FR + Local Insights FR`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
