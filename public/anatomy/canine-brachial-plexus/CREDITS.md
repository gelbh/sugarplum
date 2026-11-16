# Canine brachial plexus: credits

Mesh source: Ivala GmbH / IVALA Learn (canine brachial plexus).

## License


Commercial use and redistribution in Sugarplum under letter ref
**IVALA/SPL/2026-001** (dated 14 November 2026), confirmed for this pack and
the wider listed catalog by email 2026-11-13. Same-origin hosting; Sugarplum
scene manifests; redistribute asset files to end users as part of the app.
Royalty-free, worldwide, perpetual, non-exclusive. Attribution optional;
“Powered by IVALA” appreciated.

Rights memo: `.superpowers/memos/2026-11-13-ivala-redistribution-rights.md`
(letterhead under `.superpowers/memos/ivala/`).

Ingest: `scripts/ingest-anatomy-pack.mjs` (local drop only; Path A).
Textures: MeshRenderer re-export via `scripts/export-unity-meshrenderer-glbs.py` (`--align-ref=world`; `_DiffuseTexture` / HDR `_DiffuseBaseColor`).
Seating: Kabsch similarity from pack `B_*` stubs → skeleton bones (Humerus/Scapula/Ribs/Radius/Ulna/Cranium), baked into soft-tissue GLBs. Mega uses `@none:none` (no bone AABB center).
