import { describe, expect, it } from "vitest";
import { app } from "../../worker/index";
import { SESSION_COOKIE } from "../../worker/auth/session";
import { mockLlmAdapter } from "../../worker/generation/llm";
import { processGenerateJob } from "../../worker/generation/consumer";
import { enqueueGeneration } from "../../worker/generation/enqueue";
import {
  applyOcrSidecar,
  mergeOcrPages,
  ocrSidecarKey,
  parseOcrPages,
  parseStoredOcrPages,
  pdfTextOrOcrSidecar,
} from "../../worker/materials/ocr-sidecar";
import { createTestEnv } from "./test-env";
import { minimalPdfWithText } from "./pdf-fixture";

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("mergeOcrPages", () => {
  it("keeps the stored page, appends a new one, and rejects a page outside the window", () => {
    expect(
      mergeOcrPages(
        [{ page: 1, text: "first" }],
        [{ page: 1, text: "overwrite" }, { page: 9, text: "later" }],
        { start: 1, end: 2000 },
      ),
    ).toEqual([
      { page: 1, text: "first" },
      { page: 9, text: "later" },
    ]);
    expect(
      mergeOcrPages([], [{ page: 121, text: "past cursor" }], {
        start: 1,
        end: 2000,
      }),
    ).toEqual([{ page: 121, text: "past cursor" }]);
    expect(() =>
      mergeOcrPages([], [{ page: 2001, text: "no" }], {
        start: 1,
        end: 2000,
      }),
    ).toThrow(/Invalid ocrPages/);
  });
});

describe("parseStoredOcrPages", () => {
  it("accepts a ninth stored page and page 150", () => {
    const pages = parseStoredOcrPages(
      Array.from({ length: 9 }, (_, index) => ({
        page: index + 1,
        text: "scan",
      })),
    );
    expect(pages).toHaveLength(9);
    expect(parseStoredOcrPages([{ page: 150, text: "far" }])).toEqual([
      { page: 150, text: "far" },
    ]);
  });
});

describe("parseOcrPages page ceiling", () => {
  it("rejects page 2001", () => {
    expect(() => parseOcrPages([{ page: 2001, text: "x" }])).toThrow(
      /Invalid ocrPages/,
    );
  });
});

describe("parseOcrPages duplicates", () => {
  it("rejects the same page twice in one body", () => {
    expect(() =>
      parseOcrPages([
        { page: 1, text: "a" },
        { page: 1, text: "b" },
      ]),
    ).toThrow(/Invalid ocrPages/);
  });
});

describe("parseOcrPages", () => {
  it("rejects a ninth page, page 0, and an over-long string", () => {
    expect(() =>
      parseOcrPages(
        Array.from({ length: 9 }, (_, index) => ({
          page: index + 1,
          text: "scan",
        })),
      ),
    ).toThrow(/Invalid ocrPages/);
    expect(() => parseOcrPages([{ page: 0, text: "scan" }])).toThrow(
      /Invalid ocrPages/,
    );
    expect(() =>
      parseOcrPages([{ page: 1, text: "a".repeat(8_001) }]),
    ).toThrow(/Invalid ocrPages/);
  });
});

describe("applyOcrSidecar", () => {
  it("fills only empty pages", () => {
    const pages = applyOcrSidecar(
      [
        { page: 1, text: "native" },
        { page: 2, text: "  " },
      ],
      { pages: [{ page: 1, text: "ocr one" }, { page: 2, text: "ocr two" }] },
    );
    expect(pages).toEqual([
      { page: 1, text: "native" },
      { page: 2, text: "ocr two" },
    ]);
  });
});

describe("pdfTextOrOcrSidecar", () => {
  it("uses sidecar text when extraction finds no text", async () => {
    const text = await pdfTextOrOcrSidecar(
      asBuffer(minimalPdfWithText("")),
      async () => ({ pages: [{ page: 1, text: "Cecum of the chicken" }] }),
    );
    expect(text).toBe("Cecum of the chicken");
  });

  it("rethrows the no-text error when the sidecar is empty", async () => {
    await expect(
      pdfTextOrOcrSidecar(asBuffer(minimalPdfWithText("")), async () => null),
    ).rejects.toThrow(/PDF text extraction returned no text/);
  });

  it("still throws the page cap without reading the sidecar", async () => {
    let reads = 0;
    await expect(
      pdfTextOrOcrSidecar(pdfWithPages(51), async () => {
        reads += 1;
        return { pages: [{ page: 1, text: "should not be used" }] };
      }),
    ).rejects.toThrow(/51 pages/);
    expect(reads).toBe(0);
  });

  it("refuses a sidecar longer than the regen character cap", async () => {
    await expect(
      pdfTextOrOcrSidecar(asBuffer(minimalPdfWithText("")), async () => ({
        pages: [{ page: 1, text: "a".repeat(200_001) }],
      })),
    ).rejects.toThrow(/PDF text exceeds 200000 characters/);
  });
});

