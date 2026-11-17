import { ZodError } from "zod";
import { ApiError } from "../api/client";
import { diagnosticStageFromStages } from "../../worker/atlas/lifecycleDiagnostic";
import type { StageDraft } from "./StageListEditor";
import type { DatasetFields } from "./types";

/** Preview accepts free-text hosts the same way learner overlays do. */
export function previewLifecycleFields(
  base: DatasetFields,
  stages: StageDraft[],
): DatasetFields {
  return {
    ...base,
    lifecycleStages: stages as DatasetFields["lifecycleStages"],
    diagnosticStage: diagnosticStageFromStages(stages),
  };
}

export function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof ZodError) {
    return err.issues.map((i) => i.message).join("; ") || fallback;
  }
  return fallback;
}

export function parseHostList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
