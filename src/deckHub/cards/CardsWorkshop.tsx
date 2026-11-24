import { useState, useDeferredValue } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined";
import EmptyNext from "../hub/EmptyNext";
import type { CardDraftView } from "../../api/client";
import { cardFrontPreview } from "../../draftReview";
import CardPreviewDialog from "./CardPreviewDialog";
import DiyCardPreview from "../diy/DiyCardPreview";
import WorkshopSearchField from "../workshop/WorkshopSearchField";
import {
  cardMatchesWorkshopQuery,
  normalizeWorkshopQuery,
  workshopCardTypeLabel,
} from "../workshop/workshopSearch";
import {
  PILL_BTN,
  ROW_ACTION,
  WORKSHOP_SURFACE,
  createWorkshopViewPref,
  type WorkshopViewMode,
} from "../workshop/workshopChrome";

const { readViewMode, writeViewMode } = createWorkshopViewPref(
  "sugarplum.cardsWorkshop.view",
);

type ViewMode = WorkshopViewMode;

const TOOL_LINK = {
  minWidth: 0,
  px: 1,
  py: 0.35,
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  fontSize: "0.75rem",
  letterSpacing: "0.04em",
  color: "rgba(232, 216, 199, 0.62)",
  "&:hover": {
    color: "primary.light",
    bgcolor: "rgba(91, 44, 111, 0.22)",
  },
} as const;

const SELECT_CHECKBOX_SX = {
  p: 0.55,
  borderRadius: "9px",
  color: "rgba(232, 216, 199, 0.42)",
  bgcolor: "rgba(18, 7, 15, 0.42)",
  border: "1px solid rgba(232, 216, 199, 0.22)",
  transition:
    "background-color 140ms ease, border-color 140ms ease, color 140ms ease",
  "& .MuiSvgIcon-root": {
    fontSize: 17,
  },
  "&:hover": {
    bgcolor: "rgba(91, 44, 111, 0.32)",
    borderColor: "rgba(232, 216, 199, 0.4)",
    color: "rgba(232, 216, 199, 0.72)",
  },
  "&.Mui-checked, &.MuiCheckbox-indeterminate": {
    color: "rgba(245, 235, 220, 0.95)",
    bgcolor: "rgba(91, 44, 111, 0.52)",
    borderColor: "rgba(209, 163, 226, 0.55)",
  },
  "&.Mui-disabled": {
    opacity: 0.45,
  },
} as const;

type Props = {
  cards: CardDraftView[];
  showArchived: boolean;
  onShowArchivedChange: (checked: boolean) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (cards: CardDraftView[]) => void;
  onClearSelection: () => void;
  onPruneSelection: (visibleIds: Iterable<string>) => void;
  archiveBusyId: string | null;
  batchBusy: boolean;
  onBatchArchive: () => void;
  onBatchRestore: () => void;
  onBatchMove: () => void;
  onEdit: (card: CardDraftView) => void;
  onMove: (card: CardDraftView) => void;
  onArchive: (card: CardDraftView) => void;
  onRestore: (card: CardDraftView) => void;
  onCreateCard: () => void;
};

