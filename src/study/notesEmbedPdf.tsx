import { useEffect, useMemo, useRef } from "react";
import {
  DocumentGate,
  Viewer,
  useDocument,
} from "@embedpdf/react/runtime";
import { RenderLayer, renderPlugin } from "@embedpdf/react/render";
import {
  SearchLayer,
  searchPlugin,
  useSearch,
  useSearchState,
} from "@embedpdf/react/search";
import {
  Stage,
  stagePlugin,
  useStage,
  useStageState,
} from "@embedpdf/react/stage";
import { interactionPlugin } from "@embedpdf/react/interaction";
import {
  SelectionClipboard,
  SelectionLayer,
  SelectionMenu,
  copySelection,
  selectionPlugin,
  useSelection,
  useSelectionState,
} from "@embedpdf/react/selection";
import { localEngine } from "@embedpdf/engine/portable";
import type { OpenInput } from "@embedpdf/react/runtime";
import Button from "@mui/material/Button";
import { normalizeExcerptText } from "./excerptPages";

/** Grade-good wash (brand.css --sp-grade-good-wash) for search matches. */
const WASH = "rgba(91, 44, 111, 0.35)";
const WASH_ACTIVE = "rgba(91, 44, 111, 0.55)";

const notesEmbedPlugins = [
  stagePlugin(),
  renderPlugin(),
  searchPlugin({
    highlight: {
      color: WASH,
      activeColor: WASH_ACTIVE,
      blendMode: "normal",
    },
  }),
  interactionPlugin(),
  selectionPlugin(),
];

/** Portable engine: Vite's default worker URL fails to boot. */
const notesEngine = localEngine();

export type NotesEmbedPdfStageProps = {
  bytes: Uint8Array;
  /** 1-based provenance / scrubber page. */
  page: number;
  excerpt: string;
  onPageCount?: (count: number) => void;
  onSearchHits?: (hits: boolean) => void;
  /** 1-based page when the stage scrolls. */
  onStagePage?: (page: number) => void;
  /** Whether a copyable text selection exists (for dialog Copy). */
  onCanCopyChange?: (canCopy: boolean) => void;
  /** Ref filled with copy handler while the stage is mounted. */
  copyRef?: React.MutableRefObject<(() => void) | null>;
};

