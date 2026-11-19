export function storedUploadNotice(args: {
  status: string;
  jobId?: string | null;
  reused?: boolean;
  parts?: number;
  figureNote?: string;
}): string {
  const figureNote = args.figureNote ?? "";
  const parts = args.parts ?? 1;
  if (args.reused && args.jobId) {
    return parts > 1
      ? `These files were already on the deck (${args.status}). Opening prior drafts (no new generation).${figureNote}`
      : `This file was already on the deck (${args.status}). Opening prior drafts (no new generation).`;
  }
  if (args.jobId) {
    return parts > 1
      ? `Stored ${parts} materials (${args.status}). Generation started.${figureNote}`
      : `Stored file (${args.status}). Generation started.`;
  }
  if (parts > 1) {
    return `Stored ${parts} materials (${args.status}).${figureNote}`;
  }
  return `Stored file (${args.status}). Open drafts from a prior generate, or upload a new file.`;
}

/** Pure reuse only when every stored part reports reused (mixed batches are fresh). */
export function batchAllReused(
  materials: Array<{ reused?: boolean }>,
): boolean {
  return materials.length > 0 && materials.every((m) => m.reused === true);
}