export default function CardsWorkshop({
  cards,
  showArchived,
  onShowArchivedChange,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onPruneSelection,
  archiveBusyId,
  batchBusy,
  onBatchArchive,
  onBatchRestore,
  onBatchMove,
  onEdit,
  onMove,
  onArchive,
  onRestore,
  onCreateCard,
}: Props) {
  const [view, setView] = useState<ViewMode>(() => readViewMode());
  const [query, setQuery] = useState("");
  const [previewCard, setPreviewCard] = useState<CardDraftView | null>(null);
  const deferredQuery = useDeferredValue(query);
  const busy = archiveBusyId !== null || batchBusy;
  const selectedCount = selectedIds.size;
  const visible = cards.filter((c) =>
    cardMatchesWorkshopQuery(c, deferredQuery),
  );
  const searching = normalizeWorkshopQuery(deferredQuery) !== "";

  function handleQueryChange(next: string) {
    setQuery(next);
    onPruneSelection(
      cards
        .filter((card) => cardMatchesWorkshopQuery(card, next))
        .map((card) => card.id),
    );
  }

  const allSelected =
    visible.length > 0 && visible.every((card) => selectedIds.has(card.id));
  const someSelected =
    visible.some((card) => selectedIds.has(card.id)) && !allSelected;
  const cardCountLabel =
    cards.length === 0
      ? showArchived
        ? "No archived cards"
        : "No cards yet"
      : searching
        ? `${visible.length} of ${cards.length} cards`
        : cards.length === 1
          ? "1 card"
          : `${cards.length} cards`;

  function onViewChange(_: unknown, next: ViewMode | null) {
    if (!next) return;
    setView(next);
    writeViewMode(next);
  }

  return (
    <Stack spacing={1.75} sx={{ minHeight: 0 }}>
      <Stack
        direction="row"
        useFlexGap
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.25,
        }}
      >
        <Stack
          direction="row"
          spacing={1.25}
          useFlexGap
          sx={{
            alignItems: "center",
          }}
        >
          <Button
            variant="contained"
            size="small"
            startIcon={<AddRoundedIcon sx={{ fontSize: 18 }} />}
            onClick={onCreateCard}
            sx={{
              ...PILL_BTN,
              px: 1.75,
              py: 0.85,
              fontSize: "0.8125rem",
            }}
          >
            Create card
          </Button>
          <Typography
            variant="caption"
            sx={{
              color: "rgba(232, 216, 199, 0.55)",
              letterSpacing: "0.04em",
            }}
          >
            {cardCountLabel}
          </Typography>
          {cards.length > 0 ? (
            <WorkshopSearchField
              value={query}
              onChange={handleQueryChange}
              placeholder="Search cards…"
              ariaLabel="Search cards"
              ariaControls="cards-workshop-results"
            />
          ) : null}
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{
            alignItems: "center",
          }}
        >
          {cards.length > 0 ? (
            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              aria-label="Card layout"
              onChange={onViewChange}
              sx={{
                bgcolor: "rgba(18, 7, 15, 0.35)",
                "& .MuiToggleButton-root": {
                  borderColor: "rgba(232, 216, 199, 0.16)",
                  color: "rgba(232, 216, 199, 0.55)",
                  px: 1,
                  "&.Mui-selected": {
                    color: "primary.light",
                    bgcolor: "rgba(91, 44, 111, 0.35)",
                  },
                },
              }}
            >
              <ToggleButton value="icons" aria-label="Icons" title="Icons">
                <GridViewOutlinedIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton
                value="details"
                aria-label="Details"
                title="Details"
              >
                <ViewListOutlinedIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
          ) : null}
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showArchived}
                onChange={(_ev, checked) => {
                  setQuery("");
                  onShowArchivedChange(checked);
                }}
                disabled={busy}
              />
            }
            label="Show archived"
            sx={{
              mr: 0,
              ml: 0,
              gap: 0.75,
              "& .MuiFormControlLabel-label": {
                typography: "caption",
                letterSpacing: "0.04em",
                color: "rgba(232, 216, 199, 0.62)",
              },
            }}
          />
        </Stack>
      </Stack>

      {cards.length === 0 ? (
        showArchived ? (
          <Box
            sx={{
              borderRadius: 2,
              border: "1px solid",
              borderColor: "rgba(232, 216, 199, 0.14)",
              bgcolor: "rgba(18, 7, 15, 0.28)",
              px: 2.25,
              py: 2.5,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              No archived cards in this deck.
            </Typography>
          </Box>
        ) : (
          <EmptyNext
            title="No accepted cards yet"
            body="Create a card yourself or add material to generate some."
            primary={{ label: "Create card", onClick: onCreateCard }}
          />
        )
      ) : (
        <>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{
              alignItems: "center",
              flexShrink: 0,
              flexWrap: "wrap",
              gap: 1,
              minHeight: 44,
              px: 1.25,
              py: 0.75,
              borderRadius: 2,
              border: "1px solid",

              borderColor:
                selectedCount > 0
                  ? "rgba(209, 163, 226, 0.28)"
                  : "rgba(232, 216, 199, 0.12)",

              bgcolor:
                selectedCount > 0
                  ? "rgba(91, 44, 111, 0.28)"
                  : "rgba(18, 7, 15, 0.35)",
            }}
          >
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  disableRipple
                  checked={allSelected}
                  indeterminate={someSelected}
                  disabled={busy || visible.length === 0}
                  onChange={() => onSelectAll(visible)}
                  sx={SELECT_CHECKBOX_SX}
                  slotProps={{
                    input: { "aria-label": "Select all cards" },
                  }}
                />
              }
              label={allSelected ? "Deselect all" : "Select all"}
              sx={{
                mr: 0,
                ml: 0,
                flexShrink: 0,
                gap: 0.75,
                "& .MuiFormControlLabel-label": {
                  typography: "caption",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  color: "rgba(232, 216, 199, 0.72)",
                  whiteSpace: "nowrap",
                },
              }}
            />
            {selectedCount > 0 ? (
              <>
                <Typography
                  variant="caption"
                  sx={{
                    color: "rgba(232, 216, 199, 0.55)",
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selectedCount} selected
                </Typography>
                {showArchived ? (
                  <Button
                    type="button"
                    size="small"
                    variant="contained"
                    startIcon={<UnarchiveOutlinedIcon sx={{ fontSize: 18 }} />}
                    disabled={busy}
                    onClick={onBatchRestore}
                    sx={{ ...PILL_BTN, px: 1.5 }}
                  >
                    Restore
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="small"
                      variant="contained"
                      startIcon={
                        <DriveFileMoveOutlinedIcon sx={{ fontSize: 18 }} />
                      }
                      disabled={busy}
                      onClick={onBatchMove}
                      sx={{ ...PILL_BTN, px: 1.5 }}
                    >
                      Move
                    </Button>
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      startIcon={<ArchiveOutlinedIcon sx={{ fontSize: 18 }} />}
                      disabled={busy}
                      onClick={onBatchArchive}
                      sx={{
                        ...PILL_BTN,
                        px: 1.5,
                        borderColor: "rgba(232, 216, 199, 0.35)",
                        color: "rgba(232, 216, 199, 0.88)",
                        "&:hover": {
                          borderColor: "rgba(232, 216, 199, 0.55)",
                          bgcolor: "rgba(91, 44, 111, 0.28)",
                        },
                      }}
                    >
                      Archive
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  size="small"
                  onClick={onClearSelection}
                  disabled={busy}
                  sx={TOOL_LINK}
                >
                  Clear
                </Button>
              </>
            ) : null}
          </Stack>

          {searching && visible.length === 0 ? (
            <Box
              id="cards-workshop-results"
              sx={{
                ...WORKSHOP_SURFACE,
                px: 2.25,
                py: 2.5,
              }}
            >
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {`No cards match "${deferredQuery.trim()}"`}
              </Typography>
            </Box>
          ) : view === "icons" ? (
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
                        onClick={() => setPreviewCard(card)}
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
          ) : (
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
                      onClick={() => setPreviewCard(card)}
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
          )}
        </>
      )}
      <CardPreviewDialog
        card={previewCard}
        busy={busy}
        onClose={() => setPreviewCard(null)}
        onEdit={onEdit}
      />
    </Stack>
  );
}

function CardRowActions({
  card,
  showArchived,
  busy,
  onEdit,
  onMove,
  onArchive,
  onRestore,
}: {
  card: CardDraftView;
  showArchived: boolean;
  busy: boolean;
  onEdit: (card: CardDraftView) => void;
  onMove: (card: CardDraftView) => void;
  onArchive: (card: CardDraftView) => void;
  onRestore: (card: CardDraftView) => void;
}) {
  return (
    <>
      <Tooltip title="Move card">
        <span>
          <IconButton
            size="small"
            aria-label="Move card"
            disabled={busy}
            onClick={() => {
              void onMove(card);
            }}
            sx={ROW_ACTION}
          >
            <DriveFileMoveOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {!showArchived && card.status !== "archived" ? (
        <Tooltip title="Edit card">
          <span>
            <IconButton
              size="small"
              aria-label="Edit card"
              disabled={busy}
              onClick={() => onEdit(card)}
              sx={ROW_ACTION}
            >
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : null}
      {showArchived ? (
        <Tooltip title="Restore card">
          <span>
            <IconButton
              size="small"
              aria-label="Restore card"
              disabled={busy}
              onClick={() => {
                void onRestore(card);
              }}
              sx={ROW_ACTION}
            >
              <UnarchiveOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : (
        <Tooltip title="Archive card">
          <span>
            <IconButton
              size="small"
              aria-label="Archive card"
              disabled={busy}
              onClick={() => {
                void onArchive(card);
              }}
              sx={ROW_ACTION}
            >
              <ArchiveOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </>
  );
}
