import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { MouseEvent } from "react";
import { isPlainClick, navigate } from "../../shared/nav/navigate";
import type { DueDeckRemainder, DueDeckRow } from "../queue/dueBreakdown";

export type TodayDueBreakdownProps = {
  introUsed: number | null;
  reviewUsed: number | null;
  rows: DueDeckRow[];
  remainder: DueDeckRemainder | null;
};

const LEGEND = [
  { label: "new", color: "grey.500" },
  { label: "review", color: "var(--sp-grade-good-border, #8b5a9e)" },
] as const;

export default function TodayDueBreakdown({
  introUsed,
  reviewUsed,
  rows,
  remainder,
}: TodayDueBreakdownProps) {
  const showSplit =
    introUsed != null && reviewUsed != null && introUsed + reviewUsed > 0;

  return (
    <Box sx={{ mt: 1.5, width: "100%" }}>
      {showSplit ? (
        <>
          <Typography
            variant="body1"
            component="p"
            sx={{
              m: 0,
              color: "text.secondary",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Box
              component="span"
              sx={{ color: "text.primary", fontWeight: 600 }}
            >
              {introUsed}
            </Box>{" "}
            new ·{" "}
            <Box
              component="span"
              sx={{ color: "text.primary", fontWeight: 600 }}
            >
              {reviewUsed}
            </Box>{" "}
            review
          </Typography>
          <Box
            role="img"
            aria-label={`${introUsed} new, ${reviewUsed} review`}
            sx={{
              display: "flex",
              height: 8,
              borderRadius: 1,
              overflow: "hidden",
              bgcolor: "action.hover",
              mt: 1.5,
              mx: "auto",
              maxWidth: 220,
            }}
          >
            {introUsed > 0 ? (
              <Box
                sx={{
                  flexGrow: introUsed,
                  flexBasis: 0,
                  bgcolor: "grey.500",
                  minWidth: 2,
                }}
              />
            ) : null}
            {reviewUsed > 0 ? (
              <Box
                sx={{
                  flexGrow: reviewUsed,
                  flexBasis: 0,
                  bgcolor: "var(--sp-grade-good-border, #8b5a9e)",
                  minWidth: 2,
                }}
              />
            ) : null}
          </Box>
          <Stack
            direction="row"
            spacing={1.75}
            sx={{
              justifyContent: "center",
              mt: 1
            }}>
            {LEGEND.map(({ label, color }) => (
              <Typography
                key={label}
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.75,

                  "&::before": {
                    content: '""',
                    width: 8,
                    height: 8,
                    borderRadius: 0.5,
                    bgcolor: color,
                  }
                }}>
                {label}
              </Typography>
            ))}
          </Stack>
        </>
      ) : null}

      {rows.length > 0 ? (
        <Box
          sx={{
            mt: showSplit ? 2.5 : 1.5,
            pt: 2,
            borderTop: 1,
            borderColor: "divider",
            textAlign: "left",
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              display: "block",
              mb: 1,
              letterSpacing: "0.12em",
              textTransform: "uppercase"
            }}>
            From
          </Typography>
          {rows.map((row) => {
            const href = `/study?deckId=${encodeURIComponent(row.deckId)}`;
            return (
              <Link
                key={row.deckId}
                href={href}
                underline="none"
                color="inherit"
                onClick={(ev: MouseEvent<HTMLAnchorElement>) => {
                  if (!isPlainClick(ev)) return;
                  ev.preventDefault();
                  navigate(href);
                }}
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 2,
                  py: 0.85,
                  borderBottom: 1,
                  borderColor: "divider",
                  fontSize: "0.95rem",
                }}
              >
                <Box
                  component="span"
                  sx={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.title}
                </Box>
                <Box
                  component="span"
                  sx={{
                    flex: "none",
                    color: "text.secondary",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {row.count}
                </Box>
              </Link>
            );
          })}
          {remainder ? (
            <Box
              sx={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 2,
                py: 0.85,
                color: "text.secondary",
                fontSize: "0.95rem",
              }}
            >
              <span>
                {remainder.deckCount} more{" "}
                {remainder.deckCount === 1 ? "deck" : "decks"}
              </span>
              <Box
                component="span"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {remainder.cardCount}
              </Box>
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
