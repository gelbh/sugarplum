# Docling production runbook

Sugarplum's Worker calls [docling-serve](https://github.com/docling-project/docling-serve) for PDF figure extraction when `DOCLING_URL` is set. Worker and host must share the same API key (`DOCLING_API_KEY` on the Worker, `DOCLING_SERVE_API_KEY` on the host).

## Image

Pin a specific tag. Do not use `:latest`.

```text
quay.io/docling-project/docling-serve:v1.38.2
```

For CPU-only hosts, use the project's `docling-serve-cpu` image at the **same version tag** (e.g. `v1.38.2`), not a floating tag.

## Engine

- **Local / default:** in-process engine (same as `docker-compose.docling.yml`).
- **RQ / Redis queue:** not used in this slice; parked for later if you need horizontal workers.

## Host environment

Set on the Docling container or VM:

| Variable | Value |
|----------|--------|
| `DOCLING_SERVE_API_KEY` | Strong secret; must match Worker `DOCLING_API_KEY` |
| `DOCLING_SERVE_ENABLE_UI` | `false` (or omit; default is off in prod) |
| `DOCLING_SERVE_ENABLE_API_DOCS` | `false` |
| `DOCLING_SERVE_MAX_FILE_SIZE` | `26214400` (25 MiB) |
| `DOCLING_SERVE_MAX_NUM_PAGES` | `50` |

### Limits (aligned with Sugarplum Worker)

Worker upload and extract caps (see `worker/materials/limits.ts` and `worker/materials/extract-pdf.ts`):

- **Upload max (PDF):** `MAX_FILE_BYTES = 25 * 1024 * 1024` (25 MiB). Use `26214400` bytes for `DOCLING_SERVE_MAX_FILE_SIZE`.
- **Page cap:** `PDF_EXTRACT_MAX_PAGES = 50`. Use `50` for `DOCLING_SERVE_MAX_NUM_PAGES`.

Images use a separate `MAX_IMAGE_BYTES = 8 * 1024 * 1024` for vision paths; Docling here is PDF-focused, so the 25 MiB file cap is the relevant match.

## TLS

Terminate TLS at your edge (Fly.io, Caddy, nginx, etc.). The Worker must call Docling over **HTTPS** only in production (`DOCLING_URL=https://…`).

## Health probes

- Liveness / general: `GET /health`
- Ready: `GET /ready`

Configure your orchestrator to use these paths on the Docling listen port (5001 by default).

## Worker configuration

When Docling is enabled, if `DOCLING_URL` is set without `DOCLING_API_KEY`, the Worker skips the Docling POST (soft-fail: empty crops + progress warning; text generation continues). Requests use header `X-Api-Key`.

```bash
npx wrangler secret put DOCLING_API_KEY
# Set DOCLING_URL to https://<your-docling-host> via wrangler vars or the Cloudflare dashboard.
```

Local development: see `docker-compose.docling.yml` and `.dev.vars` (`DOCLING_URL` + `DOCLING_API_KEY=dev-docling-key`).

## Smoke test

Replace `HOST`, `KEY`, and path to a small PDF:

```bash
curl -sS -H "X-Api-Key: $KEY" \
  -F "files=@sample.pdf" \
  -F "from_formats=pdf" \
  -F "to_formats=json" \
  -F "include_images=true" \
  -F "image_export_mode=embedded" \
  "https://HOST/v1/convert/file"
```

Expect a JSON response from the convert endpoint when the service is healthy and authenticated (same form fields the Worker sends).

## Out of scope (this slice)

- Hugging Face Spaces deployment
- Public, unauthenticated convert endpoints
- Cloudflare Containers for Docling

For local optional Docling during development, use `docker compose -f docker-compose.docling.yml up -d` and the README Develop section.
