import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  downloadMaterialUrl,
  getJob,
  listMaterials,
  patchCardProvenancePages,
} from "../api/client";
import { isGuest } from "../guest/session";
import { loadPdfDocument } from "../lib/pdfPageRender";
import {
  normalizeExcerptText,
  pagesForExcerpt,
  resolveNotesDisplayPage,
  type PageText,
} from "../study/excerptPages";
import {
  clampNotesPage,
  pagesToPersistAfterNavigate,
  pagesToPersistAfterRescue,
} from "../study/notesProvenanceWrite";

const NotesEmbedPdfStage = lazy(() =>
  import("../study/notesEmbedPdf").then((mod) => ({
    default: mod.NotesEmbedPdfStage,
  })),
);

const FILE_ERROR = "Could not open the file.";

type Props = {
  open: boolean;
  onClose: () => void;
  excerpt: string;
  page: number | null;
  jobId: string | null;
  cardId?: string | null;
};

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

async function pdfPagePlainText(
  pdf: Awaited<ReturnType<typeof loadPdfDocument>>,
  pageNum: number,
): Promise<string> {
  const pdfPage = await pdf.getPage(pageNum);
  const content = await pdfPage.getTextContent();
  const parts: string[] = [];
  for (const item of content.items) {
    if ("str" in item && typeof item.str === "string" && item.str) {
      parts.push(item.str);
    }
  }
  return parts.join(" ");
}

