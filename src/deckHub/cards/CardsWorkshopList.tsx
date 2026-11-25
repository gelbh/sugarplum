import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { CardDraftView } from "../../api/client";
import { cardFrontPreview } from "../../draftReview";
import { workshopCardTypeLabel } from "../workshop/workshopSearch";
import CardRowActions from "./CardRowActions";
import { SELECT_CHECKBOX_SX } from "./cardsWorkshopSx";

export default function CardsWorkshopList({
  visible,
  selectedIds,
  showArchived,
  busy,
  onToggleSelect,
  onPreview,
  onEdit,
  onMove,
  onArchive,
  onRestore,
}: {
  visible: CardDraftView[];
  selectedIds: Set<string>;
  showArchived: boolean;
  busy: boolean;
  onToggleSelect: (id: string) => void;
  onPreview: (card: CardDraftView) => void;
  onEdit: (card: CardDraftView) => void;
  onMove: (card: CardDraftView) => void;
  onArchive: (card: CardDraftView) => void;
  onRestore: (card: CardDraftView) => void;
}) {
  return (
    <Stack
      id="cards-workshop-results"
      component="ul"
      spacing={0.75}
      sx={{ m: 0, p: 0, listStyle: "none" }}
    >
      {visible.map((card) => {
        const checked = selectedIds.has(card.id);
        return (
          <Box
            component="li"
            key={card.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1,
              py: 0.85,
              borderRadius: 2,
              border: "1px solid",
              borderColor: checked
                ? "rgba(209, 163, 226, 0.42)"
                : "rgba(232, 216, 199, 0.12)",
              bgcolor: checked
                ? "rgba(91, 44, 111, 0.28)"
                : "rgba(18, 7, 15, 0.28)",
              transition:
                "background-color 140ms ease, border-color 140ms ease",
              "&:hover": {
                borderColor: checked
                  ? "rgba(209, 163, 226, 0.55)"
                  : "rgba(232, 216, 199, 0.22)",
                bgcolor: checked
                  ? "rgba(91, 44, 111, 0.34)"
                  : "rgba(91, 44, 111, 0.16)",
                "& .sp-card-row-actions": {
                  opacity: 1,
                },
              },
            }}
          >
            <Checkbox
              size="small"
              disableRipple
              checked={checked}
              disabled={busy}
              onChange={() => onToggleSelect(card.id)}
              sx={SELECT_CHECKBOX_SX}
              slotProps={{
                input: {
                  "aria-label": `Select ${cardFrontPreview(card)}`,
                },
              }}
            />
            <Box
              component="button"
              type="button"
              aria-label={`Preview ${cardFrontPreview(card)}`}
              onClick={() => onPreview(card)}
              sx={{
                flex: 1,
                minWidth: 0,
                py: 0.25,
                px: 0,
                m: 0,
                border: 0,
                bgcolor: "transparent",
                cursor: "pointer",
                textAlign: "left",
                borderRadius: 1,
                "&:hover .sp-card-row-title": {
                  color: "primary.light",
                },
                "&:focus-visible": {
                  outline: "2px solid rgba(209, 163, 226, 0.75)",
                  outlineOffset: 2,
                },
              }}
            >
              <Typography
                className="sp-card-row-title"
                variant="body2"
                noWrap
                sx={{
                  fontWeight: 500,
                  color: "rgba(245, 245, 245, 0.92)",
                  lineHeight: 1.35,
                  transition: "color 140ms ease",
                }}
              >
                {cardFrontPreview(card)}
              </Typography>
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  mt: 0.55,
                  px: 0.85,
                  py: 0.15,
                  borderRadius: 999,
                  border: "1px solid",
                  borderColor: "rgba(232, 216, 199, 0.18)",
                  bgcolor: "rgba(18, 7, 15, 0.35)",
                  typography: "caption",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "rgba(232, 216, 199, 0.62)",
                }}
              >
                {workshopCardTypeLabel(card.type)}
              </Box>
            </Box>
            <Stack
              className="sp-card-row-actions"
              direction="row"
              spacing={0.15}
              sx={{
                flexShrink: 0,
                opacity: { xs: 1, sm: checked ? 1 : 0.55 },
                transition: "opacity 140ms ease",
              }}
            >
              <CardRowActions
                card={card}
                showArchived={showArchived}
                busy={busy}
                onEdit={onEdit}
                onMove={onMove}
                onArchive={onArchive}
                onRestore={onRestore}
              />
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
