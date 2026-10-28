Status: complete

RED:
- Added route tests for auth, export ownership, empty decks, and APKG download bytes.
- Confirmed the new routes initially returned 404.

GREEN:
- Implemented deck loading, card conversion, FSRS mapping, media warnings, APKG generation, export metadata, and download routes.
- Mounted `/api/exports` and extended the test D1/R2 harness for export jobs and binary payloads.
- Tests: `npm test` (73 files, 599 tests), worker typecheck, and linter diagnostics all pass.
