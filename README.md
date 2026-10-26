# Sugarplum

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8)](https://web.dev/progressive-web-apps/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![MUI](https://img.shields.io/badge/MUI-v7-007FFF?logo=mui&logoColor=white)](https://mui.com/)
[![FSRS](https://img.shields.io/badge/SRS-FSRS-2E7D32)](https://github.com/open-spaced-repetition/ts-fsrs)

Spaced-repetition study app that turns pasted lecture notes into editable flashcards, then schedules reviews so you remember them. PDF upload to R2 is supported; text extraction from PDFs is not ready yet (jobs fail with a clear error until that lands).

**App:** [sugarplum.gelbhart.dev](https://sugarplum.gelbhart.dev)

## What it does

1. Paste study materials (preferred for generation today); optional PDF upload stores the file
2. Generate draft cards from paste text (Q&A and cloze in the first release)
3. Review and edit before anything enters your deck
4. Study with FSRS spaced repetition

## Stack

React + Vite PWA on Cloudflare Workers, Material UI, D1 / R2 / KV / Queues, `ts-fsrs`. BYO LLM API key.

## Develop

```bash
npm install
npm run dev
```

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
```

### 3. R2 CORS (one-time)

Browser uploads use signed URLs against the R2 bucket. Configure bucket CORS so `https://sugarplum.gelbhart.dev` (and local Vite origin if needed) may `PUT` objects with the headers your client sends (`Content-Type`, `Content-Length`, etc.). Without CORS, PDF upload from the app fails in the browser even when the Worker returns a signed URL.

### 4. Ship

**Preferred:** merge to `main` (or Actions → Deploy → Run workflow). D1 migrations run remotely in the Deploy job before the Worker binary goes live.

**Local emergency / first bootstrap:**

```bash
npx wrangler d1 migrations apply sugarplum --remote
npm run deploy
```

After deploy, open `https://sugarplum.gelbhart.dev/study` in a logged-out browser tab and confirm HTML loads (SPA deep link).
