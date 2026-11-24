import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Popover from "@mui/material/Popover";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { ClaimCoverage, ClaimCoverageRow } from "../../api/client";

export type ClaimJumpTarget = {
  cardId: string;
  cardStatus?: string | null;
  jobId?: string | null;
};

export const CLAIM_COVERAGE_SEGMENT_COLORS = {
  linked: "#5B2C6F",
  orphan: "#D4C4B0",
} as const;

type Props = {
  coverage: ClaimCoverage | null;
  onJumpToCard?: (target: ClaimJumpTarget) => void;
};

function claimLabel(row: ClaimCoverageRow): string {
  const parts = [row.subject, row.predicate];
  if (row.object) parts.push(row.object);
  return parts.join(" ");
}

function canJump(
  row: ClaimCoverageRow,
  onJump?: Props["onJumpToCard"],
): boolean {
  if (!onJump || row.card_id == null) return false;
  if (row.card_status === "accepted") return true;
  if (row.card_status === "draft" && row.job_id) return true;
  return false;
}

function claimSecondary(row: ClaimCoverageRow): string {
  if (row.card_id == null) return "Orphan";
  if (row.card_status === "accepted") return "Accepted";
  if (row.card_status === "draft") return "Draft";
  return row.card_status ?? "Linked";
}

export default function ClaimCoverageFilmstrip({
  coverage,
  onJumpToCard,
}: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!coverage || coverage.summary.total === 0) return null;

  const { linked, orphan, total } = coverage.summary;
  const open = anchor !== null;

  return (
    <>
      <Tooltip
        title={`${linked} linked, ${orphan} orphan`}
        enterDelay={400}
      >
        <ButtonBase
          onClick={(ev) => setAnchor(ev.currentTarget)}
          aria-label={`${linked} of ${total} claims linked. Open claim list.`}
          aria-haspopup="dialog"
          aria-expanded={open}
          sx={{
            display: "flex",
            alignItems: "center",
            width: 120,
            maxWidth: 120,
            // 4px track is too thin to aim; pad the hit box, keep the track lean.
            minHeight: 20,
            mt: 0.25,
            borderRadius: 0.5,
            "&:hover .claim-coverage-track": {
              filter: "brightness(1.12)",
            },
            "&:focus-visible": {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: 2,
            },
          }}
        >
          <Box
            className="claim-coverage-track"
            sx={{
              display: "flex",
              height: 6,
              width: "100%",
              borderRadius: 0.5,
              overflow: "hidden",
              bgcolor: "action.hover",
            }}
          >
            {linked > 0 ? (
              <Box
                sx={{
                  flexGrow: linked,
                  flexBasis: 0,
                  bgcolor: CLAIM_COVERAGE_SEGMENT_COLORS.linked,
                  minWidth: 2,
                  height: "100%",
                }}
              />
            ) : null}
            {orphan > 0 ? (
              <Box
                sx={{
                  flexGrow: orphan,
                  flexBasis: 0,
                  bgcolor: CLAIM_COVERAGE_SEGMENT_COLORS.orphan,
                  minWidth: 2,
                  height: "100%",
                }}
              />
            ) : null}
          </Box>
        </ButtonBase>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.75,
              minWidth: 260,
              maxWidth: 320,
              bgcolor: "background.paper",
            },
          },
        }}
      >
        <Typography
          variant="caption"
          sx={{
            display: "block",
            px: 1.5,
            pt: 1.25,
            pb: 0.5,
            color: "text.secondary",
            letterSpacing: "0.02em",
          }}
        >
          {linked} linked · {orphan} orphan · {total} claims
        </Typography>
        <List dense disablePadding sx={{ maxHeight: 280, overflow: "auto" }}>
          {coverage.claims.map((row) => {
            const jumpable = canJump(row, onJumpToCard);
            const label = claimLabel(row);
            return (
              <ListItemButton
                key={row.id}
                disabled={!jumpable}
                onClick={() => {
                  if (!jumpable || !row.card_id || !onJumpToCard) return;
                  onJumpToCard({
                    cardId: row.card_id,
                    cardStatus: row.card_status,
                    jobId: row.job_id,
                  });
                  setAnchor(null);
                }}
                sx={{ py: 0.5, px: 1.5, alignItems: "flex-start" }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: 0.5,
                    mt: 0.75,
                    mr: 1,
                    flexShrink: 0,
                    bgcolor:
                      row.card_id == null
                        ? CLAIM_COVERAGE_SEGMENT_COLORS.orphan
                        : CLAIM_COVERAGE_SEGMENT_COLORS.linked,
                  }}
                />
                <ListItemText
                  primary={label}
                  secondary={claimSecondary(row)}
                  slotProps={{
                    primary: {
                      variant: "body2",
                      sx: {
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      },
                    },

                    secondary: { variant: "caption" }
                  }} />
              </ListItemButton>
            );
          })}
        </List>
      </Popover>
    </>
  );
}
