import Box from "@mui/material/Box";
import { mediaUrl } from "../../api/client";
import {
  occlusionTileFocusTransform,
  type OcclusionMaskBox,
} from "./occlusionLayout";

export default function OcclusionFocusMedia({
  imageKey,
  masks,
  showMasks,
  focused,
}: {
  imageKey: string;
  masks: OcclusionMaskBox[];
  showMasks: boolean;
  focused: boolean;
}) {
  const focusMask = masks[0];
  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        mb: focused ? 0 : 1.5,
        ...(focused
          ? {
              // Tile: focus-crop around the study mask.
              overflow: "hidden",
              flex: 1,
              minHeight: 0,
              flexShrink: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }
          : {
              // Editor: leftover face height above the prompt. Container
              // queries size the img to this slot (plain % max-height cannot
              // resolve on a shrink-wrapped parent).
              containerType: "size",
              display: "grid",
              placeItems: "center",
              flex: "1 1 auto",
              minHeight: 0,
              width: "100%",
              overflow: "hidden",
              borderRadius: 1,
              mb: 0,
            }),
      }}
    >
      <Box
        sx={{
          position: "relative",
          lineHeight: 0,
          ...(focused && focusMask
            ? {
                width: "100%",
                ...occlusionTileFocusTransform(focusMask),
              }
            : {
                // Shrink-wrap both axes to the painted image so % masks align.
                width: "fit-content",
                height: "fit-content",
                maxWidth: "100%",
                maxHeight: "100%",
              }),
        }}
      >
        <Box
          component="img"
          src={mediaUrl(imageKey)}
          alt=""
          draggable={false}
          sx={
            focused
              ? {
                  display: "block",
                  width: "100%",
                  height: "auto",
                  userSelect: "none",
                }
              : {
                  display: "block",
                  maxWidth: "100cqw",
                  maxHeight: "100cqh",
                  width: "auto",
                  height: "auto",
                  borderRadius: 1,
                  userSelect: "none",
                }
          }
        />
        {showMasks
          ? masks.map((mask, i) => (
              <Box
                key={`${mask.x}-${mask.y}-${mask.w}-${mask.h}-${i}`}
                aria-hidden
                sx={{
                  position: "absolute",
                  left: `${mask.x * 100}%`,
                  top: `${mask.y * 100}%`,
                  width: `${mask.w * 100}%`,
                  height: `${mask.h * 100}%`,
                  borderRadius: "4px",
                  bgcolor: "var(--sp-stage-bg)",
                  border: "1.5px solid",
                  borderColor: "secondary.main",
                }}
              />
            ))
          : null}
      </Box>
    </Box>
  );
}
