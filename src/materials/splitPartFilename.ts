export type SplitPartName = {
  stem: string;
  index: number;
  total: number;
  ext: "pdf" | "pptx";
};

/** Product split part names from C1/C2: `{stem} ({k}/{n}).pdf|pptx`. */
const SPLIT_PART_RE = /^(.+) \((\d+)\/(\d+)\)\.(pdf|pptx)$/i;

export function formatSplitPartFilename(part: SplitPartName): string {
  return `${part.stem} (${part.index}/${part.total}).${part.ext}`;
}

export function parseSplitPartFilename(
  filename: string | null | undefined,
): SplitPartName | null {
  const trimmed = typeof filename === "string" ? filename.trim() : "";
  if (!trimmed) return null;
  const match = SPLIT_PART_RE.exec(trimmed);
  if (!match) return null;
  const stem = match[1] ?? "";
  const index = Number(match[2]);
  const total = Number(match[3]);
  const extRaw = (match[4] ?? "").toLowerCase();
  if (!stem || !Number.isFinite(index) || !Number.isFinite(total)) return null;
  if (index < 1 || total < 1 || index > total) return null;
  if (extRaw !== "pdf" && extRaw !== "pptx") return null;
  return { stem, index, total, ext: extRaw };
}
