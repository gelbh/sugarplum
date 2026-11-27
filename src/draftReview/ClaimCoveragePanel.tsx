import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { CardDraftView, ClaimCoverage } from "../api/client";

const CLAIM_SPAN_GAP_DISPLAY_CAP = 10;

type Props = {
  coverage: ClaimCoverage;
  drafts: CardDraftView[];
  claimSpanGaps?: string[];
  onJumpToDraft?: (cardId: string) => void;
  onGenerateOrphan?: (claimId: string) => void;
  onFillAllOrphans?: () => void;
  onCancelFillAll?: () => void;
  generatingClaimId?: string | null;
  fillAllBusy?: boolean;
  generateDisabled?: boolean;
  /** Below md: start collapsed so the resting review surface can fit. */
  defaultCollapsed?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

function claimLabel(row: ClaimCoverage["claims"][number]): string {
  const parts = [row.subject, row.predicate];
  if (row.object) parts.push(row.object);
  return parts.join(" ");
}

const rowSx = (interactive: boolean) => ({
  display: "block" as const,
  width: "100%",
  textAlign: "left" as const,
  borderRadius: 1,
  border: interactive
    ? "1px solid rgba(232, 216, 199, 0.22)"
    : "1px dashed rgba(232, 216, 199, 0.16)",
  px: 1,
  py: 0.5,
  color: interactive ? "var(--sp-ivory)" : "text.secondary",
});

export default function ClaimCoveragePanel({
  coverage,
  drafts,
  claimSpanGaps = [],
  onJumpToDraft,
  onGenerateOrphan,
  onFillAllOrphans,
  onCancelFillAll,
  generatingClaimId = null,
  fillAllBusy = false,
  generateDisabled = false,
  defaultCollapsed = false,
  onExpandedChange,
}: Props) {
  const { linked, orphan, total } = coverage.summary;
  const shownGaps = claimSpanGaps.slice(0, CLAIM_SPAN_GAP_DISPLAY_CAP);
  const moreGaps = Math.max(0, claimSpanGaps.length - shownGaps.length);

  const [baselineOrphan, setBaselineOrphan] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  function setExpandedAndNotify(next: boolean) {
    setExpanded(next);
    onExpandedChange?.(next);
  }
  useEffect(() => {
    if (!fillAllBusy) {
      setBaselineOrphan(null);
      return;
    }
    setBaselineOrphan((prev) => prev ?? Math.max(orphan, 1));
  }, [fillAllBusy, orphan]);
  // Expand while Fill all runs so progress/list stay visible.
  useEffect(() => {
    if (!fillAllBusy) return;
    setExpanded(true);
    onExpandedChange?.(true);
  }, [fillAllBusy, onExpandedChange]);

  if (total === 0 && claimSpanGaps.length === 0) return null;

  const draftIds = new Set(drafts.map((d) => d.id));
  const orphanBusy = generateDisabled || generatingClaimId != null;
  const filledSinceStart =
    baselineOrphan != null
      ? Math.max(0, baselineOrphan - orphan)
      : 0;
  const fillPercent =
    baselineOrphan != null && baselineOrphan > 0
      ? Math.min(100, Math.round((filledSinceStart / baselineOrphan) * 100))
      : 0;
  const showFillControl = Boolean(
    (onFillAllOrphans || onCancelFillAll) && (orphan > 0 || fillAllBusy),
  );
  const fillButtonLabel = fillAllBusy
    ? "Cancel"
    : `Fill all (${orphan})`;
  const fillProgressLabel =
    baselineOrphan != null
      ? `Filling ${filledSinceStart}/${baselineOrphan}…`
      : "Filling…";

  return (
    <Box
      sx={{
        flexShrink: 0,
        width: "100%",
        maxWidth: 560,
        alignSelf: "center",
        borderRadius: 2,
        border: "1px solid rgba(232, 216, 199, 0.18)",
        bgcolor: "rgba(18, 7, 15, 0.35)",
        px: 1.5,
        pt: 1,
        pb: 1,
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "baseline",
          justifyContent: "space-between",
          mb: expanded ? 0.75 : 0,
        }}
      >
        <ButtonBase
          onClick={() => setExpandedAndNotify(!expanded)}
          aria-expanded={expanded}
          aria-label={
            expanded ? "Collapse claim coverage" : "Expand claim coverage"
          }
          sx={{
            borderRadius: 1,
            textAlign: "left",
            px: 0.25,
            py: 0.15,
            minWidth: 0,
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              m: 0,
              fontWeight: 600,
              letterSpacing: "0.02em",
              color: "var(--sp-ivory)",
              lineHeight: 1.3,
            }}
          >
            Claim coverage{expanded ? " ▾" : " ▸"}
          </Typography>
        </ButtonBase>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
          }}
        >
          {showFillControl ? (
            <Button
              size="small"
              variant="outlined"
              disabled={fillAllBusy ? !onCancelFillAll : orphanBusy}
              onClick={() => {
                if (fillAllBusy) {
                  onCancelFillAll?.();
                  return;
                }
                onFillAllOrphans?.();
              }}
              aria-busy={fillAllBusy || undefined}
              aria-label={fillAllBusy ? "Cancel fill all" : fillButtonLabel}
              sx={{
                flexShrink: 0,
                textTransform: "none",
                borderColor: "rgba(232, 216, 199, 0.35)",
                color: "var(--sp-ivory)",
                py: 0.25,
                px: 1,
                minWidth: 0,
                lineHeight: 1.3,
              }}
            >
              {fillButtonLabel}
            </Button>
          ) : null}
          <Typography
            variant="caption"
            aria-live="polite"
            sx={{
              m: 0,
              color: fillAllBusy
                ? "var(--sp-ivory)"
                : "rgba(232, 216, 199, 0.72)",
              whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}
          >
            {fillAllBusy
              ? `${filledSinceStart} filled · ${orphan} left · ${total} claims`
              : `${linked} linked · ${orphan} orphan · ${total} claims`}
          </Typography>
        </Stack>
      </Stack>
      {expanded ? (
        <>
          {fillAllBusy ? (
            <LinearProgress
              variant={
                baselineOrphan != null ? "determinate" : "indeterminate"
              }
              value={baselineOrphan != null ? fillPercent : undefined}
              aria-label={fillProgressLabel}
              sx={{
                mb: 0.75,
                height: 3,
                borderRadius: 1,
                bgcolor: "rgba(232, 216, 199, 0.12)",
                "& .MuiLinearProgress-bar": {
                  bgcolor: "rgba(232, 216, 199, 0.72)",
                },
              }}
            />
          ) : null}
          <Stack
            spacing={0.5}
            sx={{
              maxHeight: "min(18vh, 7.5rem)",
              overflow: "auto",
              pr: 0.25,
            }}
          >
            {coverage.claims.map((row) => {
              const isOrphan = row.card_id == null;
              const cardId = row.card_id;
              const interactive =
                cardId != null &&
                draftIds.has(cardId) &&
                onJumpToDraft != null;
              const label = claimLabel(row);
              const rowBusy = generatingClaimId === row.id;
              const body = (
                <Typography
                  variant="body2"
                  sx={{ lineHeight: 1.3, flex: 1, minWidth: 0 }}
                >
                  {label}
                </Typography>
              );
              if (interactive && cardId) {
                return (
                  <ButtonBase
                    key={row.id}
                    onClick={() => onJumpToDraft(cardId)}
                    sx={rowSx(true)}
                  >
                    {body}
                  </ButtonBase>
                );
              }
              return (
                <Box
                  key={row.id}
                  sx={{
                    ...rowSx(false),
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  {body}
                  {isOrphan && onGenerateOrphan ? (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={orphanBusy}
                      onClick={() => onGenerateOrphan(row.id)}
                      sx={{
                        flexShrink: 0,
                        textTransform: "none",
                        borderColor: "rgba(232, 216, 199, 0.35)",
                        color: "var(--sp-ivory)",
                        py: 0.25,
                        px: 1,
                        minWidth: 0,
                      }}
                    >
                      {rowBusy ? "…" : "Generate"}
                    </Button>
                  ) : null}
                </Box>
              );
            })}
          </Stack>
          {claimSpanGaps.length > 0 ? (
            <Box
              sx={{
                mt: 1,
                pt: 1,
                borderTop: "1px solid rgba(232, 216, 199, 0.14)",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  m: 0,
                  mb: 0.5,
                  display: "block",
                  color: "rgba(232, 216, 199, 0.72)",
                  lineHeight: 1.3,
                }}
              >
                Unclaimed note lines ({claimSpanGaps.length})
              </Typography>
              <Stack
                spacing={0.35}
                sx={{
                  maxHeight: "min(18vh, 7.5rem)",
                  overflow: "auto",
                  pr: 0.25,
                }}
              >
                {shownGaps.map((line) => (
                  <Typography
                    key={line}
                    variant="body2"
                    sx={{
                      m: 0,
                      color: "text.secondary",
                      lineHeight: 1.3,
                      fontSize: "0.8rem",
                    }}
                  >
                    {line}
                  </Typography>
                ))}
                {moreGaps > 0 ? (
                  <Typography
                    variant="caption"
                    sx={{ m: 0, color: "rgba(232, 216, 199, 0.55)" }}
                  >
                    +{moreGaps} more
                  </Typography>
                ) : null}
              </Stack>
            </Box>
          ) : null}
        </>
      ) : null}
    </Box>
  );
}
