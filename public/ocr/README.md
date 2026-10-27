# OCR assets (tesseract.js v7)

Large files are **not** committed. Run `node scripts/fetch-ocr-assets.mjs` or `npm run prebuild` after clone.

Pinned versions live in `scripts/fetch-ocr-assets.mjs`.

## createWorker paths (browser)

Use absolute site paths (no trailing slash on `langPath`):

| Option | Value |
|--------|--------|
| `workerPath` | `/ocr/worker.min.js` |
| `corePath` | `/ocr/core` |
| `langPath` | `/ocr` |

Language file resolves to `/ocr/eng.traineddata.gz` (LSTM / OEM 1, `@tesseract.js-data` 4.0.0_best_int).

`corePath` must be a **directory** containing all `tesseract-core*.wasm.js` builds and sibling `.wasm` binaries (see fetch script).