describe("complete upload sidecar", () => {
  it("stores ocr pages after the pdf is ready", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "Owner deck",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-a", "user-a");
    env.seedMaterial({
      id: "mat-1",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-1.pdf",
      filename: "lecture.pdf",
      page_count: null,
      status: "uploading",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const res = await app.request(
      "/api/materials/mat-1/complete",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify({
          ocrPages: [{ page: 1, text: "scanned cecum" }],
        }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(env.getMaterials()[0]?.status).toBe("ready");
    expect(env.getR2(ocrSidecarKey("deck-a", "mat-1"))).toContain(
      "scanned cecum",
    );
  });
});

describe("generate with sidecar", () => {
  it("does not fail empty when the sidecar fills the page", async () => {
    const env = createTestEnv();
    env.seedUser({
      id: "user-a",
      email: "a@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedDeck({
      id: "deck-a",
      user_id: "user-a",
      title: "Bio",
      subject_hint: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedMaterial({
      id: "mat-pdf",
      deck_id: "deck-a",
      kind: "pdf",
      r2_key: "materials/deck-a/mat-pdf.pdf",
      filename: "scan.pdf",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedR2(
      "materials/deck-a/mat-pdf.pdf",
      new TextDecoder().decode(minimalPdfWithText("")),
    );
    env.seedR2(
      ocrSidecarKey("deck-a", "mat-pdf"),
      JSON.stringify({
        pages: [{ page: 1, text: "Mitochondria produce ATP" }],
      }),
    );
    const jobId = await enqueueGeneration(env, {
      materialId: "mat-pdf",
      deckId: "deck-a",
    });
    await processGenerateJob(
      env,
      { jobId, materialId: "mat-pdf", deckId: "deck-a" },
      { llm: mockLlmAdapter() },
    );
    const job = env.getGenerationJobs().find((row) => row.id === jobId);
    expect(job?.status).toBe("needs_review");
    expect(job?.error).toBeNull();
    expect(env.getCards().length).toBeGreaterThan(0);
  });
});

/** One font, N pages. Enough for unpdf to report numPages. */
function pdfWithPages(count: number): ArrayBuffer {
  const stream = "BT /F1 12 Tf 50 100 Td (P) Tj ET";
  const objects: string[] = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "",
    "3 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  const kids: string[] = [];
  for (let i = 0; i < count; i++) {
    const pageId = 4 + i * 2;
    const contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    objects.push(
      `${pageId} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${contentId} 0 R /Resources<< /Font<< /F1 3 0 R >> >> >>endobj\n`,
    );
    objects.push(
      `${contentId} 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`,
    );
  }
  objects[1] =
    `2 0 obj<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${count} >>endobj\n`;
  let body = "%PDF-1.1\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefStart = body.length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return asBuffer(new TextEncoder().encode(body + xref + trailer));
}

function seedReadyPdf() {
  const env = createTestEnv();
  env.seedUser({
    id: "user-a",
    email: "a@example.com",
    password_hash: null,
    oauth_subject: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedDeck({
    id: "deck-a",
    user_id: "user-a",
    title: "Owner deck",
    subject_hint: null,
    created_at: "2026-01-01T00:00:00.000Z",
  });
  env.seedSession("sess-a", "user-a");
  env.seedMaterial({
    id: "mat-1",
    deck_id: "deck-a",
    kind: "pdf",
    r2_key: "materials/deck-a/mat-1.pdf",
    filename: "lecture.pdf",
    page_count: null,
    status: "ready",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  return env;
}

describe("ocr refetch", () => {
  it("signs a GET for the owner including resume past page 120", async () => {
    const env = seedReadyPdf();
    const res = await app.request(
      "/api/materials/mat-1/ocr-refetch",
      { method: "POST", headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      refill: boolean;
      downloadUrl?: string;
      expiresIn?: number;
    };
    expect(body.refill).toBe(true);
    expect(body.expiresIn).toBe(900);
    expect(body.downloadUrl).toContain("materials/deck-a/mat-1.pdf");
    expect(body.downloadUrl).toContain("X-Amz-Expires=900");

    env.seedGenerationJob({
      id: "job-far",
      material_id: "mat-1",
      status: "failed",
      error: null,
      coverage_json: JSON.stringify({
        window_resume: { used_keys: [], next_page: 121, total_pages: 200 },
      }),
      progress_json: null,
      created_at: "2026-01-02T00:00:00.000Z",
      finished_at: "2026-01-02T00:00:00.000Z",
    });
    const resumed = await app.request(
      "/api/materials/mat-1/ocr-refetch",
      { method: "POST", headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(resumed.status).toBe(200);
    const resumedBody = (await resumed.json()) as {
      refill: boolean;
      downloadUrl?: string;
      expiresIn?: number;
      startPage?: number;
      windowEnd?: number;
    };
    expect(resumedBody.refill).toBe(true);
    expect(resumedBody.expiresIn).toBe(900);
    expect(resumedBody.startPage).toBe(121);
    expect(resumedBody.windowEnd).toBe(240);
    expect(resumedBody.downloadUrl).toContain("materials/deck-a/mat-1.pdf");
    expect(resumedBody.downloadUrl).toContain("X-Amz-Expires=900");
  });

  it("rejects a paste material", async () => {
    const env = seedReadyPdf();
    env.seedMaterial({
      id: "mat-paste",
      deck_id: "deck-a",
      kind: "paste",
      r2_key: "materials/deck-a/mat-paste.txt",
      filename: "notes.txt",
      page_count: null,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const res = await app.request(
      "/api/materials/mat-paste/ocr-refetch",
      { method: "POST", headers: { cookie: `${SESSION_COOKIE}=sess-a` } },
      env,
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 for a stranger", async () => {
    const env = seedReadyPdf();
    env.seedUser({
      id: "user-b",
      email: "b@example.com",
      password_hash: null,
      oauth_subject: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    env.seedSession("sess-b", "user-b");
    const res = await app.request(
      "/api/materials/mat-1/ocr-refetch",
      { method: "POST", headers: { cookie: `${SESSION_COOKIE}=sess-b` } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("appends a new page, keeps stored text, and marks unstudied behind the cursor", async () => {
    const env = seedReadyPdf();
    env.seedGenerationJob({
      id: "job-resume-41",
      material_id: "mat-1",
      status: "failed",
      error: null,
      coverage_json: JSON.stringify({
        window_resume: { used_keys: [], next_page: 41, total_pages: 200 },
      }),
      progress_json: null,
      created_at: "2026-01-02T00:00:00.000Z",
      finished_at: "2026-01-02T00:00:00.000Z",
    });
    env.seedR2(
      ocrSidecarKey("deck-a", "mat-1"),
      JSON.stringify({ pages: [{ page: 1, text: "first" }] }),
    );
    const pagesBody = {
      pages: [
        { page: 9, text: "later" },
        { page: 1, text: "overwrite" },
      ],
    };
    const res = await app.request(
      "/api/materials/mat-1/ocr-pages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify(pagesBody),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stored: 2 });
    const stored = env.getR2(ocrSidecarKey("deck-a", "mat-1"));
    expect(typeof stored).toBe("string");
    const parsed = JSON.parse(stored as string) as {
      pages: { page: number; text: string }[];
      unstudiedPages?: number[];
    };
    expect(parsed.pages).toEqual([
      { page: 1, text: "first" },
      { page: 9, text: "later" },
    ]);
    expect(parsed.unstudiedPages).toEqual([9]);

    const beforeSecond = stored as string;
    const second = await app.request(
      "/api/materials/mat-1/ocr-pages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${SESSION_COOKIE}=sess-a`,
        },
        body: JSON.stringify(pagesBody),
      },
      env,
    );
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ stored: 2 });
    expect(env.getR2(ocrSidecarKey("deck-a", "mat-1"))).toBe(beforeSecond);
  });
});
