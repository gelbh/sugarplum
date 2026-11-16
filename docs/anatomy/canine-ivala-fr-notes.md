# canine-ivala FR (lazy regions)

- `/anatomy/canine-ivala` on local Vite: only `skeleton/*.glb` fetched at open (51 structures).
- Region panel families: Skeleton, Muscles, Organs, Nerves, Vessels, Skull, Spine.
- Toggle ecorché (`muscles`) and brachial plexus: incremental GLB fetches under those region dirs; skeleton not remounted.
- Seating report: `docs/anatomy/canine-ivala-seating-report.json` (**5 accepted / 53 deferred**). Honest gate only (no `@auto:center`).
- 2026-11-16: re-scraped 60 canine unity3d; MeshRenderer re-bake organs + ecorché; deferred batch world-bake re-ingest (`docs/anatomy/canine-ivala-meshrenderer-batch.json`). Standalone leaves improved; mega membership unchanged (topic scenes lack shared bone frame).
- Leaf packs copy-before-bake on compose.
