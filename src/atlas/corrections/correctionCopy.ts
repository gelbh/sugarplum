import type { CorrectionStatus } from "../types";

export const SUGGESTION_NOTE_MAX = 1000;
export const SUGGESTION_FAILED_COPY =
  "Saved for you; the suggestion did not send";

const STATUS_LABELS: Record<CorrectionStatus, string> = {
  open: "Correction suggested",
  accepted: "Accepted for review",
  rejected: "Not accepted",
};

export function correctionStatusLabel(
  status: CorrectionStatus | null | undefined,
): string | null {
  return status ? STATUS_LABELS[status] : null;
}

/** Empty, or a parseable http(s) URL; mirrors the worker check. */
export function isSuggestionSourceUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return value.length > 0 ? value.join(", ") : "(empty)";
  }
  return JSON.stringify(value);
}
