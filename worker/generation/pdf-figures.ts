import type { Env } from "../env";
import { extractFiguresViaDocling } from "../materials/docling";
import {
  bytesToBase64,
  listFigureChildrenForPdf,
  mimeFromR2Key,
  persistFigureCrops,
} from "../materials/figures";
import { MAX_IMAGE_BYTES } from "../materials/limits";
import type { FigureExtractMode } from "./enqueue";
import type { LlmAdapter } from "./llm";
import {
  PDF_FIGURE_ONLY_STAGES,
  recordDraftPreviews,
  type JobProgressEmit,
} from "./progress";
import { filterDraftsByQuality } from "./quality";
import { resolveTextLlm } from "./resolve-text-llm";
import type { CardDraft } from "./schema";

/** ponytail: 240s ceiling for Fly wake + model load; raise if cold starts exceed client 10m poll. */
const DOCLING_ACCURATE_TIMEOUT_MS = 240_000;

type SecretRow = {
  provider: string;
  ciphertext: string;
  model: string | null;
};

type FigureDraft = CardDraft & { mediaR2Keys?: string[] };

export async function collectPdfFigureDrafts(args: {
  db: D1Database;
  env: Env;
  deckId: string;
  pdfMaterialId: string;
  jobId: string;
  pdfBytes: ArrayBuffer;
  text: string;
  textError: unknown;
  secret: SecretRow | null;
  opts?: { llm?: LlmAdapter };
  progress: JobProgressEmit;
}): Promise<{ drafts: FigureDraft[]; warning?: string }> {
  const {
    db,
    env,
    deckId,
    pdfMaterialId,
    jobId,
    pdfBytes,
    text,
    textError,
    secret,
    opts,
    progress,
  } = args;

  const figureChildren = await listFigureChildrenForPdf(db, {
    deckId,
    pdfMaterialId,
  });
  const readyFigureKeys = figureChildren
    .filter((row) => row.status === "ready")
    .map((row) => row.r2_key);
  const hasUploadingFigures = figureChildren.some(
    (row) => row.status === "uploading",
  );

  const jobModeRow = await db
    .prepare("SELECT figure_extract_mode FROM generation_jobs WHERE id = ?")
    .bind(jobId)
    .first<{ figure_extract_mode: string | null }>();
  const figureExtractMode: FigureExtractMode =
    jobModeRow?.figure_extract_mode === "accurate" ? "accurate" : "fast";

  const willAttemptDocling =
    figureExtractMode === "accurate" &&
    Boolean(env.DOCLING_URL) &&
    readyFigureKeys.length === 0 &&
    !hasUploadingFigures;

  if (textError && !willAttemptDocling && readyFigureKeys.length === 0) {
    throw textError;
  }

  if (!text.trim()) {
    progress.setPresentStages(PDF_FIGURE_ONLY_STAGES);
  }

  type FigureRef = {
    r2Key: string;
    page?: number;
    caption?: string;
  };
  let figures: FigureRef[] = readyFigureKeys.map((r2Key) => ({ r2Key }));
  let warning: string | undefined;

  if (figures.length === 0 && hasUploadingFigures) {
    warning =
      "Waiting on in-flight figure uploads; skipped Docling for this run";
    console.warn(warning);
  } else if (willAttemptDocling) {
    await progress.emit("figures", 0, 0, "Waking figure extractor…");
    await progress.emit("figures", 0, 0, "Detecting figures…");
    const figureResult = await extractFiguresViaDocling(env, pdfBytes, {
      signal: AbortSignal.timeout(DOCLING_ACCURATE_TIMEOUT_MS),
    });
    if (figureResult.warning) {
      warning = figureResult.warning;
      console.warn(figureResult.warning);
    }
    if (figureResult.crops.length > 0) {
      const persisted = await persistFigureCrops(env, {
        deckId,
        pdfMaterialId,
        crops: figureResult.crops,
      });
      figures = persisted.map(({ r2Key, crop }) => ({
        r2Key,
        page: crop.page,
        caption: crop.caption,
      }));
    }
  }

  const drafts: FigureDraft[] = [];
  if (figures.length > 0) {
    await progress.emit("figures", 0, figures.length, "Processing figures");
    let vision: {
      llm: LlmAdapter;
      apiKey: string;
      provider: string;
    } | null = null;
    if (secret || opts?.llm) {
      vision = secret
        ? await resolveTextLlm(env, secret, opts, (usage) =>
            progress.addUsage(usage),
          )
        : { llm: opts!.llm!, apiKey: "", provider: "mock" };
    } else {
      warning =
        "Skipping PDF figures: vision generation requires an LLM API key.";
      console.warn(warning);
    }
    if (vision) {
      progress.setPath(
        !secret && vision.provider === "workers-ai" ? "free" : "byo",
      );
      for (let i = 0; i < figures.length; i++) {
        const figure = figures[i]!;
        try {
          const figureObject = await env.MATERIALS.get(figure.r2Key);
          if (!figureObject) {
            console.warn(`Figure R2 object missing: ${figure.r2Key}`);
            continue;
          }
          const figureBytes = await figureObject.arrayBuffer();
          if (figureBytes.byteLength > MAX_IMAGE_BYTES) {
            warning = `Skipped oversized figure(s); max ${MAX_IMAGE_BYTES / (1024 * 1024)}MB`;
            console.warn(`Skipping oversized PDF figure: ${figure.r2Key}`);
            continue;
          }
          const generated = await vision.llm.generateDrafts({
            text: "",
            apiKey: vision.apiKey,
            provider: vision.provider,
            image: {
              mimeType: mimeFromR2Key(figure.r2Key),
              base64: bytesToBase64(figureBytes),
            },
          });
          recordDraftPreviews(progress, "figures", generated);
          const excerpt =
            figure.caption?.trim() || `Figure p.${figure.page ?? "?"}#${i}`;
          const pages = figure.page && figure.page >= 1 ? [figure.page] : [];
          drafts.push(
            ...filterDraftsByQuality(generated).map((draft) => ({
              ...draft,
              mediaR2Keys: [figure.r2Key],
              provenance: {
                pages: pages.length > 0 ? pages : draft.provenance.pages,
                excerpt: draft.provenance.excerpt?.trim() || excerpt,
              },
            })),
          );
        } catch (err) {
          console.warn(
            `PDF figure generation failed for ${figure.r2Key}`,
            err,
          );
        } finally {
          await progress.emit(
            "figures",
            i + 1,
            figures.length,
            warning ? `Processing figures (${warning})` : "Processing figures",
          );
        }
      }
    } else {
      await progress.emit(
        "figures",
        figures.length,
        figures.length,
        warning ?? "Processing figures",
      );
    }
  } else {
    await progress.emit("figures", 0, 0, warning ?? "No figures found");
  }

  return { drafts, warning };
}
