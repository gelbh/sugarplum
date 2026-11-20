import { useEffect, useRef } from "react";
import { PptxViewer } from "@silurus/ooxml/pptx";
import Box from "@mui/material/Box";

export type NotesPptxStageProps = {
  bytes: Uint8Array;
  /** 1-based provenance / scrubber slide. */
  page: number;
  onPageCount?: (count: number) => void;
  /** 1-based slide when the viewer reports a change. */
  onStagePage?: (page: number) => void;
};

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = bytes.slice();
  return copy.buffer.slice(
    copy.byteOffset,
    copy.byteOffset + copy.byteLength,
  ) as ArrayBuffer;
}

export function NotesPptxStage({
  bytes,
  page,
  onPageCount,
  onStagePage,
}: NotesPptxStageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<PptxViewer | null>(null);
  const skipStageSyncUntilRef = useRef(0);
  const pageRef = useRef(page);
  pageRef.current = page;
  const onPageCountRef = useRef(onPageCount);
  onPageCountRef.current = onPageCount;
  const onStagePageRef = useRef(onStagePage);
  onStagePageRef.current = onStagePage;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let cancelled = false;
    const width = Math.max(320, Math.floor(host.clientWidth) || 640);
    const viewer = new PptxViewer(canvas, {
      width,
      useGoogleFonts: false,
      onSlideChange: (index, total) => {
        onPageCountRef.current?.(total);
        if (Date.now() < skipStageSyncUntilRef.current) return;
        const oneBased = index + 1;
        if (oneBased === pageRef.current) return;
        onStagePageRef.current?.(oneBased);
      },
    });
    viewerRef.current = viewer;

    void (async () => {
      try {
        await viewer.load(bytesToArrayBuffer(bytes));
        if (cancelled) return;
        const total = viewer.slideCount;
        onPageCountRef.current?.(total);
        if (total < 1) return;
        const target = Math.min(Math.max(pageRef.current, 1), total) - 1;
        skipStageSyncUntilRef.current = Date.now() + 400;
        await viewer.goToSlide(target);
        if (!cancelled) await viewer.fitWidth();
      } catch {
        // Dialog shows excerpt / error chrome; leave canvas empty.
      }
    })();

    const ro = new ResizeObserver(() => {
      const v = viewerRef.current;
      if (!v || v.slideCount < 1) return;
      void v.fitWidth();
    });
    ro.observe(host);

    return () => {
      cancelled = true;
      ro.disconnect();
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [bytes]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.slideCount < 1) return;
    const target = Math.min(Math.max(page, 1), viewer.slideCount) - 1;
    if (viewer.slideIndex === target) return;
    skipStageSyncUntilRef.current = Date.now() + 400;
    void viewer.goToSlide(target).then(() => viewer.fitWidth());
  }, [page]);

  return (
    <Box
      ref={hostRef}
      sx={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto",
        bgcolor: "grey.100",
      }}
    >
      <canvas ref={canvasRef} style={{ maxWidth: "100%", height: "auto" }} />
    </Box>
  );
}
