import { api } from "../../api/client";
import type { SourceRole } from "../../materials/sourceRole";

export type AtlasPackMaterial = {
  id: string;
  atlas_id: string;
  kind: string;
  r2_key: string | null;
  filename: string | null;
  page_count: number | null;
  status: string;
  created_at: string;
  source_role: SourceRole | string;
};

function packPath(atlasId: string, suffix = ""): string {
  return `/api/atlas/${encodeURIComponent(atlasId)}${suffix}`;
}

function materialPath(materialId: string, suffix = ""): string {
  return `/api/atlas/materials/${encodeURIComponent(materialId)}${suffix}`;
}

export function listAtlasMaterials(atlasId: string) {
  return api<{ materials: AtlasPackMaterial[] }>(
    packPath(atlasId, "/materials"),
  ).then((body) => body.materials);
}

export function pasteAtlasMaterial(
  atlasId: string,
  body: { text: string; filename?: string | null; source_role?: SourceRole },
) {
  return api<AtlasPackMaterial>(packPath(atlasId, "/materials/paste"), {
    method: "POST",
    json: body,
  });
}

export function requestAtlasMaterialUploadUrl(
  atlasId: string,
  body: {
    filename: string;
    contentType: string;
    size: number;
    source_role?: SourceRole;
  },
) {
  return api<{ materialId: string; uploadUrl: string; r2Key: string }>(
    packPath(atlasId, "/materials/upload-url"),
    { method: "POST", json: body },
  );
}

export function completeAtlasMaterial(
  materialId: string,
  body?: { ocrPages?: Array<{ page: number; text: string }> },
) {
  return api<AtlasPackMaterial & { jobId: null }>(
    materialPath(materialId, "/complete"),
    { method: "POST", json: body ?? {} },
  );
}

export function patchAtlasMaterialSourceRole(
  materialId: string,
  source_role: SourceRole,
) {
  return api<AtlasPackMaterial>(materialPath(materialId), {
    method: "PATCH",
    json: { source_role },
  });
}

export function deleteAtlasMaterial(materialId: string) {
  return api<void>(materialPath(materialId), { method: "DELETE" });
}

export function promoteAtlasMaterial(materialId: string, deckId: string) {
  return api<{
    id: string;
    deck_id: string;
    kind: string;
    status: string;
    jobId: null;
  }>(materialPath(materialId, "/promote"), {
    method: "POST",
    json: { deckId },
  });
}
