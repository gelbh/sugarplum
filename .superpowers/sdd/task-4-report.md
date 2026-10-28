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
