# Canine (IVALA): credits

Mesh source: Ivala GmbH / IVALA Learn (composed mega).

Member packs:
- `canine-skeleton` → region `skeleton` (scale 1, rotateZ 180, filtered 51)
- `canine-internal-organs` → region `organs` (scale 1, rotateZ 180, filtered 10)
- `canine-full-body-ecorche` → region `muscles` (scale 0.10003750802854244, rotateZ 180, filtered 19)
- `canine-surface-topography` → region `surface` (scale 0.00986331917336191, rotateZ 180, filtered 36)
- `canine-brachial-plexus` → region `brachial-plexus` (scale 1, rotateZ 180)


## Seating policy (honest)

- **Accepted (5):** origin-scale or bone-stub / MeshRenderer only.
  Never `@auto:center` (it blows local packs up to skeleton size).
- **Deferred (53) until MeshRenderer bake** (`/tmp/rea-ivala/inner-raw/*.unity3d`):
  - `canine-abdo-radiography`
  - `canine-abdo-vasculature-arterial`
  - `canine-abdo-vasculature-venous`
  - `canine-abdomen-organs`
  - `canine-abdominal-vasculature`
  - `canine-autonomic-nervous-system`
  - `canine-body-wall-musculature`
  - `canine-brain-key-structures`
  - `canine-brain-ventricles`
  - `canine-bronchial-tree`
  - `canine-cervical-spine`
  - `canine-chest-abdo-arteries`
  - `canine-cranial-nerves`
  - `canine-dental-nerve-blocks`
  - `canine-entire-spine`
  - `canine-eye-muscles`
  - `canine-eye-schematic`
  - `canine-foramina-and-teeth`
  - `canine-forelimb-arteries`
  - `canine-forelimb-bones`
  - `canine-forelimb-bony-landmarks`
  - `canine-forelimb-musculature`
  - `canine-forelimb-musculature-scan`
  - `canine-forelimb-veins`
  - `canine-heart-internal-topology`
  - `canine-heart-right-ventricle-removed`
  - `canine-heart-surface-topology`
  - `canine-heart-vasculature`
  - `canine-hemisection-scan`
  - `canine-hemithorax`
  - `canine-hindlimb-arteries`
  - `canine-hindlimb-bones`
  - `canine-hindlimb-bony-landmarks`
  - `canine-hindlimb-musculature`
  - `canine-hindlimb-musculature-scan`
  - `canine-hindlimb-veins`
  - `canine-kidney`
  - `canine-larynx`
  - `canine-liver-scan`
  - `canine-lumbar-spine`
  - `canine-lung-fields-opaque`
  - `canine-lung-fields-transparent`
  - `canine-male-urogenital-scan`
  - `canine-middle-and-inner-ear`
  - `canine-skull-bones`
  - `canine-skull-canals`
  - `canine-skull-landmarks`
  - `canine-skull-muscles`
  - `canine-skull-scan-landmarks`
  - `canine-skull-sinuses`
  - `canine-stifle`
  - `canine-thoracic-spine`
  - `canine-vulva`
- Report: `docs/anatomy/canine-ivala-seating-report.json`

## License

Commercial use and redistribution in Sugarplum under letter ref
**IVALA/SPL/2026-001** (dated 14 November 2026), confirmed for this pack and
the wider listed catalog by email 2026-11-13. Same-origin hosting; Sugarplum
scene manifests; redistribute asset files to end users as part of the app.
Royalty-free, worldwide, perpetual, non-exclusive. Attribution optional;
“Powered by IVALA” appreciated.

Rights memo: `.superpowers/memos/2026-11-13-ivala-redistribution-rights.md`
(letterhead under `.superpowers/memos/ivala/`).

Compose: `scripts/compose-anatomy-mega.mjs` (uniform origin scale + optional
shared rotate-z / center-align bake; see
`.superpowers/memos/2026-11-14-canine-ivala-align-spike.md`).
