#!/usr/bin/env node
/**
 * MeshRenderer re-export + re-ingest for deferred canine packs.
 *
 * Most deferred IVALA scenes are standalone topic models (no shared b_rib_cage
 * / skeleton world frame). This wave recovers Unity world transforms + textures
 * for standalone leaf quality. Mega seating still goes through
 * compose-canine-ivala-complete.mjs honest gates (bone stubs / origin IoU /
 * forced MeshRenderer organs).
 *
 * Usage:
 *   node scripts/batch-meshrenderer-deferred-canine.mjs
 *   node scripts/batch-meshrenderer-deferred-canine.mjs --only=canine-kidney,canine-larynx
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INNER = "/tmp/rea-ivala/inner-raw";
const WORK = "/tmp/rea-ivala/meshrenderer-deferred";
const DROP = "/tmp/rea-ivala/drop-deferred";
const REPORT = join(ROOT, "docs/anatomy/canine-ivala-meshrenderer-batch.json");

/** packId → unity3d stem when kebab≠underscore */
const UNITY_STEM = {
  "canine-cranial-nerves": "canine_cranial_nerves_refresh",
  "canine-hindlimb-musculature-scan": "canine_hindlimb_musc_scan",
};

/** Prefer bone-local when the unity3d embeds that stub. */
const ALIGN_REF = {
  "canine-internal-organs": "b_rib_cage",
  "canine-full-body-ecorche": "b_rib_cage_original",
};

function argList(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return null;
  return hit
    .slice(prefix.length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function titleCase(packId) {
  return packId
    .replace(/^canine-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    cwd: ROOT,
    ...opts,
  });
  return r;
}

function main() {
  const reportPath = join(ROOT, "docs/anatomy/canine-ivala-seating-report.json");
  const seating = JSON.parse(readFileSync(reportPath, "utf8"));
  const only = argList("only");
  const deferred = only ?? seating.deferred;
  mkdirSync(WORK, { recursive: true });
  mkdirSync(DROP, { recursive: true });

  const results = [];
  for (const packId of deferred) {
    const stem = UNITY_STEM[packId] ?? packId.replace(/-/g, "_");
    const unity3d = join(INNER, `${stem}.unity3d`);
    const out = join(WORK, packId);
    const drop = join(DROP, packId);
    const align = ALIGN_REF[packId] ?? "world";
    const row = { packId, stem, unity3d, align, ok: false };

    if (!existsSync(unity3d)) {
      row.error = "missing unity3d";
      results.push(row);
      console.log(`SKIP ${packId}: missing ${unity3d}`);
      continue;
    }

    console.log(`\n=== ${packId} align=${align} ===`);
    const exportArgs = [
      join(ROOT, "scripts/export-unity-meshrenderer-glbs.py"),
      `--unity3d=${unity3d}`,
      `--out=${out}`,
      `--align-ref=${align}`,
      "--max-tex-edge=2048",
      "--include-skinned",
    ];
    const exp = run("python3", exportArgs);
    writeFileSync(
      join(WORK, `${packId}.export.log`),
      `${exp.stdout || ""}\n${exp.stderr || ""}`,
    );
    if (exp.status !== 0) {
      row.error = `export rc=${exp.status}`;
      row.logTail = (exp.stderr || exp.stdout || "").slice(-500);
      results.push(row);
      console.log(`FAIL export ${packId}`);
      continue;
    }

    const glbDir = join(out, "glb");
    if (!existsSync(glbDir) || readdirSync(glbDir).filter((f) => f.endsWith(".glb")).length === 0) {
      row.error = "no glbs";
      results.push(row);
      console.log(`FAIL empty ${packId}`);
      continue;
    }

    // Sanitize names into drop dir via python
    const prep = run("python3", [
      "-c",
      `
import re, shutil
from pathlib import Path
src=Path(${JSON.stringify(glbDir)})
drop=Path(${JSON.stringify(drop)})
if drop.exists(): shutil.rmtree(drop)
drop.mkdir(parents=True)
n=0
for p in src.glob("*.glb"):
  safe=re.sub(r"[^A-Za-z0-9._-]+", "_", p.stem)
  shutil.copy2(p, drop/f"{safe}.glb"); n+=1
print(n)
`,
    ]);
    if (prep.status !== 0) {
      row.error = "drop prep failed";
      results.push(row);
      continue;
    }
    row.meshCount = Number((prep.stdout || "").trim().split("\n").pop());

    const ing = run("node", [
      join(ROOT, "scripts/ingest-anatomy-pack.mjs"),
      `--src=${drop}`,
      `--packId=${packId}`,
      `--title=Canine ${titleCase(packId).replace(/^Canine /, "")}`,
    ]);
    writeFileSync(
      join(WORK, `${packId}.ingest.log`),
      `${ing.stdout || ""}\n${ing.stderr || ""}`,
    );
    if (ing.status !== 0) {
      row.error = `ingest rc=${ing.status}`;
      row.logTail = (ing.stderr || ing.stdout || "").slice(-500);
      results.push(row);
      console.log(`FAIL ingest ${packId}`);
      continue;
    }

    // Restore license CREDITS from a sibling that still has the letterhead block
    // when ingest wrote a TODO stub; keep MeshRenderer note.
    const creditsPath = join(ROOT, "public/anatomy", packId, "CREDITS.md");
    if (existsSync(creditsPath)) {
      let credits = readFileSync(creditsPath, "utf8");
      if (credits.includes("Rights path: TODO")) {
        const template = readFileSync(
          join(ROOT, "public/anatomy/canine-skeleton/CREDITS.md"),
          "utf8",
        );
        const license = template.split("## License")[1]?.split("Ingest:")[0];
        if (license) {
          credits = `# ${titleCase(packId)}: credits\n\nMesh source: Ivala GmbH / IVALA Learn (${packId}).\n\n## License\n${license}Ingest: \`scripts/ingest-anatomy-pack.mjs\` (local drop only; Path A).\nTextures: MeshRenderer re-export via \`scripts/export-unity-meshrenderer-glbs.py\` (\`--align-ref=${align}\`).\n`;
          writeFileSync(creditsPath, credits);
        }
      } else if (!credits.includes("MeshRenderer")) {
        credits += `\nTextures: MeshRenderer re-export via \`scripts/export-unity-meshrenderer-glbs.py\` (\`--align-ref=${align}\`).\n`;
        writeFileSync(creditsPath, credits);
      }
    }

    row.ok = true;
    results.push(row);
    console.log(`OK ${packId} meshes=${row.meshCount}`);
  }

  const summary = {
    ok: results.filter((r) => r.ok).length,
    fail: results.filter((r) => !r.ok).length,
    results,
  };
  writeFileSync(REPORT, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\nDONE ok=${summary.ok} fail=${summary.fail} → ${REPORT}`);
}

main();
