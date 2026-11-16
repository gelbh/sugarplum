#!/usr/bin/env node
/**
 * Compose canine-ivala from IVALA canine leaf packs that can actually seat
 * on the skeleton. Packs that need MeshRenderer world transforms are deferred
 * until REA `*.unity3d` is available (see CREDITS / seating report).
 *
 * Usage:
 *   node scripts/compose-canine-ivala-complete.mjs
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { composeAnatomyMega, packBounds } from "./compose-anatomy-mega.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "anatomy");

const SKIP = new Set(["canine", "canine-ivala"]);

/** @param {string} packId */
function labelFor(packId) {
  const scenePath = join(OUT, packId, "scene.json");
  if (existsSync(scenePath)) {
    try {
      const title = JSON.parse(readFileSync(scenePath, "utf8")).title;
      if (typeof title === "string" && title.trim()) return title.trim();
    } catch {
      /* fall through */
    }
  }
  return packId
    .replace(/^canine-/, "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function ecorcheBoneScale() {
  const bone = packBounds(join(OUT, "canine-full-body-ecorche"), {
    bonesOnly: true,
  });
  const skel = packBounds(join(OUT, "canine-skeleton"));
  return skel.diag / bone.diag;
}

function main() {
  const packs = readdirSync(OUT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("canine"))
    .map((d) => d.name)
    .filter((id) => !SKIP.has(id))
    .filter((id) => existsSync(join(OUT, id, "scene.json")))
    .sort();

  if (!packs.includes("canine-skeleton")) {
    throw new Error("canine-skeleton missing");
  }

  const boneScale = ecorcheBoneScale();
  /** @type {Map<string, string | string[]>} */
  const excludeNodePrefixes = new Map([
    ["canine-internal-organs", ["b_", "B_", "oesophagus"]],
    ["canine-full-body-ecorche", ["b_", "B_"]],
    ["canine-surface-topography", "k9_"],
    ["canine-brachial-plexus", ["b_", "B_"]],
  ]);

  /** @type {Array<{packId:string, regionId:string, label:string, scale:any, align:any}>} */
  const members = [];
  /** @type {string[]} */
  const deferred = [];
  /** @type {string[]} */
  const acceptedNotes = [];

  // Always-on known-good seats
  members.push({
    packId: "canine-skeleton",
    regionId: "skeleton",
    label: labelFor("canine-skeleton"),
    scale: "auto",
    align: "none",
  });
  members.push({
    packId: "canine-internal-organs",
    regionId: "organs",
    label: labelFor("canine-internal-organs"),
    scale: "none",
    align: "none",
  });
  members.push({
    packId: "canine-full-body-ecorche",
    regionId: "muscles",
    label: labelFor("canine-full-body-ecorche"),
    scale: boneScale,
    align: "none",
  });
  members.push({
    packId: "canine-surface-topography",
    regionId: "surface",
    label: labelFor("canine-surface-topography"),
    scale: "auto",
    align: "none",
  });
  // Brachial leaf soft tissue is pre-seated by Kabsch on B_*→skeleton bones.
  // Do NOT use align=bones AABB center: that slides a neck/forelimb pack to
  // the full-body COM and makes the plexus look completely wrong.
  members.push({
    packId: "canine-brachial-plexus",
    regionId: "brachial-plexus",
    label: labelFor("canine-brachial-plexus"),
    scale: "none",
    align: "none",
  });
  // canine-forelimb-bones: Kabsch centroids can look green while the limb is a
  // different IVALA canine (pose/proportion). Keep as hub leaf until shape gate.
  acceptedNotes.push(
    "skeleton, organs (MeshRenderer), muscles (bone-stub scale), surface (origin-scale)",
    "canine-brachial-plexus (Kabsch B_*→skeleton, @none:none)",
  );

  // Honest mega: explicit allowlist only. Never auto-promote via bone-stub
  // AABB center or origin-scale IoU (see docs/anatomy/canine-ivala-deferred-meshrenderer.md).
  const forced = new Set(members.map((m) => m.packId));
  for (const packId of packs) {
    if (forced.has(packId)) continue;
    deferred.push(packId);
  }

  // Unique region ids
  const seen = new Set();
  for (const m of members) {
    if (seen.has(m.regionId)) {
      m.regionId = m.packId.replace(/^canine-/, "") || m.packId;
    }
    if (seen.has(m.regionId)) {
      throw new Error(`Duplicate regionId after fix: ${m.regionId}`);
    }
    seen.add(m.regionId);
  }

  const result = composeAnatomyMega({
    megaId: "canine-ivala",
    title: "Canine (IVALA)",
    basePackId: "canine-skeleton",
    members,
    rotateZDeg: 180,
    dedupeSuffix: "_1",
    align: "none",
    excludeNodePrefixes,
  });

  const report = {
    accepted: members.map((m) => m.packId),
    deferred,
    deferredReason:
      "Mesh-only exports lack Unity world transforms. Need MeshRenderer bake from REA inner-raw/*.unity3d. Do not use AABB center-align (fakes whole-body scale). Mega membership is an explicit allowlist only.",
    notes: acceptedNotes,
    unity3dPath: "/tmp/rea-ivala/inner-raw/",
  };
  const reportPath = join(ROOT, "docs/anatomy/canine-ivala-seating-report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  // Append deferred list onto CREDITS
  const creditsPath = join(result.outDir, "CREDITS.md");
  if (existsSync(creditsPath)) {
    let credits = readFileSync(creditsPath, "utf8");
    const block = `

## Seating policy (honest)

- **Accepted (${members.length}):** origin-scale or bone-stub / MeshRenderer only.
  Never \`@auto:center\` (it blows local packs up to skeleton size).
- **Deferred (${deferred.length}) until MeshRenderer bake** (\`/tmp/rea-ivala/inner-raw/*.unity3d\`):
${deferred.map((id) => `  - \`${id}\``).join("\n")}
- Report: \`docs/anatomy/canine-ivala-seating-report.json\`
`;
    if (!credits.includes("## Seating policy (honest)")) {
      credits = credits.replace(/\n## License\n/, `${block}\n## License\n`);
      writeFileSync(creditsPath, credits);
    }
  }

  console.log(
    `canine-ivala: ${result.structureCount} structures, ${result.regionCount} regions, ${result.meshCount} meshes`,
  );
  console.log(`accepted ${members.length}; deferred ${deferred.length} → ${reportPath}`);
}

main();
