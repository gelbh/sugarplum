import { api } from "../../api/client";
import type {
  AdminAtlasCorrection,
  CorrectionDiff,
  CorrectionStatus,
  EntryPatch,
} from "../types";

export type SuggestionBody = {
  patch: EntryPatch;
  note: string | null;
  sourceUrl: string | null;
};

export function postEntrySuggestion(
  atlasId: string,
  entryId: string,
  body: SuggestionBody,
) {
  return api<{ status: "open"; diff: CorrectionDiff }>(
    `/api/atlas/${encodeURIComponent(atlasId)}/entries/${encodeURIComponent(entryId)}/suggestion`,
    { method: "POST", json: body },
  );
}

export function adminListAtlasCorrections(status: CorrectionStatus = "open") {
  return api<{ corrections: AdminAtlasCorrection[] }>(
    `/api/admin/atlas/corrections?status=${status}`,
  ).then((body) => body.corrections);
}

export function adminResolveAtlasCorrection(
  id: string,
  status: "accepted" | "rejected",
) {
  return api<{ id: string; status: CorrectionStatus; resolvedAt: string }>(
    `/api/admin/atlas/corrections/${encodeURIComponent(id)}`,
    { method: "POST", json: { status } },
  );
}

/** Dataset-PR input; leaves out the student's email. */
export function correctionExportJson(row: AdminAtlasCorrection): string {
  return JSON.stringify(
    {
      suggestionId: row.id,
      originKey: row.originKey,
      canonicalName: row.canonicalName,
      datasetVersion: row.datasetVersion,
      diff: row.diff,
      note: row.note,
      sourceUrl: row.sourceUrl,
    },
    null,
    2,
  );
}
