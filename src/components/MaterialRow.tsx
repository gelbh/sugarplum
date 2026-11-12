import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import CropOutlinedIcon from "@mui/icons-material/CropOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import {
  downloadMaterialUrl,
  type MaterialListItem,
} from "../api/client";
import {
  canCreateOcclusionFromMaterial,
  canGenerateMoreFromMaterial,
  isFigureMaterial,
  materialDisplayName,
} from "../materials/materialActions";
import {
  SOURCE_ROLES,
  SOURCE_ROLE_LABELS,
  type SourceRole,
} from "../lib/sourceRole";
import { SOURCE_ROLE_ICONS } from "../lib/sourceRoleIcons";
import { navigate } from "../nav/navigate";
import {
  SelectEnumItem,
  renderSelectEnumValue,
} from "./SelectEnumItem";

export type MaterialRowProps = {
  material: MaterialListItem;
  showDeckTitle: boolean;
  roleBusy: boolean;
  onSourceRoleChange: (
    material: MaterialListItem,
    next: SourceRole,
  ) => void;
  onRequestGenerate: (material: MaterialListItem) => void;
  onRequestDelete: (material: MaterialListItem) => void;
  onCreateOcclusion?: (material: MaterialListItem) => void;
};

function formatMaterialDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default function MaterialRow({
  material,
  showDeckTitle,
  roleBusy,
  onSourceRoleChange,
  onRequestGenerate,
  onRequestDelete,
  onCreateOcclusion,
}: MaterialRowProps) {
  const name = materialDisplayName(material.filename);
  const deckHref = `/library/decks/${encodeURIComponent(material.deck_id)}`;
  const canGenerate = canGenerateMoreFromMaterial(material);
  const canOcclusion =
    Boolean(onCreateOcclusion) && canCreateOcclusionFromMaterial(material);
  const roleValue = material.source_role ?? "lecture";

  return (
    <Box
      component="li"
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 1,
        py: 1.25,
        flexWrap: "wrap",
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {name}
          </Typography>
          {isFigureMaterial(material.r2_key) ? (
            <Chip size="small" label="Figure" variant="outlined" />
          ) : null}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {material.status}
          {" · "}
          {formatMaterialDate(material.created_at)}
        </Typography>
        {showDeckTitle ? (
          <Typography
            variant="caption"
            color="text.secondary"
            component="div"
          >
            <Link
              href={deckHref}
              underline="hover"
              color="primary"
              onClick={(ev) => {
                ev.preventDefault();
                navigate(deckHref);
              }}
            >
              {material.deck_title?.trim() || "Untitled deck"}
            </Link>
          </Typography>
        ) : null}
      </Box>
      <FormControl size="small" sx={{ minWidth: 132 }}>
        <InputLabel id={`source-role-${material.id}`}>Role</InputLabel>
        <Select
          labelId={`source-role-${material.id}`}
          label="Role"
          value={roleValue}
          disabled={roleBusy}
          onChange={(ev) => {
            onSourceRoleChange(material, ev.target.value as SourceRole);
          }}
          renderValue={(value) =>
            renderSelectEnumValue({
              icon: SOURCE_ROLE_ICONS[value as SourceRole],
              label: SOURCE_ROLE_LABELS[value as SourceRole],
            })
          }
        >
          {SOURCE_ROLES.map((role) => (
            <MenuItem key={role} value={role}>
              <SelectEnumItem
                icon={SOURCE_ROLE_ICONS[role]}
                label={SOURCE_ROLE_LABELS[role]}
              />
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Stack direction="row" spacing={0.25}>
        <Tooltip title={`Download ${name}`}>
          <IconButton
            size="small"
            component="a"
            href={downloadMaterialUrl(material.id)}
            aria-label={`Download ${name}`}
          >
            <DownloadOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {canOcclusion ? (
          <Tooltip title={`Create occlusion from ${name}`}>
            <IconButton
              size="small"
              aria-label={`Create occlusion from ${name}`}
              onClick={() => onCreateOcclusion?.(material)}
            >
              <CropOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
        {canGenerate ? (
          <Tooltip title={`Generate more from ${name}`}>
            <IconButton
              size="small"
              aria-label={`Generate more from ${name}`}
              onClick={() => onRequestGenerate(material)}
            >
              <AddCircleOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}
        <Tooltip title={`Delete ${name}`}>
          <IconButton
            size="small"
            color="error"
            aria-label={`Delete ${name}`}
            onClick={() => onRequestDelete(material)}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}
