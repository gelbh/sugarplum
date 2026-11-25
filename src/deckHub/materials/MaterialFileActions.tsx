import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import type { MaterialListItem } from "../../api/client";
import { downloadMaterialUrl } from "../../api/client";
import { ROW_ACTION } from "../workshop/workshopChrome";

function canOpenFile(material: MaterialListItem): boolean {
  return Boolean(material.r2_key);
}

export default function FileActions({
  material,
  title,
  busy,
  guest,
  rowBusy,
  onView,
  onDelete,
}: {
  material: MaterialListItem;
  title: string;
  busy: boolean;
  guest: boolean;
  rowBusy: boolean;
  onView: () => void;
  onDelete: (material: MaterialListItem) => void;
}) {
  const openable = canOpenFile(material);
  return (
    <>
      {openable ? (
        <Tooltip title="View file">
          <span>
            <IconButton
              size="small"
              aria-label={`View ${title}`}
              disabled={busy || guest}
              onClick={onView}
              sx={ROW_ACTION}
            >
              <VisibilityOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : null}
      {material.r2_key ? (
        <Tooltip title="Download file">
          <span>
            <IconButton
              size="small"
              aria-label={`Download ${title}`}
              disabled={busy || guest}
              href={downloadMaterialUrl(material.id)}
              sx={ROW_ACTION}
            >
              <FileDownloadOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : null}
      <Tooltip title="Delete file">
        <span>
          <IconButton
            size="small"
            aria-label={`Delete ${title}`}
            disabled={busy || guest || rowBusy}
            onClick={() => onDelete(material)}
            sx={ROW_ACTION}
          >
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </>
  );
}
