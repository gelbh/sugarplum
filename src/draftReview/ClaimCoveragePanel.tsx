import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { CardDraftView, ClaimCoverage } from "../api/client";

type Props = {
  coverage: ClaimCoverage;
  drafts: CardDraftView[];
  onJumpToDraft?: (cardId: string) => void;
  onGenerateOrphan?: (claimId: string) => void;
  onFillAllOrphans?: () => void;
  generatingClaimId?: string | null;
  fillAllBusy?: boolean;
  generateDisabled?: boolean;
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
  onJumpToDraft,
  onGenerateOrphan,
  onFillAllOrphans,
  generatingClaimId = null,
  fillAllBusy = false,
  generateDisabled = false,
}: Props) {
  if (coverage.summary.total === 0) return null;

  const draftIds = new Set(drafts.map((d) => d.id));
  const { linked, orphan, total } = coverage.summary;
  const orphanBusy =
    generateDisabled || generatingClaimId != null || fillAllBusy;

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
          mb: 0.75
        }}>
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
          Claim coverage
        </Typography>
        <Stack direction="row" spacing={1} sx={{
          alignItems: "center"
        }}>
          {orphan > 0 && onFillAllOrphans ? (
            <Button
              size="small"
              variant="outlined"
              disabled={orphanBusy}
              onClick={() => onFillAllOrphans()}
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
              {fillAllBusy ? "…" : `Fill all (${orphan})`}
            </Button>
          ) : null}
          <Typography
            variant="caption"
            sx={{
              m: 0,
              color: "rgba(232, 216, 199, 0.72)",
              whiteSpace: "nowrap",
              lineHeight: 1.3,
            }}
          >
            {linked} linked · {orphan} orphan · {total} claims
          </Typography>
        </Stack>
      </Stack>
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
            cardId != null && draftIds.has(cardId) && onJumpToDraft != null;
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
    </Box>
  );
}
