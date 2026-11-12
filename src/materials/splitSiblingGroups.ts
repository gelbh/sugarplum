export type SplitPartName = {
  stem: string;
  index: number;
  total: number;
  ext: "pdf" | "pptx";
};

/** Product split part names from C1/C2: `{stem} ({k}/{n}).pdf|pptx`. */
const SPLIT_PART_RE = /^(.+) \((\d+)\/(\d+)\)\.(pdf|pptx)$/i;

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

export type SplitSiblingMaterial = {
  id: string;
  deck_id: string;
  kind: string;
  filename: string | null;
};

export type SiblingPartitionEntry<T extends SplitSiblingMaterial> =
  | { type: "flat"; material: T }
  | { type: "group"; stem: string; members: T[] };

type Pending<T extends SplitSiblingMaterial> = {
  order: number;
  entry: SiblingPartitionEntry<T>;
};

type Bucket<T extends SplitSiblingMaterial> = {
  stem: string;
  members: { material: T; index: number; order: number }[];
  firstOrder: number;
};

/**
 * Partition materials into flat rows and stem groups (≥2 product split parts
 * sharing deck_id + kind + stem). Callers typically pass one kind bucket.
 */
export function partitionSplitSiblings<T extends SplitSiblingMaterial>(
  materials: T[],
): SiblingPartitionEntry<T>[] {
  const buckets = new Map<string, Bucket<T>>();
  const pending: Pending<T>[] = [];

  materials.forEach((material, order) => {
    const parsed = parseSplitPartFilename(material.filename);
    if (!parsed) {
      pending.push({ order, entry: { type: "flat", material } });
      return;
    }
    const key = `${material.deck_id}\0${material.kind}\0${parsed.stem}\0${parsed.total}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { stem: parsed.stem, members: [], firstOrder: order };
      buckets.set(key, bucket);
    }
    bucket.members.push({ material, index: parsed.index, order });
  });

  for (const bucket of buckets.values()) {
    const distinctIndexes = new Set(bucket.members.map((m) => m.index));
    if (bucket.members.length < 2 || distinctIndexes.size < 2) {
      for (const { material, order } of bucket.members) {
        pending.push({ order, entry: { type: "flat", material } });
      }
      continue;
    }
    const members = [...bucket.members]
      .sort((a, b) => {
        if (a.index !== b.index) return a.index - b.index;
        return a.material.id.localeCompare(b.material.id);
      })
      .map((m) => m.material);
    pending.push({
      order: bucket.firstOrder,
      entry: { type: "group", stem: bucket.stem, members },
    });
  }

  pending.sort((a, b) => a.order - b.order);
  return pending.map((p) => p.entry);
}
