# Type-mix validate — Slice E decision

**Date:** 2026-10-28  
**Verdict:** Close park — **closed; regen covers**  
**Prompt change:** None (`worker/generation/prompts.ts` unchanged)

Local design notes also live under `.superpowers/specs/2026-10-28-type-mix-validate-decision.md` (gitignored).

## Evidence checklist

| # | Question | Answer | Notes |
|---|----------|--------|-------|
| 1 | Can the learner change one card's type via single-card regen (R1-A shipped)? | **Yes** | `REGEN_CARD_TYPES` = `qa` \| `cloze` \| `mcq` in `worker/generation/card-regen.ts`; single-card regen on draft + hub from deck-management slice 4. |
| 2 | Is remaining pain "defaults still too QA-heavy on first generate" (not "I can't fix one card")? | **No evidence** | No user complaint logged; first-pass mix pain not validated. |
| 3 | Any concrete complaint or self-test showing first-pass mix still wrong after regen? | **Empty** | None supplied this session. |

## Decision

Module E gate: (2) is false and (3) is empty → **close park**. No soft nudge in generation prompts. Hard numeric quotas remain out of scope.

## Reopen criteria

Reopen and consider one soft nudge in `worker/generation/prompts.ts` ("prefer more cloze/mcq when material supports"; still no fractions or hard quotas) only if all hold in real use:

1. Remaining pain is specifically **first-pass generation mix**, not inability to fix individual cards via regen.
2. A concrete complaint or documented self-test shows first-pass mix is still wrong **after** single-card regen (`qa` / `cloze` / `mcq`) where appropriate.
3. Checklist item (1) remains true (regen type switch still ships).
