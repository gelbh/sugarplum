import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import type { StoredCoverRow } from "../api/client";

type Props = {
  title: string;
  cover: StoredCoverRow | null;
  guest: boolean;
  metaLine: string;
  exportBusy: boolean;
  exportDisabled: boolean;
  overflowAnchor: HTMLElement | null;
  onOverflowOpen: (anchor: HTMLElement) => void;
  onOverflowClose: () => void;
  onExportAnki: () => void;
  onRename: () => void;
  onDelete: () => void;
  onChangeCover: () => void;
};

export default function DeckHubTitleHeader({
  title,
  cover,
  guest,
  metaLine,
  exportBusy,
  exportDisabled,
  overflowAnchor,
  onOverflowOpen,
  onOverflowClose,
  onExportAnki,
  onRename,
  onDelete,
  onChangeCover,
}: Props) {
  return (
    <Box>
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        gap={1.5}
      >
        <Stack
          direction="row"
          spacing={2}
          alignItems="flex-start"
          sx={{ flex: 1, minWidth: 0 }}
        >
          {cover ? (
            <Box
              component="img"
              src={cover.imageUrl}
              alt=""
              sx={{
                width: 88,
                height: 88,
                borderRadius: 2,
                border: 1,
                borderColor: "divider",
                objectFit: "cover",
                flexShrink: 0,
                bgcolor: "background.paper",
              }}
            />
          ) : (
            <Box
              aria-hidden
              sx={{
                width: 88,
                height: 88,
                borderRadius: 2,
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                color: "text.secondary",
                typography: "caption",
                fontWeight: 600,
                textAlign: "center",
                px: 1,
              }}
            >
              No cover
            </Box>
          )}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography
              variant="h4"
              component="h1"
              sx={{ color: "text.primary", fontWeight: 600 }}
            >
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {metaLine}
            </Typography>
            {!guest ? (
              <Button
                size="small"
                onClick={onChangeCover}
                sx={{ mt: 1, px: 0, minWidth: 0 }}
              >
                {cover ? "Change cover" : "Add cover"}
              </Button>
            ) : null}
          </Box>
        </Stack>
        <Tooltip title="Deck actions">
          <IconButton
            size="small"
            aria-label="Deck actions"
            onClick={(ev) => onOverflowOpen(ev.currentTarget)}
            sx={{ color: "text.secondary" }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Menu
          anchorEl={overflowAnchor}
          open={overflowAnchor !== null}
          onClose={onOverflowClose}
        >
          {!guest ? (
            <MenuItem
              disabled={exportBusy || exportDisabled}
              onClick={() => {
                onOverflowClose();
                onExportAnki();
              }}
            >
              {exportBusy ? "Exporting…" : "Export Anki"}
            </MenuItem>
          ) : null}
          <MenuItem
            onClick={() => {
              onOverflowClose();
              onRename();
            }}
          >
            Rename
          </MenuItem>
          <MenuItem
            onClick={() => {
              onOverflowClose();
              onDelete();
            }}
          >
            Delete
          </MenuItem>
        </Menu>
      </Stack>
    </Box>
  );
}
