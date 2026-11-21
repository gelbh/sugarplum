#!/usr/bin/env node
/**
 * Local-only orchard FR seed: due cards + gamification state for Overview poke.
 * Idempotent for its own rows (ids prefixed seed-orchard-*).
 * Prerequisite: npm run db:seed:local (user + deck).
 * Usage: npm run db:seed:local:orchard
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
const PREFIX = "seed-orchard-";
const BOARD_PREFIX = "seed-board-";
const BOARD_USER_PREFIX = "00000000-0000-4000-8000-00000000b0";
const CARD_COUNT = 15;
const REVIEWS_TODAY = 3;
const DAILY_GOAL = 10;

/** Weekly XP keeps Local mid-pack; xp_total keeps the same order all-time. */
const BOARD_PEERS = [
  {
    id: `${BOARD_USER_PREFIX}01`,
    email: "board-peer-alpha@local.test",
    name: "Alpha Plum",
    weekXp: 350,
    totalXp: 800,
    level: 4,
  },
  {
    id: `${BOARD_USER_PREFIX}02`,
    email: "board-peer-beta@local.test",
    name: "Beta Berry",
    weekXp: 280,
    totalXp: 450,
    level: 3,
  },
  {
    id: `${BOARD_USER_PREFIX}03`,
    email: "board-peer-cherry@local.test",
    name: "Cherry Mid",
    weekXp: 150,
    totalXp: 220,
    level: 2,
  },
  {
    id: `${BOARD_USER_PREFIX}99`,
    email: "board-peer-optout@local.test",
    name: "Opt Out Oak",
    weekXp: 999,
    totalXp: 9999,
    level: 9,
    optedIn: false,
  },
];
const LOCAL_WEEK_TODAY_XP = 100;
const LOCAL_WEEK_EARLIER_XP = 200;
const LOCAL_TOTAL_XP = 500;

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function utcDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function utcPreviousDay(day) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** Far enough back that it cannot fall in the current ISO week. */
function utcDaysAgo(day, days) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
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
  const now = new Date();
  const today = utcDay(now);
  const yesterday = utcPreviousDay(today);
  const priorWeekDay = utcDaysAgo(today, 10);
  const createdAt = now.toISOString();
  const dueIso = `${today}T00:00:00.000Z`;
  const lines = [];

  lines.push(`-- wipe prior orchard + board FR seed`);
  lines.push(
    `DELETE FROM review_logs WHERE id LIKE ${sqlLiteral(`${PREFIX}%`)};`,
  );
  lines.push(
    `DELETE FROM card_schedules WHERE card_id LIKE ${sqlLiteral(`${PREFIX}%`)};`,
  );
  lines.push(`DELETE FROM cards WHERE id LIKE ${sqlLiteral(`${PREFIX}%`)};`);
  lines.push(
    `DELETE FROM xp_ledger WHERE id LIKE ${sqlLiteral(`${PREFIX}%`)};`,
  );
  lines.push(
    `DELETE FROM xp_ledger WHERE id LIKE ${sqlLiteral(`${BOARD_PREFIX}%`)};`,
  );
  lines.push(
    `DELETE FROM streak_freeze_events WHERE id LIKE ${sqlLiteral(`${PREFIX}%`)};`,
  );
  lines.push(
    `DELETE FROM user_gamification WHERE user_id LIKE ${sqlLiteral(`${BOARD_USER_PREFIX}%`)};`,
  );
  lines.push(
    `DELETE FROM users WHERE id LIKE ${sqlLiteral(`${BOARD_USER_PREFIX}%`)};`,
  );

  lines.push(
    `INSERT INTO user_gamification (
       user_id, streak_current, streak_best, streak_day,
       xp_total, level, display_name, board_opt_in, updated_at,
       clear_due_days, clear_due_last_day, catalog_version,
       streak_freezes, daily_goal_reviews, daily_goal_day
     ) VALUES (
       ${sqlLiteral(LOCAL_USER_ID)},
       5,
       7,
       ${sqlLiteral(today)},
       ${LOCAL_TOTAL_XP},
       3,
       'Local Orchard',
       1,
       ${sqlLiteral(createdAt)},
       0,
       NULL,
       2,
       1,
       ${DAILY_GOAL},
       NULL
     )
     ON CONFLICT(user_id) DO UPDATE SET
       streak_current = 5,
       streak_best = MAX(user_gamification.streak_best, 7),
       streak_day = ${sqlLiteral(today)},
       xp_total = ${LOCAL_TOTAL_XP},
       level = MAX(user_gamification.level, 3),
       display_name = 'Local Orchard',
       board_opt_in = 1,
       streak_freezes = 1,
       daily_goal_reviews = ${DAILY_GOAL},
       daily_goal_day = NULL,
       updated_at = ${sqlLiteral(createdAt)};`,
  );

  // Prior ISO-week residue so total > this week; excluded from weekly board.
  lines.push(
    `INSERT INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at)
     VALUES (
       ${sqlLiteral(`${BOARD_PREFIX}local-hist`)},
       ${sqlLiteral(LOCAL_USER_ID)},
       ${LOCAL_TOTAL_XP - LOCAL_WEEK_TODAY_XP - LOCAL_WEEK_EARLIER_XP},
       'seed',
       ${sqlLiteral(`${BOARD_PREFIX}local-hist`)},
       ${sqlLiteral(`${priorWeekDay}T15:00:00.000Z`)}
     )
     ON CONFLICT(user_id, idempotency_key) DO UPDATE SET
       amount = excluded.amount,
       created_at = excluded.created_at;`,
  );
  lines.push(
    `INSERT INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at)
     VALUES (
       ${sqlLiteral(`${BOARD_PREFIX}local-week`)},
       ${sqlLiteral(LOCAL_USER_ID)},
       ${LOCAL_WEEK_EARLIER_XP},
       'seed',
       ${sqlLiteral(`${BOARD_PREFIX}local-week`)},
       ${sqlLiteral(`${yesterday}T18:00:00.000Z`)}
     )
     ON CONFLICT(user_id, idempotency_key) DO UPDATE SET
       amount = excluded.amount,
       created_at = excluded.created_at;`,
  );
  lines.push(
    `INSERT INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at)
     VALUES (
       ${sqlLiteral(`${BOARD_PREFIX}local-today`)},
       ${sqlLiteral(LOCAL_USER_ID)},
       ${LOCAL_WEEK_TODAY_XP},
       'seed',
       ${sqlLiteral(`${BOARD_PREFIX}local-today`)},
       ${sqlLiteral(`${today}T11:00:00.000Z`)}
     )
     ON CONFLICT(user_id, idempotency_key) DO UPDATE SET
       amount = excluded.amount,
       created_at = excluded.created_at;`,
  );

  for (const peer of BOARD_PEERS) {
    const optedIn = peer.optedIn !== false ? 1 : 0;
    const prior = peer.totalXp - peer.weekXp;
    lines.push(
      `INSERT INTO users (id, email, password_hash, oauth_subject, created_at, sandbox_of)
       VALUES (
         ${sqlLiteral(peer.id)},
         ${sqlLiteral(peer.email)},
         NULL,
         NULL,
         ${sqlLiteral(createdAt)},
         NULL
       )
       ON CONFLICT(id) DO NOTHING;`,
    );
    lines.push(
      `INSERT INTO user_gamification (
         user_id, streak_current, streak_best, streak_day,
         xp_total, level, display_name, board_opt_in, updated_at,
         clear_due_days, clear_due_last_day, catalog_version,
         streak_freezes, daily_goal_reviews, daily_goal_day
       ) VALUES (
         ${sqlLiteral(peer.id)},
         0,
         0,
         NULL,
         ${peer.totalXp},
         ${peer.level},
         ${sqlLiteral(peer.name)},
         ${optedIn},
         ${sqlLiteral(createdAt)},
         0,
         NULL,
         2,
         0,
         ${DAILY_GOAL},
         NULL
       )
       ON CONFLICT(user_id) DO UPDATE SET
         xp_total = ${peer.totalXp},
         level = ${peer.level},
         display_name = ${sqlLiteral(peer.name)},
         board_opt_in = ${optedIn},
         updated_at = ${sqlLiteral(createdAt)};`,
    );
    if (prior > 0) {
      lines.push(
        `INSERT INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at)
         VALUES (
           ${sqlLiteral(`${BOARD_PREFIX}${peer.id.slice(-2)}-hist`)},
           ${sqlLiteral(peer.id)},
           ${prior},
           'seed',
           ${sqlLiteral(`${BOARD_PREFIX}${peer.id.slice(-2)}-hist`)},
           ${sqlLiteral(`${priorWeekDay}T12:00:00.000Z`)}
         )
         ON CONFLICT(user_id, idempotency_key) DO UPDATE SET
           amount = excluded.amount,
           created_at = excluded.created_at;`,
      );
    }
    lines.push(
      `INSERT INTO xp_ledger (id, user_id, amount, reason, idempotency_key, created_at)
       VALUES (
         ${sqlLiteral(`${BOARD_PREFIX}${peer.id.slice(-2)}-week`)},
         ${sqlLiteral(peer.id)},
         ${peer.weekXp},
         'seed',
         ${sqlLiteral(`${BOARD_PREFIX}${peer.id.slice(-2)}-week`)},
         ${sqlLiteral(`${today}T09:00:00.000Z`)}
       )
       ON CONFLICT(user_id, idempotency_key) DO UPDATE SET
         amount = excluded.amount,
         created_at = excluded.created_at;`,
    );
  }

  for (let i = 0; i < CARD_COUNT; i++) {
    const cardId = `${PREFIX}card-${String(i).padStart(3, "0")}`;
    const front = JSON.stringify(`Orchard seed Q ${i + 1}?`);
    const back = JSON.stringify(`Orchard seed A ${i + 1}`);
    lines.push(
      `INSERT INTO cards (
         id, deck_id, job_id, type, front_json, back_json, media_r2_keys_json,
         provenance_json, status, created_at, updated_at
       ) VALUES (
         ${sqlLiteral(cardId)},
         ${sqlLiteral(LOCAL_DECK_ID)},
         NULL,
         'qa',
         ${sqlLiteral(front)},
         ${sqlLiteral(back)},
         NULL,
         ${sqlLiteral(JSON.stringify({ pages: [1], excerpt: "orchard seed" }))},
         'accepted',
         ${sqlLiteral(createdAt)},
         ${sqlLiteral(createdAt)}
       )
       ON CONFLICT(id) DO UPDATE SET
         status = 'accepted',
         updated_at = excluded.updated_at;`,
    );
    lines.push(
      `INSERT INTO card_schedules (
         card_id, due, stability, difficulty, elapsed_days, scheduled_days,
         learning_steps, reps, lapses, state, last_review
       ) VALUES (
         ${sqlLiteral(cardId)},
         ${sqlLiteral(dueIso)},
         5.0,
         5.0,
         1.0,
         1,
         0,
         2,
         0,
         2,
         ${sqlLiteral(`${yesterday}T12:00:00.000Z`)}
       )
       ON CONFLICT(card_id) DO UPDATE SET
         due = ${sqlLiteral(dueIso)},
         last_review = excluded.last_review;`,
    );
  }

  for (let i = 0; i < REVIEWS_TODAY; i++) {
    const cardId = `${PREFIX}card-${String(i).padStart(3, "0")}`;
    const logId = `${PREFIX}log-today-${String(i).padStart(2, "0")}`;
    lines.push(
      `INSERT INTO review_logs (
         id, card_id, rating, scheduled_days, elapsed_days, reviewed_at, state_json
       ) VALUES (
         ${sqlLiteral(logId)},
         ${sqlLiteral(cardId)},
         3,
         1,
         1,
         ${sqlLiteral(`${today}T10:${String(i).padStart(2, "0")}:00.000Z`)},
         ${sqlLiteral(JSON.stringify({ state: 2 }))}
       )
       ON CONFLICT(id) DO NOTHING;`,
    );
  }

  const dir = join(tmpdir(), "sugarplum-seed-orchard");
  mkdirSync(dir, { recursive: true });
  const sqlPath = join(dir, "local-orchard-seed.sql");
  writeFileSync(sqlPath, lines.join("\n"));

  console.log("Seeding orchard FR cards + gamification…");
  run("npx", [
    "wrangler",
    "d1",
    "execute",
    DB_NAME,
    "--local",
    "--file",
    sqlPath,
  ]);
  console.log("");
  console.log("Orchard seed ready for dev@local.test:");
  console.log(`  streak:     5 (studied ${today} UTC)`);
  console.log(`  freezes:    1`);
  console.log(`  daily goal: ${REVIEWS_TODAY} / ${DAILY_GOAL} reviews today`);
  console.log(
    `  board:      Local #2 week ${LOCAL_WEEK_TODAY_XP + LOCAL_WEEK_EARLIER_XP} XP / all-time ${LOCAL_TOTAL_XP} XP`,
  );
  console.log(`  due cards:  ${CARD_COUNT} (${PREFIX}card-*)`);
  console.log("  Open /achievements and / (Today study queue).");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
