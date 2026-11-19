#!/usr/bin/env node
/**
 * Backfill cards.content_fp and archive live null-claim fingerprint extras.
 * Run after migrations/0038; before applying 0039 unique index.
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

function normalizeCardField(s) {
  return s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function frontToFingerprintText(front) {
  if (typeof front === "string") return normalizeCardField(front);
  if (front == null) return "";
  return normalizeCardField(JSON.stringify(front));
}

function assemblePayload({ type, front, mediaR2Keys, back, options }) {
  const media = [...(mediaR2Keys ?? [])].filter(Boolean).sort().join("\0");
  const parts = [type, frontToFingerprintText(front), media];
  if (type === "mcq") {
    const answer =
      typeof back === "string"
        ? normalizeCardField(back)
        : normalizeCardField(JSON.stringify(back ?? ""));
    const opts = [...(options ?? [])]
      .map((o) => normalizeCardField(o))
      .sort()
      .join("\0");
    parts.push(answer, opts);
  }
  return parts.join("\0");
}

function fingerprintHex(input) {
  return createHash("sha256").update(assemblePayload(input)).digest("hex");
}

function wranglerJson(commandSql) {
  const dir = mkdtempSync(join(tmpdir(), "sugarplum-fp-"));
  const file = join(dir, "q.sql");
  writeFileSync(file, commandSql, "utf8");
  const flag = remote ? "--remote" : "--local";
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
  const parsed = JSON.parse(result.stdout);
  const block = Array.isArray(parsed) ? parsed[0] : parsed;
  return block?.results ?? [];
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
  } catch {
    /* ignore */
  }
  return { back: undefined, options: null };
}

const rows = wranglerJson(`
SELECT id, deck_id, type, front_json, back_json, media_r2_keys_json, claim_id, status, created_at
FROM cards
WHERE status IN ('draft', 'accepted');
`);

let updated = 0;
const groups = new Map();

for (const row of rows) {
  const front = parseFront(row.front_json);
  const media = parseMedia(row.media_r2_keys_json);
  const mcq = row.type === "mcq" ? parseMcq(row.back_json) : {};
  const fp = fingerprintHex({
    type: row.type,
    front,
    mediaR2Keys: media,
    back: mcq.back,
    options: mcq.options,
  });
  if (!dryRun) {
    const esc = fp.replace(/'/g, "''");
    wranglerJson(
      `UPDATE cards SET content_fp = '${esc}' WHERE id = '${row.id.replace(/'/g, "''")}';`,
    );
  }
  updated += 1;
  if (row.claim_id != null) continue;
  const key = `${row.deck_id}\0${fp}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({ ...row, content_fp: fp });
}

let archived = 0;
let dupGroups = 0;
const now = new Date().toISOString();
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
  const losers = members.slice(1);
  for (const loser of losers) {
    if (!dryRun) {
      wranglerJson(
        `UPDATE cards SET status = 'archived', updated_at = '${now}' WHERE id = '${loser.id.replace(/'/g, "''")}';`,
      );
    }
    archived += 1;
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
