import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Stack from "@mui/material/Stack";
import type { CardDraftView } from "../../api/client";
import { cardFrontPreview } from "../../draftReview";
import DiyCardPreview from "../diy/DiyCardPreview";
import { workshopCardTypeLabel } from "../workshop/workshopSearch";
import CardRowActions from "./CardRowActions";
import { SELECT_CHECKBOX_SX } from "./cardsWorkshopSx";

export default function CardsWorkshopIconGrid({
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
    <Box
      id="cards-workshop-results"
      component="ul"
      sx={{
        m: 0,
        p: 0,
        listStyle: "none",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))",
        gap: 1.5,
      }}
    >
      {visible.map((card) => {
        const checked = selectedIds.has(card.id);
        return (
          <Box
            component="li"
            key={card.id}
            sx={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              borderRadius: 2,
              border: "1px solid",
              borderColor: checked
                ? "rgba(209, 163, 226, 0.48)"
                : "rgba(232, 216, 199, 0.16)",
              bgcolor: checked
                ? "rgba(91, 44, 111, 0.28)"
                : "rgba(18, 7, 15, 0.32)",
              overflow: "hidden",
              transition:
                "background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
              boxShadow: checked
                ? "0 10px 28px rgba(0, 0, 0, 0.28)"
                : "0 6px 18px rgba(0, 0, 0, 0.18)",
              "&:hover": {
                borderColor: checked
                  ? "rgba(209, 163, 226, 0.62)"
                  : "rgba(232, 216, 199, 0.28)",
                bgcolor: checked
                  ? "rgba(91, 44, 111, 0.34)"
                  : "rgba(91, 44, 111, 0.16)",
                "& .sp-card-tile-actions": { opacity: 1 },
              },
            }}
          >
            <Checkbox
              size="small"
              disableRipple
              checked={checked}
              disabled={busy}
              onChange={() => onToggleSelect(card.id)}
              sx={{
                ...SELECT_CHECKBOX_SX,
                position: "absolute",
                top: 12,
                left: 12,
                zIndex: 2,
              }}
              slotProps={{
                input: {
                  "aria-label": `Select ${cardFrontPreview(card)}`,
                },
              }}
            />
            <Box
              sx={{
                width: "100%",
                p: 1.25,
                minHeight: 0,
                // Let wheel/trackpad scroll the workshop, not nested faces.
                overscrollBehavior: "auto",
                overflow: "hidden",
              }}
            >
              <Box
                component="button"
                type="button"
                aria-label={`Preview ${cardFrontPreview(card)}`}
                onClick={() => onPreview(card)}
                sx={{
                  display: "block",
                  width: "100%",
                  p: 0,
                  m: 0,
                  border: 0,
                  bgcolor: "transparent",
                  cursor: "pointer",
                  aspectRatio: "var(--sp-card-aspect)",
                  minHeight: 0,
                  overflow: "hidden",
                  borderRadius: 2,
                  // Isolate 3D flip paint so rotateY stays inside the slot.
                  isolation: "isolate",
                  contain: "paint",
                  transition: "box-shadow 140ms ease, outline-color 140ms ease",
                  outline: "2px solid transparent",
                  outlineOffset: 2,
                  "&:hover": {
                    outlineColor: "rgba(209, 163, 226, 0.45)",
                  },
                  "&:focus-visible": {
                    outlineColor: "rgba(209, 163, 226, 0.75)",
                  },
                }}
              >
                <DiyCardPreview card={card} variant="tile" />
              </Box>
            </Box>
            <Stack
              direction="row"
              spacing={0.5}
              sx={{
                alignItems: "center",
                justifyContent: "space-between",
                px: 1,
                py: 0.75,
                borderTop: "1px solid",
                borderColor: "rgba(232, 216, 199, 0.1)",
                bgcolor: "rgba(18, 7, 15, 0.22)",
              }}
            >
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  px: 0.85,
                  py: 0.15,
                  borderRadius: 999,
                  border: "1px solid",
                  borderColor: "rgba(209, 163, 226, 0.28)",
                  bgcolor: "rgba(91, 44, 111, 0.28)",
                  typography: "caption",
                  fontSize: "0.6875rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "rgba(232, 216, 199, 0.82)",
                }}
              >
                {workshopCardTypeLabel(card.type)}
              </Box>
              <Stack
                className="sp-card-tile-actions"
                direction="row"
                sx={{
                  opacity: 1,
                  "& .MuiIconButton-root": {
                    color: "rgba(232, 216, 199, 0.78)",
                    "&:hover": {
                      color: "primary.light",
                      bgcolor: "rgba(91, 44, 111, 0.32)",
                    },
                  },
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
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}
