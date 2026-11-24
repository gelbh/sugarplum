import Box from "@mui/material/Box";
import { useEffect, useRef } from "react";
import { mediaUrl } from "../../api/client";
import {
  occlusionMaskScrollTop,
  type OcclusionMaskBox,
} from "../../deckHub/kernel";
import { FACE_MEDIA_SX } from "./studyFaceSx";

/** Hide_one stage: Anki-width-fit shell + natural-aspect img (no contain letterbox). */
export function StudyMedia({
  imageKey,
  mask,
  masked,
  faceActive,
  scrollTop,
  onScrollTopChange,
}: {
  imageKey: string;
  mask?: OcclusionMaskBox;
  masked: boolean;
  /** True when this face is the visible study face (re-apply scroll on flip). */
  faceActive?: boolean;
  /** Shared shell offset; null means not centered yet (do not restore). */
  scrollTop?: number | null;
  onScrollTopChange?: (top: number) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const maskX = mask?.x;
  const maskY = mask?.y;
  const maskW = mask?.w;
  const maskH = mask?.h;

  const applyCenteredScroll = () => {
    if (
      maskX === undefined ||
      maskY === undefined ||
      maskW === undefined ||
      maskH === undefined
    ) {
      return;
    }
    const shell = shellRef.current;
    const content = contentRef.current;
    if (!shell || !content) return;
    const top = occlusionMaskScrollTop(
      { x: maskX, y: maskY, w: maskW, h: maskH },
      content.offsetHeight,
      shell.clientHeight,
    );
    shell.scrollTop = top;
    onScrollTopChange?.(top);
  };

  // Preserve scroll across flip: center only on geometry / load, never on faceActive.
  useEffect(() => {
    applyCenteredScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- center on geometry only
  }, [imageKey, maskX, maskY, maskW, maskH]);

  useEffect(() => {
    if (scrollTop == null) return;
    const shell = shellRef.current;
    if (!shell) return;
    if (Math.abs(shell.scrollTop - scrollTop) > 1) {
      shell.scrollTop = scrollTop;
    }
  }, [scrollTop, faceActive]);

  const onImageLoad = () => {
    applyCenteredScroll();
  };

  if (mask) {
    return (
      <Box
        ref={shellRef}
        onScroll={() => {
          const shell = shellRef.current;
          if (shell) onScrollTopChange?.(shell.scrollTop);
        }}
        sx={{
          // Anki-width-fit: soft viewport budget, not a short 36vh crop band.
          flex: 1,
          minHeight: 0,
          maxHeight: "min(70vh, calc(90vh - 11rem))",
          overflow: "auto",
          width: "100%",
          mb: 2,
          borderRadius: 1,
          alignSelf: "stretch",
        }}
      >
        <Box
          ref={contentRef}
          sx={{
            position: "relative",
            width: "100%",
            lineHeight: 0,
          }}
        >
          <Box
            component="img"
            src={mediaUrl(imageKey)}
            alt="Card media"
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onLoad={onImageLoad}
            sx={{
              display: "block",
              width: "100%",
              height: "auto",
              maxWidth: "100%",
              userSelect: "none",
            }}
          />
          <Box
            aria-hidden
            {...(masked
              ? { "data-occlusion-mask": true }
              : { "data-occlusion-reveal-outline": true })}
            sx={{
              position: "absolute",
              left: `${mask.x * 100}%`,
              top: `${mask.y * 100}%`,
              width: `${mask.w * 100}%`,
              height: `${mask.h * 100}%`,
              borderRadius: "4px",
              pointerEvents: "none",
              ...(masked
                ? {
                    bgcolor: "var(--sp-stage-bg)",
                    border: "1.5px solid",
                    borderColor: "secondary.main",
                    boxShadow: "0 2px 12px var(--sp-lamp-glow)",
                  }
                : {
                    border: "1.5px solid",
                    borderColor: "secondary.main",
                    opacity: 0.85,
                    boxShadow:
                      "0 0 0 1px color-mix(in srgb, var(--sp-stage-bg) 35%, transparent)",
                  }),
            }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={mediaUrl(imageKey)}
      alt="Card media"
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      sx={FACE_MEDIA_SX}
    />
  );
}
