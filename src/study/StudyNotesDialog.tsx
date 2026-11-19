import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
import {
  normalizeExcerptText,
  pagesForExcerpt,
  resolveNotesDisplayPage,
  type PageText,
} from "./excerptPages";
import type { NotesEmbedRescue } from "./notesEmbedPdf";
import {
  clampNotesPage,
  pagesToPersistAfterNavigate,
  pagesToPersistAfterRescue,
  pagesToPersistAfterSearchHits,
} from "./notesProvenanceWrite";
import { extractPptxSlides } from "./pptxSlideText";

const NotesEmbedPdfStage = lazy(() =>
  import("./notesEmbedPdf").then((mod) => ({
    default: mod.NotesEmbedPdfStage,
  })),
);

const NotesPptxStage = lazy(() =>
  import("./notesPptx").then((mod) => ({
    default: mod.NotesPptxStage,
  })),
);

const FILE_ERROR = "Could not open the file.";

type MaterialKind = "pdf" | "pptx";

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
  const copyRef = useRef<(() => void) | null>(null);
  const [title, setTitle] = useState("Notes");
  const [error, setError] = useState<string | null>(null);
  const [materialKind, setMaterialKind] = useState<MaterialKind | null>(null);
  const [materialBytes, setMaterialBytes] = useState<Uint8Array | null>(null);
  const [viewPage, setViewPage] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageInput, setPageInput] = useState("");
  const [washHits, setWashHits] = useState(false);
  const [canCopy, setCanCopy] = useState(false);

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
      setCanCopy(false);
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
    setCanCopy(false);
    setViewPage(page);
    setPageInput(page != null ? String(page) : "");
  }, [open, page, cardId]);

  useEffect(() => {
    if (!open || !jobId || isGuest()) {
      setTitle("Notes");
      setError(null);
      setMaterialKind(null);
      setMaterialBytes(null);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setTitle("Notes");
    setError(null);
    setMaterialKind(null);
    setMaterialBytes(null);

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
        const kind =
          material.kind === "pdf" || material.kind === "pptx"
            ? material.kind
            : null;
        if (!kind || page === null) return;
        const response = await fetch(downloadMaterialUrl(material.id), {
          credentials: "include",
          cache: "no-store",
          signal: ac.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        setMaterialKind(kind);
        setMaterialBytes(bytes);
      } catch (err) {
        if (cancelled || isAbort(err)) return;
        setError(FILE_ERROR);
        setMaterialKind(null);
        setMaterialBytes(null);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [open, jobId, page]);

  // PDF scrubber navigate write-back (thin inventory → [displayPage]).
  useEffect(() => {
    if (
      !open ||
      materialKind !== "pdf" ||
      viewPage === null ||
      page === null ||
      !userNavRef.current
    ) {
      return;
    }
    persistPages(
      pagesToPersistAfterNavigate({
        storedFirst: lastPersistedFirstRef.current,
        displayPage: viewPage,
        excerpt,
        pageTexts: [],
      }),
    );
  }, [open, materialKind, viewPage, excerpt, page, cardId]);

  // PPTX slide-text rescue + excerpt hit for hide chrome.
  useEffect(() => {
    if (
      !open ||
      !materialBytes ||
      materialKind !== "pptx" ||
      viewPage === null
    ) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const copy = materialBytes.slice();
        const extracted = await extractPptxSlides(
          copy.buffer.slice(
            copy.byteOffset,
            copy.byteOffset + copy.byteLength,
          ) as ArrayBuffer,
        );
        if (cancelled) return;
        if (extracted.totalPages >= 1) {
          setPageCount((prev) =>
            prev === extracted.totalPages ? prev : extracted.totalPages,
          );
        }
        const scanned: PageText[] = extracted.pages.map((slide) => ({
          page: slide.page,
          text: slide.text,
        }));
        const needle = normalizeExcerptText(excerpt);
        let displayPage = viewPage;
        const current = scanned.find((s) => s.page === displayPage);
        const pageText = current?.text ?? "";

        const allowRescue = !userNavRef.current && page !== null;
        const claimedMiss =
          Boolean(needle) &&
          pagesForExcerpt(excerpt, [{ page: displayPage, text: pageText }])
            .length === 0;

        if (allowRescue && claimedMiss && scanned.length > 0) {
          const rescued = resolveNotesDisplayPage({
            claimed: displayPage,
            excerpt,
            pages: scanned,
          });
          if (rescued !== null && rescued !== displayPage) {
            displayPage = rescued;
            setViewPage(displayPage);
            setPageInput(String(displayPage));
            persistPages(
              pagesToPersistAfterRescue({
                claimed: page!,
                rescued,
                excerpt,
                scanned,
                scanComplete: true,
              }),
            );
          }
        } else if (userNavRef.current && page !== null) {
          persistPages(
            pagesToPersistAfterNavigate({
              storedFirst: lastPersistedFirstRef.current,
              displayPage,
              excerpt,
              pageTexts: [
                {
                  page: displayPage,
                  text: scanned.find((s) => s.page === displayPage)?.text ?? "",
                },
              ],
            }),
          );
        }

        if (cancelled) return;
        const hitText =
          scanned.find((s) => s.page === displayPage)?.text ?? pageText;
        const hits =
          Boolean(needle) &&
          pagesForExcerpt(excerpt, [{ page: displayPage, text: hitText }])
            .length > 0;
        setWashHits(hits);
        setError(null);
      } catch {
        if (!cancelled) {
          setWashHits(false);
          setError(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, materialBytes, materialKind, viewPage, excerpt, page, cardId]);

  const onPageCount = useCallback((count: number) => {
    if (count >= 1) setPageCount((prev) => (prev === count ? prev : count));
  }, []);

  const onSearchHits = useCallback((hits: boolean) => {
    setWashHits(hits);
  }, []);

  const onRescue = useCallback(
    ({ rescuedPage, hitPages }: NotesEmbedRescue) => {
      if (userNavRef.current || page === null) return;
      setViewPage(rescuedPage);
      setPageInput(String(rescuedPage));
      persistPages(
        pagesToPersistAfterSearchHits({
          claimed: page,
          rescued: rescuedPage,
          hitPages,
        }),
      );
    },
    [page],
  );

  const onStagePage = useCallback((next: number) => {
    setViewPage((prev) => {
      if (prev === next) return prev;
      userNavRef.current = true;
      setPageInput(String(next));
      return next;
    });
  }, []);

  const onCanCopyChange = useCallback((next: boolean) => {
    setCanCopy(next);
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

  const scrubberReady =
    pageCount >= 1 && viewPage !== null && materialBytes != null;
  const showStage = Boolean(materialBytes && viewPage !== null && materialKind);

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
          {showStage && materialKind === "pdf" ? (
            <Suspense
              fallback={<Typography sx={{ p: 2 }}>Loading viewer…</Typography>}
            >
              <NotesEmbedPdfStage
                bytes={materialBytes!}
                page={viewPage!}
                excerpt={excerpt}
                onPageCount={onPageCount}
                onSearchHits={onSearchHits}
                onStagePage={onStagePage}
                onRescue={onRescue}
                onCanCopyChange={onCanCopyChange}
                copyRef={copyRef}
              />
            </Suspense>
          ) : null}
          {showStage && materialKind === "pptx" ? (
            <Suspense
              fallback={<Typography sx={{ p: 2 }}>Loading slides…</Typography>}
            >
              <NotesPptxStage
                bytes={materialBytes!}
                page={viewPage!}
                onPageCount={onPageCount}
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
                {materialKind === "pptx" ? "Slide" : "Page"}
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
                slotProps={{
                  htmlInput: {
                    inputMode: "numeric",
                    "aria-label":
                      materialKind === "pptx" ? "Slide number" : "Page number",
                    style: { width: "3rem", textAlign: "center" },
                  }
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
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {materialKind === "pdf" ? (
            <Button
              size="small"
              disabled={!canCopy}
              onClick={() => copyRef.current?.()}
            >
              Copy
            </Button>
          ) : null}
          <Button onClick={onClose}>Close</Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
