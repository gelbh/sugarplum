Status: GREEN

RED:
- Added golden tests first; they failed because `buildApkg` did not exist.

GREEN:
- `npx vitest run tests/worker/export-build-apkg.test.ts`: 2 passed.
- `npm test`: 72 files, 592 tests passed.
- `npx tsc -b tsconfig.worker.json`: passed.
- `npm run build`: passed.

Implemented:
- Real SQLite-backed `collection.anki2` with Basic, Cloze, and Sugarplum MCQ models.
- Schedule fields in card rows/data, numeric media files, media map, and Basic image tags.
- Added `sql.js` to package.json and package-lock.json.

Concerns:
- Anki desktop import was not available for direct validation; SQLite schema and golden parsing passed.
- Worker deployment must preserve sql.js WASM loading when this exporter is wired into a route.

Follow-up evidence:
- Fixed FSRS state mapping so card type and queue preserve states 0 through 3, with new cards using positional due values.
- Added sql.js WASM asset resolution for Vite Workers and Vitest Node, with loud initialization errors.
- Rewrote mapped existing image sources, stored string sort fields, added a stable non-zero FNV-1a checksum, and parsed cloze ordinals.
- `npx vitest run tests/worker/export-build-apkg.test.ts`: 3 passed.
- `npx tsc -p tsconfig.worker.json --pretty false`: passed.

SHA-1 csum + all-field media rewrite:
- Replaced FNV-1a with Anki's sort-field checksum: SHA-1, first 8 hex digits as decimal (`crypto.subtle.digest`).
- `rewriteMediaSources` runs on every field after basic front img append.
- Added golden tests for csum and cloze Text media rewrite.
- `npx vitest run tests/worker/export-build-apkg.test.ts`: 5 passed.
- Commit: `fix(export): anki sha1 csum and rewrite all media fields`.
