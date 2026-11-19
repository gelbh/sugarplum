import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { CardDraftView, ClaimCoverage } from "../api/client";

type Props = {
  coverage: ClaimCoverage;
  drafts: CardDraftView[];
  onJumpToDraft?: (cardId: string) => void;
};

function claimLabel(row: ClaimCoverage["claims"][number]): string {
  const parts = [row.subject, row.predicate];
  if (row.object) parts.push(row.object);
  return parts.join(" ");
}

export default function ClaimCoveragePanel({
  coverage,
  drafts,
  onJumpToDraft,
}: Props) {
  if (coverage.summary.total === 0) return null;

  const draftIds = new Set(drafts.map((d) => d.id));
  const { linked, orphan, total } = coverage.summary;

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
        px: 1.75,
        py: 1.5,
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{
          m: 0,
          mb: 0.75,
          fontWeight: 600,
          letterSpacing: "0.02em",
          color: "var(--sp-ivory)",
        }}
      >
        Claim coverage
      </Typography>
      <Typography
        variant="caption"
        sx={{ display: "block", mb: 1, color: "rgba(232, 216, 199, 0.72)" }}
      >
        {linked} linked · {orphan} orphan · {total} claims
      </Typography>
      <Stack
        spacing={0.75}
        sx={{ maxHeight: 180, overflow: "auto", pr: 0.5 }}
      >
        {coverage.claims.map((row) => {
          const isOrphan = row.card_id == null;
          const canJump =
            !isOrphan &&
            row.card_id != null &&
            draftIds.has(row.card_id) &&
            onJumpToDraft != null;
          const label = claimLabel(row);
          if (canJump && row.card_id) {
            const cardId = row.card_id;
            return (
              <ButtonBase
                key={row.id}
                onClick={() => onJumpToDraft(cardId)}
                sx={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  borderRadius: 1,
                  border: "1px solid rgba(232, 216, 199, 0.22)",
                  px: 1,
                  py: 0.75,
                  color: "var(--sp-ivory)",
                }}
              >
                <Typography variant="body2" sx={{ lineHeight: 1.35 }}>
                  {label}
                </Typography>
              </ButtonBase>
            );
          }
          return (
            <Box
              key={row.id}
              sx={{
                borderRadius: 1,
                border: "1px dashed rgba(232, 216, 199, 0.16)",
                px: 1,
                py: 0.75,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  lineHeight: 1.35,
                  color: "text.secondary",
                }}
              >
                {label}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