export default function StudyNotesDialog({
  open,
  onClose,
  excerpt,
  page,
  jobId,
  cardId = null,
}: Props) {
  const userNavRef = useRef(false);
  const wrotePagesRef = useRef<string>("");
  const writeSeqRef = useRef(0);
  const writeChainRef = useRef(Promise.resolve());
  const lastPersistedFirstRef = useRef<number | null>(null);
  const [title, setTitle] = useState("Notes");
  const [error, setError] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [viewPage, setViewPage] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageInput, setPageInput] = useState("");
  const [washHits, setWashHits] = useState(false);

  function persistPages(pages: number[] | null) {
    if (!cardId || isGuest() || !pages || pages.length === 0) return;
    const key = `${cardId}:${pages.join(",")}`;
    if (wrotePagesRef.current === key) return;
    wrotePagesRef.current = key;
    lastPersistedFirstRef.current = pages[0] ?? null;
    const seq = ++writeSeqRef.current;
    const id = cardId;
    writeChainRef.current = writeChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (writeSeqRef.current !== seq) return;
        try {
          await patchCardProvenancePages(id, pages);
        } catch {
          if (writeSeqRef.current === seq && wrotePagesRef.current === key) {
            wrotePagesRef.current = "";
          }
        }
      });
  }

  useEffect(() => {
    if (!open) {
      setViewPage(null);
      setPageCount(0);
      setPageInput("");
      setWashHits(false);
      userNavRef.current = false;
      wrotePagesRef.current = "";
      writeSeqRef.current = 0;
      lastPersistedFirstRef.current = page;
      return;
    }
    userNavRef.current = false;
    wrotePagesRef.current = "";
    writeSeqRef.current = 0;
    lastPersistedFirstRef.current = page;
    setWashHits(false);
    setViewPage(page);
    setPageInput(page != null ? String(page) : "");
  }, [open, page, cardId]);

  useEffect(() => {
    if (!open || !jobId || isGuest()) {
      setTitle("Notes");
      setError(null);
      setPdfBytes(null);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setTitle("Notes");
    setError(null);
    setPdfBytes(null);

    void (async () => {
      try {
        // Material stays on the source deck after a card move; resolve by id.
        const [job, materials] = await Promise.all([
          getJob(jobId),
          listMaterials(),
        ]);
        if (cancelled) return;
        const material = materials.find((item) => item.id === job.material_id);
        if (!material) {
          setError(FILE_ERROR);
          return;
        }
        setTitle(material.filename || "Notes");
        if (material.kind !== "pdf" || page === null) return;
        const response = await fetch(downloadMaterialUrl(material.id), {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        setPdfBytes(bytes);
      } catch (err) {
        if (cancelled || isAbort(err)) return;
        setError(FILE_ERROR);
        setPdfBytes(null);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [open, jobId, page]);

  // pdfjs rescue + navigate write-back (Approach C); EmbedPDF is display-only.
  useEffect(() => {
    if (!open || !pdfBytes || viewPage === null) return;

    let cancelled = false;
    void (async () => {
      let pdf: Awaited<ReturnType<typeof loadPdfDocument>> | null = null;
      try {
        const copy = pdfBytes.slice();
        pdf = await loadPdfDocument(copy.buffer as ArrayBuffer);
        const needle = normalizeExcerptText(excerpt);
        // pageCount owned by EmbedPDF (onPageCount); pdfjs only for rescue text.
        const total = pdf.numPages;

        let displayPage = viewPage;
        let pageText = "";
        try {
          pageText = await pdfPagePlainText(pdf, displayPage);
        } catch {
          pageText = "";
        }
        if (cancelled) return;

        const allowRescue = !userNavRef.current && page !== null;
        const claimedMiss =
          Boolean(needle) &&
          pagesForExcerpt(excerpt, [{ page: displayPage, text: pageText }])
            .length === 0;

        if (allowRescue && claimedMiss) {
          try {
            const scanned: PageText[] = [{ page: displayPage, text: pageText }];
            let rescuedPage: number | null = null;
            for (let pageNum = 1; pageNum <= total; pageNum++) {
              if (cancelled) return;
              if (pageNum === displayPage) continue;
              let text = "";
              try {
                text = await pdfPagePlainText(pdf, pageNum);
              } catch {
                continue;
              }
              scanned.push({ page: pageNum, text });
              if (rescuedPage === null) {
                const rescued = resolveNotesDisplayPage({
                  claimed: displayPage,
                  excerpt,
                  pages: scanned,
                });
                if (rescued !== null && rescued !== displayPage) {
                  rescuedPage = rescued;
                  displayPage = rescued;
                  try {
                    pageText = await pdfPagePlainText(pdf, displayPage);
                  } catch {
                    pageText = "";
                  }
                  if (cancelled) return;
                  setViewPage(displayPage);
                  setPageInput(String(displayPage));
                }
              }
            }
            if (rescuedPage !== null) {
              persistPages(
                pagesToPersistAfterRescue({
                  claimed: page!,
                  rescued: rescuedPage,
                  excerpt,
                  scanned,
                  scanComplete: true,
                }),
              );
            }
          } catch {
          }
        } else if (userNavRef.current && page !== null) {
          persistPages(
            pagesToPersistAfterNavigate({
              storedFirst: lastPersistedFirstRef.current,
              displayPage,
              excerpt,
              pageTexts: [{ page: displayPage, text: pageText }],
            }),
          );
        }
        if (cancelled) return;
        setError(null);
      } catch {
        // Provenance scan failed; EmbedPDF may still render the bytes.
        if (!cancelled) setError(null);
      } finally {
        await pdf?.cleanup()?.catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, pdfBytes, viewPage, excerpt, page, cardId]);

  const onPageCount = useCallback((count: number) => {
    if (count >= 1) setPageCount((prev) => (prev === count ? prev : count));
  }, []);

  const onSearchHits = useCallback((hits: boolean) => {
    setWashHits(hits);
  }, []);

  const onStagePage = useCallback((next: number) => {
    setViewPage((prev) => {
      if (prev === next) return prev;
      userNavRef.current = true;
      setPageInput(String(next));
      return next;
    });
  }, []);

  function goToPage(next: number) {
    const clamped = clampNotesPage(next, pageCount);
    if (clamped === null) {
      setPageInput(viewPage != null ? String(viewPage) : "");
      return;
    }
    if (clamped === viewPage) {
      setPageInput(String(viewPage));
      return;
    }
    userNavRef.current = true;
    setViewPage(clamped);
    setPageInput(String(clamped));
  }

  const scrubberReady = pageCount >= 1 && viewPage !== null && pdfBytes;
  const showEmbed = Boolean(pdfBytes && viewPage !== null);

  return (
    <Dialog open={open} onClose={() => onClose()} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {excerpt ? (
          <Typography
            sx={
              washHits
                ? {
                    position: "absolute",
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: "hidden",
                    clip: "rect(0, 0, 0, 0)",
                    whiteSpace: "nowrap",
                    border: 0,
                  }
                : { whiteSpace: "pre-wrap", mb: 2 }
            }
          >
            {excerpt}
          </Typography>
        ) : null}
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Box
          sx={{
            width: "100%",
            height: { xs: "55vh", sm: "65vh" },
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            bgcolor: "background.paper",
            overflow: "hidden",
          }}
        >
          {showEmbed ? (
            <Suspense fallback={<Typography sx={{ p: 2 }}>Loading viewer…</Typography>}>
              <NotesEmbedPdfStage
                bytes={pdfBytes!}
                page={viewPage!}
                excerpt={excerpt}
                onPageCount={onPageCount}
                onSearchHits={onSearchHits}
                onStagePage={onStagePage}
              />
            </Suspense>
          ) : null}
        </Box>
      </DialogContent>
      <DialogActions
        sx={{
          flexWrap: "wrap",
          gap: 1,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1,
          }}
        >
          {scrubberReady ? (
            <>
              <Button
                size="small"
                disabled={viewPage! <= 1}
                onClick={() => goToPage(viewPage! - 1)}
              >
                Prev
              </Button>
              <Typography variant="body2" component="span">
                Page
              </Typography>
              <TextField
                size="small"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => {
                  const n = Number.parseInt(pageInput, 10);
                  if (Number.isFinite(n)) goToPage(n);
                  else setPageInput(String(viewPage));
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const n = Number.parseInt(pageInput, 10);
                  if (Number.isFinite(n)) goToPage(n);
                  else setPageInput(String(viewPage));
                }}
                inputProps={{
                  inputMode: "numeric",
                  "aria-label": "Page number",
                  style: { width: "3rem", textAlign: "center" },
                }}
              />
              <Typography variant="body2" component="span">
                of {pageCount}
              </Typography>
              <Button
                size="small"
                disabled={viewPage! >= pageCount}
                onClick={() => goToPage(viewPage! + 1)}
              >
                Next
              </Button>
            </>
          ) : null}
        </Box>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
