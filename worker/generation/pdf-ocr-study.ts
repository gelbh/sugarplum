import type { Env } from "../env";
import {
  extractPdfPageNumbers,
  extractPdfPages,
  type PdfPageText,
} from "../materials/extract-pdf";
import {
  applyOcrSidecar,
  nextUnstudiedPages,
  orphanedSidecarPages,
  writeOcrSidecar,
  type OcrSidecar,
} from "../materials/ocr-sidecar";
import { focusStudyPages, type WindowResume } from "./study-windows";

export async function studyPdfWithOcrSidecar(args: {
  env: Env;
  deckId: string;
  materialId: string;
  pdfBytes: ArrayBuffer;
  startPage: number;
  topicHints: string[];
  usedKeys: string[];
  sidecar: OcrSidecar | null;
}): Promise<{ text: string; resume: WindowResume }> {
  const previousUnstudied = args.sidecar?.unstudiedPages ?? [];
  const firstWindow = await extractPdfPages(
    args.pdfBytes.slice(0),
    args.startPage,
  );
  const nativeByPage = new Map(
    firstWindow.pages.map((page) => [page.page, page.text]),
  );
  const sparseNeeded = previousUnstudied.filter(
    (page) => !nativeByPage.has(page),
  );
  if (sparseNeeded.length > 0) {
    const sparse = await extractPdfPageNumbers(
      args.pdfBytes.slice(0),
      sparseNeeded,
    );
    for (const page of sparse) {
      nativeByPage.set(page.page, page.text);
    }
  }
  const sidecarByPage = new Map(
    (args.sidecar?.pages ?? []).map((page) => [page.page, page.text]),
  );
  const backfillPages: { page: number; text: string }[] = [];
  for (const page of previousUnstudied) {
    const nativeText = nativeByPage.get(page) ?? "";
    if (nativeText.trim()) continue;
    const sidecarText = sidecarByPage.get(page)?.trim();
    if (sidecarText) backfillPages.push({ page, text: sidecarText });
  }

  const touchedNative = new Map<number, PdfPageText>();
  for (const page of firstWindow.pages) {
    touchedNative.set(page.page, page);
  }

  const focused = await focusStudyPages(
    async (start) => {
      if (start === args.startPage) {
        return {
          ...firstWindow,
          pages: applyOcrSidecar(firstWindow.pages, args.sidecar),
        };
      }
      const window = await extractPdfPages(args.pdfBytes.slice(0), start);
      for (const page of window.pages) {
        touchedNative.set(page.page, page);
      }
      return {
        ...window,
        pages: applyOcrSidecar(window.pages, args.sidecar),
      };
    },
    {
      startPage: args.startPage,
      topicHints: args.topicHints,
      usedKeys: args.usedKeys,
      backfillPages,
    },
  );

  const orphanPages = orphanedSidecarPages({
    pages: [...touchedNative.values()].map((page) => ({
      page: page.page,
      textLayer: page.text,
      sidecarText: sidecarByPage.get(page.page),
    })),
    pickedPages: focused.pickedPages,
    nextPage: focused.resume.next_page,
  });
  const pendingAfterDrops = previousUnstudied.filter(
    (page) => !(nativeByPage.get(page) ?? "").trim(),
  );
  const next = nextUnstudiedPages({
    previous: pendingAfterDrops,
    pickedPages: focused.pickedPages,
    orphanPages,
  });
  if (next.join(",") !== previousUnstudied.join(",")) {
    try {
      // ponytail: last R2 put wins if an append overlaps this write; upgrade path is a conditional put.
      await writeOcrSidecar(
        args.env,
        args.deckId,
        args.materialId,
        args.sidecar?.pages ?? [],
        next,
      );
    } catch (err) {
      console.warn("OCR unstudied sidecar write failed", err);
    }
  }

  return { text: focused.text, resume: focused.resume };
}
