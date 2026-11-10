# Sugarplum

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8)](https://web.dev/progressive-web-apps/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![MUI](https://img.shields.io/badge/MUI-v7-007FFF?logo=mui&logoColor=white)](https://mui.com/)
[![FSRS](https://img.shields.io/badge/SRS-FSRS-2E7D32)](https://github.com/open-spaced-repetition/ts-fsrs)

Spaced-repetition study app that turns pasted lecture notes (and PDF text extract) into editable flashcards, then schedules reviews so you remember them. Sign in with email/password or Google.

**App:** [sugarplum.gelbhart.dev](https://sugarplum.gelbhart.dev)

## What it does

1. Paste study materials or upload a text PDF
2. Generate draft cards (rules harvest + LLM; Q&A and cloze)
3. Review and edit before anything enters your deck
4. Study with FSRS spaced repetition

## Stack

React + Vite PWA on Cloudflare Workers, Material UI, D1 / R2 / KV / Queues / Workers AI, `ts-fsrs`.

**Generation:** free by default via the Workers `AI` binding (rules harvest first, then platform model). Optional BYO OpenAI / Anthropic / Google key in Settings for higher quality and no free daily cap. Free path is capped at 20 jobs per user per UTC day. Long pastes are processed in at most 4 chunks (~5k chars each) to bound LLM/Workers AI calls.

## Develop

```bash
npm install
node scripts/fetch-layout-assets.mjs   # labels.json; ONNX loads from pinned HF at runtime
node scripts/fetch-ocr-assets.mjs      # public/ocr for occlusion Suggest regions (also runs on prebuild)
npm run dev
```

**Optional PDF figures (Docling):** not required for core dev. Fast uploads never call Docling. For Accurate extraction locally, start [docling-serve](https://github.com/docling-project/docling-serve) via `docker compose -f docker-compose.docling.yml up -d`, set in `.dev.vars` both `DOCLING_URL=http://127.0.0.1:5001` and `DOCLING_API_KEY=dev-docling-key` (must match compose), and choose **Accurate** in the create-material stepper when uploading a PDF. Production hosting checklist: [docs/docling-prod.md](docs/docling-prod.md).

## CI / CD

GitHub Actions (no PR preview Workers in v1):

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| [CI](.github/workflows/ci.yml) | Pull requests; push to `main` | `npm test` + `npm run build` |
| [Deploy](.github/workflows/deploy.yml) | Push to `main`; manual **workflow_dispatch** | Test + build → remote D1 migrations → `wrangler deploy` |

**Recommended:** protect `main` so PRs must pass CI before merge.

### GitHub secrets (Deploy)

1. Cloudflare dashboard → Account API tokens → create token with **Edit Cloudflare Workers**, scoped to this account (and the `gelbhart.dev` zone if you use custom routes).
2. Repo **Settings → Secrets and variables → Actions**, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
3. First Deploy run may prompt to create the GitHub Environment named `production` (no required reviewers needed for v1).

Deploy injects Worker var `R2_ACCOUNT_ID` from `CLOUDFLARE_ACCOUNT_ID` so the placeholder in `wrangler.jsonc` is not used in production.

## Deploy (`sugarplum.gelbhart.dev`)

Workers custom domain on `gelbhart.dev`. Assets use SPA fallback (`not_found_handling: single-page-application` in `wrangler.jsonc`), so deep links like `/study` return the app HTML (200) instead of a Worker 404. Confirm manually after deploy.

### 1. DNS / Worker route (one-time)

1. In Cloudflare DNS for `gelbhart.dev`, add a CNAME (or proxied ANAME) for `sugarplum` to the Workers target, **or** attach a custom domain / route on the `sugarplum` Worker for `sugarplum.gelbhart.dev/*`.
2. Set `vars.APP_URL` in `wrangler.jsonc` to `https://sugarplum.gelbhart.dev` (already the default).

### 2. Worker secrets (one-time, Cloudflare — not GitHub)

```bash
npx wrangler secret put SECRETS_WRAP_KEY   # exactly 32 UTF-8 bytes (or base64 of 32 bytes)
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put GOOGLE_CLIENT_ID      # from Google Cloud OAuth client
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put DOCLING_API_KEY       # optional until Docling enabled; required when DOCLING_URL is set
npx wrangler secret put ADMIN_EMAILS          # comma-separated; Google-linked accounts only; never commit values
npx wrangler secret put TURNSTILE_SECRET_KEY  # Turnstile Siteverify secret (pair with vars.TURNSTILE_SITE_KEY)
```

Set `vars.TURNSTILE_SITE_KEY` (or `.dev.vars`) to the widget sitekey before email auth works. Leave empty in committed wrangler until the prod widget exists. Local dummy always-pass: sitekey `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA` in `.dev.vars` (required for localhost; the prod sitekey in `wrangler.jsonc` does not allow local domains).

**Local R2 signing** (image / material uploads): put `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in gitignored `.dev.vars`. `R2_ACCOUNT_ID` is already in `wrangler.jsonc` vars. Use the same R2 API token values you would pass to the prod `wrangler secret put` lines above; Worker secrets are write-only (you cannot read them back). Never commit `.dev.vars` or paste real secret values into docs or PRs.

**Local signed-in account** (D1 + dummy Turnstile; does not touch remote):

```bash
npm run db:seed:local   # writes TURNSTILE_* into .dev.vars if missing; migrates + seeds
# restart npm run dev after first seed if Turnstile keys were just added
```

Sign in with `dev@local.test` / `local-dev-password`. Seed also creates deck `Local Atlas FR` for Make cards. Atlas itself is created on first `/atlas` open via `ensureAtlas`.

With other FR worktrees already on Vite, pick a free port instead of stealing theirs:

```bash
lsof -nP -iTCP:5173-5185 -sTCP:LISTEN
npm run dev -- --host 127.0.0.1 --port 5181   # use any free port from the scan
```


Local: put `ADMIN_EMAILS=...` in `.dev.vars` (gitignored). Open `/admin` while signed in as a Google-linked allowlisted user. Empty/unset → all `/api/admin/*` return 403.

### Google Sign-In (one-time)

1. In Google Cloud Console, create an OAuth 2.0 **Web** client.
2. Authorized redirect URI (production): `https://sugarplum.gelbhart.dev/api/auth/google/callback`
3. For local Workers/Vite, also add your local APP_URL callback, e.g. `http://localhost:8787/api/auth/google/callback` (match `vars.APP_URL`).
4. Put the client ID and secret into Worker secrets as above (not Vite env; not committed).
5. Until secrets are set, `/api/auth/google/start` returns 503.

### 3. R2 CORS (one-time)

Browser uploads use signed URLs against the R2 bucket. Configure bucket CORS so `https://sugarplum.gelbhart.dev` (and local Vite origin if needed) may `PUT` objects with the headers your client sends (`Content-Type`, `Content-Length`, etc.) and may `GET` objects for a later OCR refill. Without CORS, PDF upload from the app fails in the browser even when the Worker returns a signed URL, and Generate more cannot download the PDF to OCR later pages.

### 4. Ship

**Preferred:** merge to `main` (or Actions → Deploy → Run workflow). D1 migrations run remotely in the Deploy job before the Worker binary goes live.

**Local emergency / first bootstrap:**

```bash
npx wrangler d1 migrations apply sugarplum --remote
npm run deploy
```

After deploy, open `https://sugarplum.gelbhart.dev/study` in a logged-out browser tab and confirm HTML loads (SPA deep link).

## Attribution

Fruit achievement medal artwork: [designed by vector4stock - Magnific.com](https://www.magnific.com). License certificate: `docs/licenses/magnific-25333978.pdf`.
