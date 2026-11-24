import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import { type ReactNode } from "react";
import { FaceOverline } from "./faceOverline";
import { CARD_COLUMN_SX, faceMotionSx } from "./studyFaceSx";

/** Shared host + playing-card plate (MCQ and flip faces). */
export function StudyCardPlate({
  children,
  perspective,
  onPlateClick,
  plateSx,
}: {
  children: ReactNode;
  perspective?: string;
  onPlateClick?: () => void;
  plateSx?: Record<string, unknown>;
}) {
  return (
    <Box
      sx={{
        ...CARD_COLUMN_SX,
        perspective,
        maxHeight: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box
        className="sp-playing-card"
        onClick={onPlateClick}
        sx={{
          position: "relative",
          width: "auto",
          maxWidth: "min(100%, 360px)",
          maxHeight: "100%",
          height: "min(100%, 504px)",
          aspectRatio: "var(--sp-card-aspect)",
          // Flex item + aspect-ratio: auto min-width is height-derived and beats max-width.
          minWidth: 0,
          borderRadius: 2,
          bgcolor: "transparent",
          ...plateSx,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export function FlipCardPlate({
  revealed,
  front,
  back,
  onPlateClick,
  plateSx,
  faceSx,
  overlineTrailing,
  dense = false,
}: {
  revealed: boolean;
  front: ReactNode;
  back: ReactNode;
  onPlateClick?: () => void;
  plateSx?: Record<string, unknown>;
  faceSx?: Record<string, unknown>;
  overlineTrailing?: ReactNode;
  dense?: boolean;
}) {
  // Clip on a non-transformed host so rotateY cannot paint past the frame.
  const flipInner = (
    <Box
      onClick={onPlateClick}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        borderRadius: dense ? 2 : undefined,
        transformStyle: "preserve-3d",
        transition: "transform 0.45s ease",
        transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
        cursor: onPlateClick ? "pointer" : undefined,
        ...plateSx,
        "@media (prefers-reduced-motion: reduce)": {
          transform: "none",
          transition: "none",
          minHeight: dense ? 0 : 280,
          maxHeight: "100%",
        },
      }}
    >
      <Paper
        elevation={0}
        aria-hidden={revealed}
        inert={revealed || undefined}
        className="sp-playing-card"
        sx={{ ...faceMotionSx(false, !revealed, dense), ...faceSx }}
      >
        <FaceOverline
          label="Front"
          trailing={overlineTrailing}
          dense={dense}
        />
        {front}
      </Paper>

      <Paper
        elevation={0}
        aria-hidden={!revealed}
        inert={!revealed || undefined}
        className="sp-playing-card"
        sx={{ ...faceMotionSx(true, revealed, dense), ...faceSx }}
      >
        <FaceOverline label="Back" trailing={overlineTrailing} dense={dense} />
        {back}
      </Paper>
    </Box>
  );

  if (dense) {
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
          perspective: "900px",
          overflow: "hidden",
          borderRadius: 2,
        }}
      >
        {flipInner}
      </Box>
    );
  }

  return (
    <StudyCardPlate perspective="1000px" plateSx={{ overflow: "hidden" }}>
      {flipInner}
    </StudyCardPlate>
  );
}
