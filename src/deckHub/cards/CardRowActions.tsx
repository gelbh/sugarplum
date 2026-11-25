import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import type { CardDraftView } from "../../api/client";
import { ROW_ACTION } from "../workshop/workshopChrome";

export default function CardRowActions({
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
