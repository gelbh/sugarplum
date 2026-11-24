import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { extractPdfPages } = vi.hoisted(() => ({ extractPdfPages: vi.fn() }));

vi.mock("../../../worker/materials/extract-pdf", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../worker/materials/extract-pdf")>();
  return {
    ...actual,
    extractPdfPages: (...args: unknown[]) => extractPdfPages(...args),
  };
});

import { env as cfEnv } from "cloudflare:workers";
import { resetTestDb } from "../harness";
import { atlasOcrSidecarKey } from "../../../worker/materials/ocr-sidecar";
import { loadAtlasPdfFocusPages } from "../../../worker/atlas/atlas-materials";

afterEach(async () => {
  await resetTestDb(cfEnv);
});

describe("loadAtlasPdfFocusPages", () => {
  beforeEach(() => {
    extractPdfPages.mockReset();
  });

  // workerd vitest does not apply vi.mock into the worker module graph.
  it.skip("extracts text-layer PDF with no sidecar into Focus pages", async () => {
    const env = cfEnv;
    const atlasId = "atlas-1";
    const materialId = "mat-pdf-1";
    const r2Key = `atlas/${atlasId}/${materialId}.pdf`;
    await env.MATERIALS.put(r2Key, new TextEncoder().encode("%PDF-mock").buffer);
    extractPdfPages.mockResolvedValue({
      pages: [{ page: 1, text: "Fasciola hepatica" }],
      totalPages: 1,
      pageStart: 1,
      pageEnd: 1,
    });

    const pages = await loadAtlasPdfFocusPages(env, {
      id: materialId,
      atlas_id: atlasId,
      kind: "pdf",
      r2_key: r2Key,
      filename: "lecture.pdf",
      source_role: "tutorial",
      status: "ready",
      content_hash: "hash-1",
    });

    expect(extractPdfPages).toHaveBeenCalledOnce();
    expect(pages.some((p) => p.text.includes("Fasciola hepatica"))).toBe(true);
    const sidecarRaw = await env.MATERIALS.get(
      atlasOcrSidecarKey(atlasId, materialId),
    );
    expect(sidecarRaw).not.toBeNull();
    const sidecar = JSON.parse(await sidecarRaw!.text()) as {
      pages: { page: number; text: string }[];
      sourceContentHash?: string;
    };
    expect(sidecar.sourceContentHash).toBe("hash-1");
    expect(sidecar.pages.some((p) => p.text.includes("Fasciola hepatica"))).toBe(
      true,
    );
  });

  it("uses sidecar without re-extract on cache hit", async () => {
    const env = cfEnv;
    const atlasId = "atlas-2";
    const materialId = "mat-pdf-2";
    const r2Key = `atlas/${atlasId}/${materialId}.pdf`;
    await env.MATERIALS.put(r2Key, new TextEncoder().encode("%PDF-mock").buffer);
    await env.MATERIALS.put(
      atlasOcrSidecarKey(atlasId, materialId),
      JSON.stringify({
        pages: [{ page: 1, text: "Toxoplasma gondii" }],
        sourceContentHash: "hit-hash",
      }),
    );

    const pages = await loadAtlasPdfFocusPages(env, {
      id: materialId,
      atlas_id: atlasId,
      kind: "pdf",
      r2_key: r2Key,
      filename: "lecture.pdf",
      source_role: "tutorial",
      status: "ready",
      content_hash: "hit-hash",
    });

    expect(extractPdfPages).not.toHaveBeenCalled();
    expect(pages).toEqual([{ page: 1, text: "Toxoplasma gondii" }]);
  });

  it.skip("merges OCR fill onto empty native pages", async () => {
    const env = cfEnv;
    const atlasId = "atlas-3";
    const materialId = "mat-pdf-3";
    const r2Key = `atlas/${atlasId}/${materialId}.pdf`;
    await env.MATERIALS.put(r2Key, new TextEncoder().encode("%PDF-mock").buffer);
    await env.MATERIALS.put(
      atlasOcrSidecarKey(atlasId, materialId),
      JSON.stringify({
        pages: [{ page: 1, text: "Dipylidium caninum from OCR" }],
      }),
    );
    extractPdfPages.mockResolvedValue({
      pages: [{ page: 1, text: "" }],
      totalPages: 1,
      pageStart: 1,
      pageEnd: 1,
    });

    const pages = await loadAtlasPdfFocusPages(env, {
      id: materialId,
      atlas_id: atlasId,
      kind: "pdf",
      r2_key: r2Key,
      filename: "scan.pdf",
      source_role: "tutorial",
      status: "ready",
      content_hash: "merge-hash",
    });

    expect(extractPdfPages).toHaveBeenCalledOnce();
    expect(pages.some((p) => p.text.includes("Dipylidium caninum"))).toBe(true);
  });
});
