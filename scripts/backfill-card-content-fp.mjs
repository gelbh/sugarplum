#!/usr/bin/env node
/**
 * Backfill cards.content_fp and archive live null-claim fingerprint extras.
 * Run after migrations/0038; before applying the unique index SQL.
 *
 * Usage:
 *   node scripts/backfill-card-content-fp.mjs --local [--dry-run]
 *   node scripts/backfill-card-content-fp.mjs --remote [--dry-run]
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const remote = args.has("--remote");
const local = args.has("--local");
if (remote === local) {
  console.error("Pass exactly one of --local or --remote");
  process.exit(1);
}

const BATCH = 80;
const flag = remote ? "--remote" : "--local";

function normalizeCardField(s) {
  return s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function frontToFingerprintText(front) {
  if (typeof front === "string") return normalizeCardField(front);
  if (front == null) return "";
  return normalizeCardField(JSON.stringify(front));
}

function normalizeBackField(back) {
  if (typeof back === "string") return normalizeCardField(back);
  if (back == null) return "";
  return normalizeCardField(JSON.stringify(back));
}

function assemblePayload({ type, front, mediaR2Keys, back, options }) {
  const media = [...(mediaR2Keys ?? [])].filter(Boolean).sort().join("\0");
  const parts = [type, frontToFingerprintText(front), media];
  if (type === "mcq") {
    const opts = [...(options ?? [])]
      .map((o) => normalizeCardField(o))
      .sort()
      .join("\0");
    parts.push(normalizeBackField(back), opts);
  } else if (type === "image_label" || type === "diagram") {
    parts.push(normalizeBackField(back));
  }
  return parts.join("\0");
}

function fingerprintHex(input) {
  return createHash("sha256").update(assemblePayload(input)).digest("hex");
}

function parseWranglerJson(raw) {
  const start = Math.min(
    ...["[", "{"].map((ch) => {
      const i = raw.indexOf(ch);
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    }),
  );
  if (!Number.isFinite(start)) {
    throw new Error(`wrangler returned no JSON:\n${raw}`);
  }
  return JSON.parse(raw.slice(start));
}

/** SELECT via --command ( --file returns a summary row, not result rows ). */
function wranglerSelect(commandSql) {
  const sql = commandSql.replace(/\s+/g, " ").trim();
  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "sugarplum", flag, "--json", "--command", sql],
    { encoding: "utf8", cwd: process.cwd() },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  const parsed = parseWranglerJson(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  const rows = block?.results ?? [];
  if (rows.length > 0 && rows[0].id == null) {
    console.error("SELECT did not return card rows:", rows[0]);
    process.exit(1);
  }
  return rows;
}

/** Batched writes via --file (summary OK; we only need exit status). */
function wranglerExecBatch(statements) {
  if (statements.length === 0) return;
  const dir = mkdtempSync(join(tmpdir(), "sugarplum-fp-"));
  const file = join(dir, "q.sql");
  writeFileSync(file, `${statements.join("\n")}\n`, "utf8");
  const result = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "sugarplum", flag, "--json", "--file", file],
    { encoding: "utf8", cwd: process.cwd() },
  );
  rmSync(dir, { recursive: true, force: true });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function parseFront(frontJson) {
  try {
    return JSON.parse(frontJson);
  } catch {
    return frontJson;
  }
}

function parseMedia(mediaJson) {
  if (!mediaJson) return null;
  try {
    const v = JSON.parse(mediaJson);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function parseMcq(backJson) {
  try {
    const v = JSON.parse(backJson);
    if (v && typeof v === "object" && typeof v.answer === "string") {
      return { back: v.answer, options: v.options ?? [] };
    }
  } catch {}
  return { back: undefined, options: null };
}

const rows = wranglerSelect(`
SELECT id, deck_id, type, front_json, back_json, media_r2_keys_json, claim_id, status, created_at
FROM cards
WHERE status IN ('draft', 'accepted');
`);

let updated = 0;
const groups = new Map();
const updates = [];

for (const row of rows) {
  const front = parseFront(row.front_json);
  const media = parseMedia(row.media_r2_keys_json);
  let back;
  let options;
  if (row.type === "mcq") {
    const mcq = parseMcq(row.back_json);
    back = mcq.back;
    options = mcq.options;
  } else if (row.type === "image_label" || row.type === "diagram") {
    try {
      back = JSON.parse(row.back_json);
    } catch {
      back = row.back_json;
    }
  }
  const fp = fingerprintHex({
    type: row.type,
    front,
    mediaR2Keys: media,
    back,
    options,
  });
  updates.push(
    `UPDATE cards SET content_fp = '${esc(fp)}' WHERE id = '${esc(row.id)}';`,
  );
  updated += 1;
  if (row.claim_id != null) continue;
  const key = `${row.deck_id}\0${fp}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ ...row, content_fp: fp });
}

let archived = 0;
let dupGroups = 0;
const now = new Date().toISOString();
const archives = [];
for (const members of groups.values()) {
  if (members.length <= 1) continue;
  dupGroups += 1;
  members.sort((a, b) => {
    const rank = (s) => (s === "accepted" ? 0 : 1);
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    const t = a.created_at.localeCompare(b.created_at);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
  for (const loser of members.slice(1)) {
    archives.push(
      `UPDATE cards SET status = 'archived', updated_at = '${esc(now)}' WHERE id = '${esc(loser.id)}';`,
    );
    archived += 1;
  }
}

if (!dryRun) {
  for (let i = 0; i < updates.length; i += BATCH) {
    wranglerExecBatch(updates.slice(i, i + BATCH));
    console.error(`fp updates ${Math.min(i + BATCH, updates.length)}/${updates.length}`);
  }
  for (let i = 0; i < archives.length; i += BATCH) {
    wranglerExecBatch(archives.slice(i, i + BATCH));
    console.error(
      `archives ${Math.min(i + BATCH, archives.length)}/${archives.length}`,
    );
  }
}

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "write",
      target: remote ? "remote" : "local",
      updated,
      dupGroups,
      archived,
    },
    null,
    2,
  ),
);
