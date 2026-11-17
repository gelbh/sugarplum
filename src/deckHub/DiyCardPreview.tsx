import { useEffect, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { FlipCardPlate, StudyCardPlate } from "../components/CardFace";
import { CardFaceMcqBody } from "../components/cardFaceMcq";
import ClozePrompt from "../components/ClozePrompt";
import type { DraftPreviewFace } from "../components/DraftCardEditor";
import {
  FACE_ANSWER_TEXT_SX,
  FACE_BODY_SX,
  FACE_FRONT_ECHO_SX,
  FACE_HINT_TEXT_SX,
  FACE_MEDIA_SX,
  FACE_PROMPT_TEXT_SX,
  PROMPT_SX,
} from "../components/studyFaceSx";
import { clozeExtraSubtitle, extractClozeAnswers } from "../lib/clozeFormat";
import { backAnswer, isOcclusionFront } from "../lib/draftCardModel";
import { mediaUrl, type CardDraftView } from "../api/client";
import {
  occlusionTileFocusTransform,
  type OcclusionMaskBox,
} from "../lib/occlusionLayout";
import {
  occlusionRevealAnswer,
  pickOcclusionRegion,
} from "../study/pickOcclusionRegion";

type Props = {
  card: CardDraftView;
  face?: DraftPreviewFace;
  action?: ReactNode;
  variant?: "editor" | "tile";
};

function OcclusionFocusMedia({
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

function previewFront(card: CardDraftView): string {
  if (isOcclusionFront(card.front)) {
    return card.front.prompt?.trim() ?? "";
  }
  return typeof card.front === "string" ? card.front : "";
}

function previewParts(card: CardDraftView): {
  front: string;
  back: string;
  occlusion:
    | {
        imageKey: string;
        masks: OcclusionMaskBox[];
        studyMask: OcclusionMaskBox | undefined;
      }
    | undefined;
  imageKey: string | undefined;
} {
  const fallback = backAnswer(card.back);
  if (card.type === "occlusion" && isOcclusionFront(card.front)) {
    const region = pickOcclusionRegion(card.id, card.front.regions);
    const imageKey = card.front.image_key.trim() || undefined;
    if (!imageKey) {
      return {
        front: previewFront(card),
        back: fallback,
        occlusion: undefined,
        imageKey,
      };
    }
    const masks = card.front.regions.map((r) => ({
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
    }));
    return {
      front: previewFront(card),
      back: occlusionRevealAnswer(region, fallback),
      occlusion: {
        imageKey,
        masks,
        studyMask: region
          ? { x: region.x, y: region.y, w: region.w, h: region.h }
          : masks[0],
      },
      imageKey,
    };
  }
  return {
    front: previewFront(card),
    back: fallback,
    occlusion: undefined,
    imageKey: card.media_r2_keys?.[0],
  };
}

export default function DiyCardPreview({
  card,
  face = "front",
  action,
  variant = "editor",
}: Props) {
  const [manualFace, setManualFace] = useState<DraftPreviewFace | null>(null);
  const parts = previewParts(card);
  const shownFace = manualFace ?? face;
  const revealed = shownFace === "back";
  const isCloze = card.type === "cloze";
  const isTile = variant === "tile";
  const clozeExtra = isCloze ? clozeExtraSubtitle(parts.back) : null;
  const answerText = isCloze
    ? extractClozeAnswers(parts.front).join(" · ")
    : parts.back;

  useEffect(() => {
    setManualFace(null);
  }, [face, card.type]);

  const empty =
    !parts.front.trim() &&
    !parts.back.trim() &&
    !parts.occlusion &&
    !parts.imageKey &&
    !(card.options ?? []).some((o) => o.trim());

  function toggleFace() {
    setManualFace(revealed ? "front" : "back");
  }

  // Browse tiles must not trap wheel/trackpad scroll (study faces use overflow auto).
  const faceBodySx = isTile
    ? {
        ...FACE_BODY_SX,
        overflow: "hidden",
        overflowY: "hidden",
        overscrollBehavior: "auto",
      }
    : FACE_BODY_SX;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: isTile ? 0 : 1.25,
        width: "100%",
        height: isTile ? "100%" : undefined,
        p: isTile ? 0 : { xs: 1.5, md: 2 },
        borderRadius: isTile ? 0 : 2,
        border: isTile ? "none" : "1px solid",
        borderColor: isTile ? undefined : "rgba(232, 216, 199, 0.14)",
        bgcolor: isTile ? "transparent" : "rgba(18, 7, 15, 0.35)",
        minWidth: isTile ? undefined : 0,
        maxWidth: isTile ? undefined : "100%",
        boxSizing: "border-box",
      }}
    >
      {isTile ? null : (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
        >
          <Typography
            component="p"
            sx={{
              m: 0,
              fontSize: "0.6875rem",
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "text.secondary",
            }}
          >
            Live preview
          </Typography>
          <Typography
            component="p"
            sx={{
              m: 0,
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "primary.light",
            }}
          >
            {shownFace}
          </Typography>
        </Stack>
      )}

      <Box
        sx={{
          width: "100%",
          maxWidth: isTile
            ? "none"
            : card.type === "mcq"
              ? 280
              : card.type === "occlusion"
                ? 280
                : 240,
          mx: "auto",
          // Width-driven aspect so the plate fits the sticky 280px lane
          // (height-driven 5/7 from .sp-playing-card overflows and clips).
          aspectRatio: "var(--sp-card-aspect)",
          maxHeight: isTile
            ? "none"
            : card.type === "mcq"
              ? 360
              : card.type === "occlusion"
                ? "min(420px, 70vh)"
                : 300,
          height: isTile ? "100%" : undefined,
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {empty ? (
          <Box
            sx={{
              width: "100%",
              height: "100%",
              borderRadius: 2,
              border: "1px dashed",
              borderColor: "rgba(232, 216, 199, 0.22)",
              display: "grid",
              placeItems: "center",
              px: 2,
              textAlign: "center",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Appears as you write
            </Typography>
          </Box>
        ) : card.type === "mcq" ? (
          <StudyCardPlate
            plateSx={
              isTile
                ? {
                    width: "100%",
                    maxWidth: "100%",
                    height: "100%",
                    maxHeight: "100%",
                    minHeight: 0,
                  }
                : undefined
            }
          >
            <CardFaceMcqBody
              preview
              cardId={card.id}
              front={parts.front.trim() || "Question"}
              back={parts.back}
              options={
                (card.options ?? []).some((o) => o.trim())
                  ? card.options
                  : ["Choice 1", "Choice 2", "Choice 3"]
              }
            />
          </StudyCardPlate>
        ) : (
          <FlipCardPlate
            revealed={revealed}
            onPlateClick={toggleFace}
            plateSx={{
              cursor: "pointer",
              ...(isTile
                ? {
                    width: "100%",
                    maxWidth: "100%",
                    height: "100%",
                    maxHeight: "100%",
                    minHeight: 0,
                  }
                : card.type === "occlusion"
                  ? {
                      // Beat brand.css `.sp-playing-card { aspect-ratio: 5/7 }`
                      // (same specificity as emotion otherwise loses by order).
                      width: "100%",
                      maxWidth: "100%",
                      height: "100%",
                      maxHeight: "100%",
                      minWidth: 0,
                      "&&": { aspectRatio: "auto" },
                    }
                  : {}),
            }}
            faceSx={
              card.type === "occlusion" && !isTile
                ? { overflow: "hidden", "&&": { aspectRatio: "auto" } }
                : undefined
            }
            front={
              <Box data-card-face-content sx={faceBodySx}>
                {parts.occlusion && !isTile ? (
                  <>
                    <OcclusionFocusMedia
                      imageKey={parts.occlusion.imageKey}
                      masks={parts.occlusion.masks}
                      showMasks
                      focused={false}
                    />
                    {parts.front.trim() ? (
                      <Typography
                        component="p"
                        sx={{
                          ...FACE_PROMPT_TEXT_SX,
                          flexShrink: 0,
                          mt: 1,
                          fontSize: { xs: "0.95rem", sm: "1.05rem" },
                        }}
                      >
                        {parts.front}
                      </Typography>
                    ) : null}
                  </>
                ) : (
                  <Box sx={PROMPT_SX}>
                    {parts.occlusion ? (
                      <OcclusionFocusMedia
                        imageKey={parts.occlusion.imageKey}
                        masks={
                          isTile && parts.occlusion.studyMask
                            ? [parts.occlusion.studyMask]
                            : parts.occlusion.masks
                        }
                        showMasks
                        focused={isTile}
                      />
                    ) : parts.imageKey ? (
                      <Box
                        component="img"
                        src={mediaUrl(parts.imageKey)}
                        alt=""
                        draggable={false}
                        sx={FACE_MEDIA_SX}
                      />
                    ) : null}
                    {parts.front.trim() ? (
                      <Typography component="p" sx={FACE_PROMPT_TEXT_SX}>
                        {isCloze ? (
                          <ClozePrompt front={parts.front} />
                        ) : (
                          parts.front
                        )}
                      </Typography>
                    ) : (
                      <Typography
                        component="p"
                        sx={{ ...FACE_PROMPT_TEXT_SX, opacity: 0.45 }}
                      >
                        Front
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            }
            back={
              <Box data-card-face-content sx={faceBodySx}>
                {parts.occlusion && parts.imageKey && !isTile ? (
                  <OcclusionFocusMedia
                    imageKey={parts.imageKey}
                    masks={parts.occlusion.masks}
                    showMasks={false}
                    focused={false}
                  />
                ) : (
                  <>
                    {parts.occlusion && parts.imageKey ? (
                      <OcclusionFocusMedia
                        imageKey={parts.imageKey}
                        masks={
                          isTile && parts.occlusion.studyMask
                            ? [parts.occlusion.studyMask]
                            : parts.occlusion.masks
                        }
                        showMasks={false}
                        focused={isTile}
                      />
                    ) : !isCloze && parts.front.trim() ? (
                      <Typography component="p" sx={FACE_FRONT_ECHO_SX}>
                        {parts.front}
                      </Typography>
                    ) : null}
                    <Box sx={PROMPT_SX}>
                      <Typography component="p" sx={FACE_ANSWER_TEXT_SX}>
                        {answerText.trim() || "Back"}
                      </Typography>
                      {clozeExtra ? (
                        <Typography component="p" sx={FACE_HINT_TEXT_SX}>
                          {clozeExtra}
                        </Typography>
                      ) : null}
                    </Box>
                  </>
                )}
              </Box>
            }
          />
        )}
      </Box>

      {isTile ? null : (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textAlign: "center" }}
        >
          {card.type === "mcq"
            ? "As it appears in study"
            : "Tap the card, or focus a field to flip"}
        </Typography>
      )}
      {action ? (
        <Box sx={{ pt: 0.5, display: "flex", justifyContent: "center" }}>
          {action}
        </Box>
      ) : null}
    </Box>
  );
}