function NotesSelectionBridge({
  onCanCopyChange,
  copyRef,
}: {
  onCanCopyChange?: (canCopy: boolean) => void;
  copyRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const selection = useSelection();
  const { hasSelection } = useSelectionState();
  const canCopy = hasSelection && selection.canCopy();

  useEffect(() => {
    onCanCopyChange?.(canCopy);
  }, [canCopy, onCanCopyChange]);

  useEffect(() => {
    if (!copyRef) return;
    copyRef.current = () => {
      void copySelection(selection).catch(() => undefined);
    };
    return () => {
      copyRef.current = null;
    };
  }, [copyRef, selection]);

  return (
    <SelectionMenu>
      <Button
        size="small"
        variant="contained"
        disabled={!canCopy}
        onClick={() => {
          void copySelection(selection).catch(() => undefined);
        }}
      >
        Copy
      </Button>
    </SelectionMenu>
  );
}

function NotesEmbedController({
  page,
  excerpt,
  onPageCount,
  onSearchHits,
  onStagePage,
}: Omit<NotesEmbedPdfStageProps, "bytes" | "onCanCopyChange" | "copyRef">) {
  const stage = useStage();
  const search = useSearch();
  const { pageCount, currentPageIndex } = useStageState();
  const hitCount = useSearchState((state) => state.hitCount);
  const docStatus = useDocument((doc) => doc.status);
  const jumpedKeyRef = useRef("");
  const searchedKeyRef = useRef("");
  const skipStageSyncUntilRef = useRef(0);

  useEffect(() => {
    onPageCount?.(pageCount);
  }, [pageCount, onPageCount]);

  useEffect(() => {
    if (docStatus !== "ready" || pageCount < 1) {
      onSearchHits?.(false);
      return;
    }
    const pageHits = search.getHitCount(currentPageIndex);
    onSearchHits?.(pageHits > 0);
  }, [
    currentPageIndex,
    docStatus,
    hitCount,
    onSearchHits,
    pageCount,
    search,
  ]);

  useEffect(() => {
    if (docStatus !== "ready" || pageCount < 1) return;
    if (Date.now() < skipStageSyncUntilRef.current) return;
    const oneBased = currentPageIndex + 1;
    if (oneBased === page) return;
    onStagePage?.(oneBased);
  }, [currentPageIndex, docStatus, onStagePage, page, pageCount]);

  useEffect(() => {
    if (docStatus !== "ready" || pageCount < 1) return;
    const target = Math.min(Math.max(page, 1), pageCount) - 1;
    const key = `${pageCount}:${target}`;
    if (jumpedKeyRef.current === key) return;
    jumpedKeyRef.current = key;
    skipStageSyncUntilRef.current = Date.now() + 400;
    stage.goToPage(target, { behavior: "instant" });
  }, [docStatus, page, pageCount, stage]);

  useEffect(() => {
    if (docStatus !== "ready" || pageCount < 1) return;
    const needle = normalizeExcerptText(excerpt);
    const target = Math.min(Math.max(page, 1), pageCount) - 1;
    const key = `${pageCount}:${target}:${needle}`;
    if (searchedKeyRef.current === key) return;
    searchedKeyRef.current = key;
    if (!needle) {
      void search.clear();
      onSearchHits?.(false);
      return;
    }
    void search
      .search({ text: needle, matchCase: false, wholeWord: false })
      .then((result) => {
        if (result.status !== "complete") return;
        const pageHits = search.getHitCount(target);
        onSearchHits?.(pageHits > 0);
        if (pageHits < 1) return;
        const hits = search.listHits({ page: target });
        const first = hits[0];
        if (first) search.goToHit(first);
      });
  }, [docStatus, excerpt, onSearchHits, page, pageCount, search]);

  return null;
}

export function NotesEmbedPdfStage({
  bytes,
  page,
  excerpt,
  onPageCount,
  onSearchHits,
  onStagePage,
  onCanCopyChange,
  copyRef,
}: NotesEmbedPdfStageProps) {
  const source = useMemo((): OpenInput => {
    const copy = bytes.slice();
    return {
      kind: "bytes",
      id: "study-notes",
      bytes: copy.buffer.slice(
        copy.byteOffset,
        copy.byteOffset + copy.byteLength,
      ) as ArrayBuffer,
    };
  }, [bytes]);

  const initialDocuments = useMemo(() => [{ source }], [source]);

  return (
    <Viewer
      engine={notesEngine}
      plugins={notesEmbedPlugins}
      initialDocuments={initialDocuments}
      renderError={() => <p>Could not start the PDF engine.</p>}
    >
      <DocumentGate
        fallback={<p>Opening PDF…</p>}
        error={() => <p>Could not open the PDF viewer.</p>}
      >
        <NotesEmbedController
          page={page}
          excerpt={excerpt}
          onPageCount={onPageCount}
          onSearchHits={onSearchHits}
          onStagePage={onStagePage}
        />
        <SelectionClipboard />
        <NotesSelectionBridge
          onCanCopyChange={onCanCopyChange}
          copyRef={copyRef}
        />
        <Stage
          style={{
            height: "100%",
            width: "100%",
            ["--epdf-search-highlight" as string]: WASH,
            ["--epdf-search-highlight-active" as string]: WASH_ACTIVE,
            ["--epdf-search-blend-mode" as string]: "normal",
          }}
        >
          {() => (
            <>
              <RenderLayer />
              <SearchLayer />
              <SelectionLayer />
            </>
          )}
        </Stage>
      </DocumentGate>
    </Viewer>
  );
}
