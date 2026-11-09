import type { FormEvent, RefObject } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import DraftCardEditor, {
  type DraftEditorChange,
} from "../components/DraftCardEditor";
import type { CardDraftView, CardType } from "../api/client";

function cardFrontPreview(card: CardDraftView): string {
  if (typeof card.front === "string") return card.front;
  if (
    typeof card.front === "object" &&
    card.front !== null &&
    "prompt" in card.front &&
    typeof card.front.prompt === "string" &&
    card.front.prompt.trim()
  ) {
    return card.front.prompt;
  }
  return card.type === "occlusion" ? "Occlusion card" : "Card";
}

function cardTypeLabel(type: CardDraftView["type"]): string {
  if (type === "cloze") return "Cloze";
  if (type === "mcq") return "MCQ";
  if (type === "occlusion") return "Occlusion";
  if (type === "image_label") return "Image label";
  if (type === "diagram") return "Diagram";
  return "Q&A";
}

type ListProps = {
  mode: "list";
  cards: CardDraftView[];
  showArchived: boolean;
  onShowArchivedChange: (checked: boolean) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  archiveBusyId: string | null;
  batchBusy: boolean;
  onBatchArchive: () => void;
  onBatchMove: () => void;
  onEdit: (card: CardDraftView) => void;
  onMove: (card: CardDraftView) => void;
  onArchive: (card: CardDraftView) => void;
  onRestore: (card: CardDraftView) => void;
  onCreateCard: () => void;
};

type CreateProps = {
  mode: "create";
  createCard: CardDraftView;
  createBusy: boolean;
  createImageBusy: boolean;
  createError: string | null;
  createNeedsImage: boolean;
  createImageKey: string;
  deckImageKeys: string[];
  createImageInputRef: RefObject<HTMLInputElement | null>;
  hubDiyAllowedTypes: CardType[];
  onCreateChange: (next: DraftEditorChange) => void;
  onCreateSubmit: (e?: FormEvent) => void;
  onCreateImageUpload: (file: File) => void;
  applyCreateImageKey: (key: string) => void;
};

type Props = ListProps | CreateProps;

export default function CardsWorkshop(props: Props) {
  if (props.mode === "create") {
    const {
      createCard,
      createBusy,
      createImageBusy,
      createError,
      createNeedsImage,
      createImageKey,
      deckImageKeys,
      createImageInputRef,
      hubDiyAllowedTypes,
      onCreateChange,
      onCreateSubmit,
      onCreateImageUpload,
      applyCreateImageKey,
    } = props;

    return (
      <Box component="form" onSubmit={onCreateSubmit} noValidate>
        <Stack spacing={2}>
          {createError ? <Alert severity="error">{createError}</Alert> : null}
          {createNeedsImage ? (
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Image (deck material)
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                {deckImageKeys.length > 0 ? (
                  <FormControl fullWidth size="small">
                    <InputLabel id="hub-create-image-key">
                      Existing image
                    </InputLabel>
                    <Select
                      labelId="hub-create-image-key"
                      label="Existing image"
                      value={createImageKey || ""}
                      disabled={createBusy || createImageBusy}
                      onChange={(ev) =>
                        applyCreateImageKey(String(ev.target.value))
                      }
                    >
                      <MenuItem value="">
                        <em>Select…</em>
                      </MenuItem>
                      {deckImageKeys.map((key) => (
                        <MenuItem key={key} value={key}>
                          {key.split("/").pop() ?? key}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : null}
                <Button
                  variant="outlined"
                  component="label"
                  disabled={createBusy || createImageBusy}
                  sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                >
                  {createImageBusy ? "Uploading…" : "Upload image"}
                  <input
                    ref={createImageInputRef}
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(ev) => {
                      const file = ev.target.files?.[0];
                      if (file) void onCreateImageUpload(file);
                    }}
                  />
                </Button>
              </Stack>
            </Stack>
          ) : null}
          <DraftCardEditor
            card={createCard}
            disabled={createBusy || createImageBusy}
            onChange={onCreateChange}
            allowedTypes={hubDiyAllowedTypes}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={createBusy || createImageBusy}
          >
            {createBusy ? "Adding…" : "Add card"}
          </Button>
        </Stack>
      </Box>
    );
  }

  const {
    cards,
    showArchived,
    onShowArchivedChange,
    selectedIds,
    onToggleSelect,
    onSelectAll,
    onClearSelection,
    archiveBusyId,
    batchBusy,
    onBatchArchive,
    onBatchMove,
    onEdit,
    onMove,
    onArchive,
    onRestore,
    onCreateCard,
  } = props;

  const busy = archiveBusyId !== null || batchBusy;
  const selectedCount = selectedIds.size;

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        useFlexGap
        flexWrap="wrap"
        gap={1}
      >
        <Button variant="contained" size="small" onClick={onCreateCard}>
          Create card
        </Button>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showArchived}
              onChange={(_ev, checked) => onShowArchivedChange(checked)}
              disabled={busy}
            />
          }
          label="Show archived"
          sx={{ mr: 0 }}
        />
      </Stack>

      {cards.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {showArchived
            ? "No archived cards."
            : "No accepted cards yet. Create one or add material."}
        </Typography>
      ) : (
        <>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            useFlexGap
            flexWrap="wrap"
          >
            <Button size="small" onClick={onSelectAll} disabled={busy}>
              Select all
            </Button>
            {selectedCount > 0 ? (
              <Button size="small" onClick={onClearSelection} disabled={busy}>
                Clear ({selectedCount})
              </Button>
            ) : null}
            {selectedCount > 0 && !showArchived ? (
              <>
                <Button
                  size="small"
                  startIcon={<DriveFileMoveOutlinedIcon />}
                  disabled={busy}
                  onClick={onBatchMove}
                >
                  Move
                </Button>
                <Button
                  size="small"
                  color="warning"
                  startIcon={<ArchiveOutlinedIcon />}
                  disabled={busy}
                  onClick={onBatchArchive}
                >
                  Archive
                </Button>
              </>
            ) : null}
          </Stack>
          <Stack
            component="ul"
            spacing={0}
            divider={<Divider flexItem />}
            sx={{ m: 0, p: 0, listStyle: "none" }}
          >
            {cards.map((card) => {
              const checked = selectedIds.has(card.id);
              return (
                <Box
                  component="li"
                  key={card.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    py: 1,
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={checked}
                    disabled={busy}
                    onChange={() => onToggleSelect(card.id)}
                    inputProps={{
                      "aria-label": `Select ${cardFrontPreview(card)}`,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" noWrap>
                      {cardFrontPreview(card)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {cardTypeLabel(card.type)}
                    </Typography>
                  </Box>
                  <Tooltip title="Move card">
                    <span>
                      <IconButton
                        size="small"
                        aria-label="Move card"
                        disabled={busy}
                        onClick={() => {
                          void onMove(card);
                        }}
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
                        >
                          <ArchiveOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                </Box>
              );
            })}
          </Stack>
        </>
      )}
    </Stack>
  );
}
