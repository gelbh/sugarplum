/** Diagnostic ownership: stage.diagnostic is canonical; diagnosticStage is a derived mirror. */

export type DiagnosticStageLike = {
  name: string;
  diagnostic?: boolean;
};

export function diagnosticFlags<T extends DiagnosticStageLike>(stages: T[]): T[] {
  return stages.filter((s) => s.diagnostic);
}

export function atMostOneDiagnostic(stages: DiagnosticStageLike[]): boolean {
  return diagnosticFlags(stages).length <= 1;
}

/** Mirror string from the single flagged stage, or null. */
export function diagnosticStageFromStages(
  stages: DiagnosticStageLike[],
): string | null {
  const flagged = diagnosticFlags(stages);
  return flagged.length === 1 ? flagged[0].name : null;
}

function nameMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Validate ownership before sync.
 * Returns an error message, or null when ok to hydrate/sync.
 */
export function diagnosticOwnershipIssue(
  stages: DiagnosticStageLike[],
  diagnosticStage: string | null,
): string | null {
  const flagged = diagnosticFlags(stages);
  if (flagged.length > 1) return "at most one diagnostic stage";
  if (
    flagged.length === 1 &&
    diagnosticStage &&
    !nameMatch(flagged[0].name, diagnosticStage)
  ) {
    return "diagnosticStage conflicts with stage.diagnostic";
  }
  // Orphan mirrors (string with no matching stage name) stay as overview text
  // without a board badge; hydrate is a no-op for those rows.
  return null;
}

/**
 * Hydrate flags from the mirror (or rewrite the mirror from the flag).
 * Caller must ensure diagnosticOwnershipIssue is null first for strict paths.
 */
export function syncDiagnosticOwnership<T extends DiagnosticStageLike>(
  stages: T[],
  diagnosticStage: string | null,
): { stages: T[]; diagnosticStage: string | null } {
  const flagged = diagnosticFlags(stages);
  if (flagged.length === 1) {
    return { stages, diagnosticStage: flagged[0].name };
  }
  if (flagged.length > 1) {
    return { stages, diagnosticStage: null };
  }
  if (!diagnosticStage) {
    return { stages, diagnosticStage: null };
  }
  const matchIndex = stages.findIndex((s) =>
    nameMatch(s.name, diagnosticStage),
  );
  if (matchIndex < 0) {
    return { stages, diagnosticStage };
  }
  const next = stages.map((s, i) =>
    i === matchIndex ? { ...s, diagnostic: true } : s,
  );
  return {
    stages: next,
    diagnosticStage: next[matchIndex].name,
  };
}

/** Editor open: lift legacy mirror into stage flags for the draft list. */
export function hydrateLifecycleDraft<T extends DiagnosticStageLike>(
  stages: T[],
  diagnosticStage: string | null,
): T[] {
  return syncDiagnosticOwnership(stages, diagnosticStage).stages;
}

/**
 * Mirror to persist on editor/API write.
 * Flag wins; otherwise keep an orphan prior mirror (no matching stage name).
 */
export function diagnosticMirrorForSave(
  stages: DiagnosticStageLike[],
  previousMirror: string | null,
): string | null {
  const fromFlags = diagnosticStageFromStages(stages);
  if (fromFlags) return fromFlags;
  if (
    previousMirror &&
    !stages.some((s) => nameMatch(s.name, previousMirror))
  ) {
    return previousMirror;
  }
  return null;
}
