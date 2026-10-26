# Sugarplum

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8)](https://web.dev/progressive-web-apps/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![MUI](https://img.shields.io/badge/MUI-v7-007FFF?logo=mui&logoColor=white)](https://mui.com/)
[![FSRS](https://img.shields.io/badge/SRS-FSRS-2E7D32)](https://github.com/open-spaced-repetition/ts-fsrs)

Spaced-repetition study app that turns lecture notes, PDFs, and slides into editable flashcards, then schedules reviews so you remember them.

**App:** [sugarplum.gelbhart.dev](https://sugarplum.gelbhart.dev)

## What it does

1. Upload or paste study materials
2. Generate draft cards (Q&A and cloze in the first release)
3. Review and edit before anything enters your deck
4. Study with FSRS spaced repetition

## Stack

React + Vite PWA on Cloudflare Workers, Material UI, D1 / R2 / KV / Queues, `ts-fsrs`. BYO LLM API key.

## Develop

```bash
npm install
npm run dev
```

Deploy and domain setup: see later docs once Workers bindings exist.
