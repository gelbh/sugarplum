# canine-ivala: deferred packs (need MeshRenderer / shape gate)

## Why they do not line up

Most IVALA topic packs are **different content scenes** (often a different posed
canine), not slices of the mega skeleton. Mesh-only ingest also drops Unity
`MeshRenderer` world transforms. A uniform “scale pack AABB to skeleton +
center” bake makes metrics look green while a heart becomes dog-sized at the
body COM. That policy is removed.

**Centroid Kabsch is not enough.** Named bones can nearest-neighbor well while
proportions/pose still look wrong in FR (see `canine-forelimb-bones` spike
2026-11-16: nn_med≈6e-4, limb still read as a different dog).

## What seats today (mega members)

| Pack | How |
|------|-----|
| `canine-skeleton` | Base |
| `canine-internal-organs` | MeshRenderer bake already on leaf; `@none:none` + rotZ 180 |
| `canine-full-body-ecorche` | Bone-stub diag scale + `align=none` (strip `b_*`) |
| `canine-surface-topography` | Origin scale (IoU ≥ 0.85); strip `k9_*` |
| `canine-brachial-plexus` | Kabsch `B_*`→skeleton; `@none:none`. Colors from IVALA `_DiffuseBaseColor` / `_DiffuseTexture` |

All other `canine-*` leaves stay in the hub as standalone packs (including
`canine-forelimb-bones`).

## Promote gate (before adding a region to the mega)

Do **not** promote on centroid Kabsch alone. Require all of:

1. **Shared body evidence**: bone stubs from the same assembly, or MeshRenderer
   bake into organs/skeleton frame (`b_rib_cage` / `b_rib_cage_original`), or
   prior FR-proven co-registration.
2. **Shape check** on ≥3 paired anchors (after seating, vs skeleton side-split
   if bilateral): median point-to-surface nn **and** per-bone diagonal ratio
   in roughly `[0.92, 1.08]` (reject when scale spreads like scapula vs radius
   needing different `s`).
3. **FR overlay**: with skeleton on, the pack reads as the same limb/organ, not
   a second dog glued at one joint.
4. **Honest compose**: `@none:none` (or proven bone-stub scale). Never
   `@auto:center` fraud.

Fail any gate → keep hub leaf. Optional later: mega “study overlay” region that
does **not** claim skeleton lock (explicit unseated flag) if product wants one
toggle list without lying about registration.

## Unlock attempt (2026-11-16 re-scrape)

1. Restored REA archive: `/tmp/rea-ivala/inner-raw/*.unity3d` (60/60 canine).
2. Re-baked organs / ecorché; recomposed. Honest members only.
3. Batch MeshRenderer re-export of deferred leaves improves **standalone** leaf
   quality. Does **not** invent cross-scene seating.
4. `canine-forelimb-bones` Kabsch spike: bilateral skeleton long bones need
   side-split; even then the topic limb is a different canine → **deferred**
   (hub only).

### Probe finding

- Only `canine_internal_organs` embeds `b_rib_cage`; ecorché embeds
  `b_rib_cage_original`. Other canine unity3d scenes have **no** `b_*` align
  stub.
- Shared mesh names with the skeleton exist in a few packs, but Unity world
  frames and **authored proportions** differ across content scenes.
- Catalog has **no** overlay transform metadata; each CSB is standalone.

## Commands

```bash
# organs / ecorché (bone-local)
python3 scripts/export-unity-meshrenderer-glbs.py \
  --unity3d=/tmp/rea-ivala/inner-raw/canine_internal_organs.unity3d \
  --out=/tmp/rea-ivala/meshrenderer-organs \
  --align-ref=b_rib_cage --max-tex-edge=2048

# deferred leaves (standalone quality only)
node scripts/batch-meshrenderer-deferred-canine.mjs
node scripts/compose-canine-ivala-complete.mjs
```
