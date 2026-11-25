import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import type { CardDraftView } from "../../api/client";
import { PILL_BTN } from "../workshop/workshopChrome";
import { SELECT_CHECKBOX_SX, TOOL_LINK } from "./cardsWorkshopSx";

export default function CardsWorkshopBulkBar({
  visible,
  selectedCount,
  allSelected,
  someSelected,
  showArchived,
  busy,
  onSelectAll,
  onClearSelection,
  onBatchArchive,
  onBatchRestore,
  onBatchMove,
}: {
  visible: CardDraftView[];
  selectedCount: number;
  allSelected: boolean;
  someSelected: boolean;
  showArchived: boolean;
  busy: boolean;
  onSelectAll: (cards: CardDraftView[]) => void;
  onClearSelection: () => void;
  onBatchArchive: () => void;
  onBatchRestore: () => void;
  onBatchMove: () => void;
}) {
  return (
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
  );
}
