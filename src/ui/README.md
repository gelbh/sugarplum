# `src/ui/` — shared presentational library

In-app home for **cross-domain presentational** chrome. Not a workspace package.

## Admission (what belongs here)

A module may live under `src/ui/` only when **all** of these hold:

1. **Prop-driven / presentational** — renders from props (or pure sx/helpers). No domain hooks, no guest store, no route modules, no `src/api/` imports.
2. **Proven share** — already used at ≥2 call sites across domains, or extracted from a proven twin (near-identical structure in two places with a likely third touch).
3. **Not app shell** — AppShell-coupled chrome stays in `src/components/shell/`.
4. **Not a feature composite** — library / deckHub / atlas / anatomy / progress (etc.) keep domain-owned workshops, boards, and page composites unless they clear the bar above.

Prefer named subpath imports (`../ui/Foo`) over a fat barrel that invites cycles.

## Non-goals (what stays out)

- Dumping `src/components/` (or domain folders) into this tree wholesale.
- `packages/ui`, Storybook, Turborepo, published `@sugarplum/ui`, or a second token system beyond existing `chromeTokens` (leave tokens with shell unless a later promote truly needs a thin re-export).
- MUI wrappers that pull API, routes, or guest persistence.
- Unifying parked twins without an explicit promote decision (e.g. MissionBoard vs BoardTile; MakeCards dialog twins; DialogEyebrow until catalog admits it).

## Timing

W8–W11 extracted next to owning domains on purpose. W12 harvests into `src/ui/` only after admission. Empty library after bootstrap is temporary; the next slice catalogs and promotes admitted families one PR at a time.
