export const SOURCE_ROLES = [
  "lecture",
  "tutorial",
  "practical",
  "past_paper",
  "notes",
] as const;

export type SourceRole = (typeof SOURCE_ROLES)[number];

export const SOURCE_ROLE_LABELS: Record<SourceRole, string> = {
  lecture: "Lecture",
  tutorial: "Tutorial",
  practical: "Practical",
  past_paper: "Past paper",
  notes: "Notes",
};

export function isSourceRole(value: unknown): value is SourceRole {
  return (
    typeof value === "string" &&
    (SOURCE_ROLES as readonly string[]).includes(value)
  );
}

function hasToken(haystack: string, needle: string): boolean {
  const re = new RegExp(`(?:^|[^a-z0-9])${needle}(?:[^a-z0-9]|$)`, "i");
  return re.test(haystack);
}

function hasTokenPrefix(haystack: string, prefix: string): boolean {
  const re = new RegExp(`(?:^|[^a-z0-9])${prefix}`, "i");
  return re.test(haystack);
}

/** First hit wins: past_paper → tutorial → practical → notes → lecture. */
export function suggestSourceRole(
  filename: string | null | undefined,
): SourceRole {
  const name = typeof filename === "string" ? filename : "";
  if (
    hasToken(name, "past") ||
    hasToken(name, "exam") ||
    hasToken(name, "paper")
  ) {
    return "past_paper";
  }
  if (hasTokenPrefix(name, "tutorial") || hasToken(name, "tut")) {
    return "tutorial";
  }
  if (
    hasTokenPrefix(name, "practical") ||
    hasToken(name, "prac") ||
    hasToken(name, "lab")
  ) {
    return "practical";
  }
  if (hasTokenPrefix(name, "note")) {
    return "notes";
  }
  return "lecture";
}
