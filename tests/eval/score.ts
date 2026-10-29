import type { CardDraft } from "../../worker/generation/schema";
import type { EvalMeta, EvalScoreReport } from "./types";

export function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function lower(s: string): string {
  return s.toLowerCase();
}

function survivorText(draft: CardDraft): string {
  const excerpt =
    "provenance" in draft && draft.provenance
      ? draft.provenance.excerpt
      : "";
  return `${draft.front}\n${draft.back}\n${excerpt}`;
}

function frontBackText(draft: CardDraft): string {
  return `${draft.front}\n${draft.back}`;
}

function excerptOf(draft: CardDraft): string {
  if ("provenance" in draft && draft.provenance) {
    return draft.provenance.excerpt;
  }
  return "";
}

export function scoreEvalCase(
  survivors: CardDraft[],
  material: string,
  meta: EvalMeta,
): EvalScoreReport {
  const failures: string[] = [];
  const forbiddenHits: { id: string; matchedIn: string }[] = [];
  const ungroundedFronts: string[] = [];
  const keyFactIdsMissed: string[] = [];

  const requireZeroForbidden = meta.expect.require_zero_forbidden !== false;
  const materialNorm = normalizeWs(material);

  for (const draft of survivors) {
    const fbLower = lower(frontBackText(draft));
    for (const rule of meta.forbidden) {
      if (fbLower.includes(lower(rule.match))) {
        forbiddenHits.push({ id: rule.id, matchedIn: frontBackText(draft) });
      }
    }

    const excerpt = excerptOf(draft);
    const excerptNorm = normalizeWs(excerpt);
    if (!excerptNorm || !materialNorm.includes(excerptNorm)) {
      ungroundedFronts.push(draft.front);
    }
  }

  let keyFactsCovered = 0;
  for (const fact of meta.key_facts) {
    const covered = survivors.some((draft) => {
      const hay = lower(survivorText(draft));
      return fact.match.some((alt) => hay.includes(lower(alt)));
    });
    if (covered) {
      keyFactsCovered += 1;
    } else {
      keyFactIdsMissed.push(fact.id);
    }
  }

  const keyFactCoverage =
    meta.key_facts.length === 0 ? 1 : keyFactsCovered / meta.key_facts.length;

  const survivorCount = survivors.length;

  if (requireZeroForbidden && forbiddenHits.length > 0) {
    failures.push(
      `forbidden hits: ${forbiddenHits.map((h) => h.id).join(", ")}`,
    );
  }
  if (ungroundedFronts.length > 0) {
    failures.push(
      `ungrounded excerpts on fronts: ${ungroundedFronts.join("; ")}`,
    );
  }
  if (keyFactCoverage < meta.expect.min_key_fact_coverage) {
    failures.push(
      `key fact coverage ${keyFactCoverage} < min ${meta.expect.min_key_fact_coverage} (missed: ${keyFactIdsMissed.join(", ") || "none"})`,
    );
  }
  if (survivorCount < meta.expect.min_survivors) {
    failures.push(
      `survivor count ${survivorCount} < min ${meta.expect.min_survivors}`,
    );
  }
  if (
    meta.expect.max_survivors !== undefined &&
    survivorCount > meta.expect.max_survivors
  ) {
    failures.push(
      `survivor count ${survivorCount} > max ${meta.expect.max_survivors}`,
    );
  }

  return {
    ok: failures.length === 0,
    survivorCount,
    keyFactsCovered,
    keyFactCoverage,
    keyFactIdsMissed,
    forbiddenHits,
    ungroundedFronts,
    failures,
  };
}
