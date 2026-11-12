import { useMemo, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import CropOutlinedIcon from "@mui/icons-material/CropOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import {
  ApiError,
  deleteMaterial,
  downloadMaterialUrl,
  patchMaterialSourceRole,
  refillPdfOcr,
  topicGenerate,
  type MaterialListItem,
} from "../api/client";
import {
  canCreateOcclusionFromMaterial,
  canGenerateMoreFromMaterial,
  isFigureMaterial,
  materialDisplayName,
} from "../materials/materialActions";
import { partitionSplitSiblings } from "../materials/splitSiblingGroups";
import {
  SOURCE_ROLES,
  SOURCE_ROLE_LABELS,
  type SourceRole,
} from "../lib/sourceRole";
import { navigate } from "../nav/navigate";

export type MaterialsListProps = {
  materials: MaterialListItem[];
  showDeckTitle: boolean;
  onChanged: () => void;
  onCreateOcclusion?: (material: MaterialListItem) => void;
};

const KIND_ORDER = ["pdf", "pptx", "paste", "image", "topic"];

function formatMaterialDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function kindLabel(kind: string): string {
  if (kind === "pdf") return "PDF";
  if (kind === "pptx") return "PPTX";
  if (kind === "paste") return "Paste";
  if (kind === "image") return "Image";
  if (kind === "topic") return "Topic";
  return kind;
}

function groupMaterials(
  materials: MaterialListItem[],
): { kind: string; rows: MaterialListItem[] }[] {
  const byKind = new Map<string, MaterialListItem[]>();
  for (const material of materials) {
    const key = material.kind || "other";
    const list = byKind.get(key);
    if (list) list.push(material);
    else byKind.set(key, [material]);
  }
  const keys = [...byKind.keys()].sort((a, b) => {
    const ai = KIND_ORDER.indexOf(a);
    const bi = KIND_ORDER.indexOf(b);
    const ao = ai === -1 ? KIND_ORDER.length : ai;
    const bo = bi === -1 ? KIND_ORDER.length : bi;
    if (ao !== bo) return ao - bo;
    return a.localeCompare(b);
  });
  return keys.map((kind) => ({ kind, rows: byKind.get(kind) ?? [] }));
}

export default function MaterialsList({
  materials,
  showDeckTitle,
  onChanged,
  onCreateOcclusion,
}: MaterialsListProps) {
  const [deleteTarget, setDeleteTarget] = useState<MaterialListItem | null>(
    null,
  );
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [generateTarget, setGenerateTarget] = useState<MaterialListItem | null>(
    null,
  );
  const [topicValue, setTopicValue] = useState("");
  const [topicBusy, setTopicBusy] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [roleBusyId, setRoleBusyId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  const groups = useMemo(
    () =>
      groupMaterials(materials).map(({ kind, rows }) => ({
        kind,
        sections: partitionSplitSiblings(rows),
      })),
    [materials],
  );

  function renderMaterialRow(material: MaterialListItem) {
    const name = materialDisplayName(material.filename);
    const deckHref = `/library/decks/${encodeURIComponent(material.deck_id)}`;
    const canGenerate = canGenerateMoreFromMaterial(material);
    const canOcclusion =
      Boolean(onCreateOcclusion) &&
      canCreateOcclusionFromMaterial(material);
    const roleValue = material.source_role ?? "lecture";
    const roleBusy = roleBusyId === material.id;
    return (
      <Box
        component="li"
        key={material.id}
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
              void onSourceRoleChange(
                material,
                ev.target.value as SourceRole,
              );
            }}
          >
            {SOURCE_ROLES.map((role) => (
              <MenuItem key={role} value={role}>
                {SOURCE_ROLE_LABELS[role]}
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
                onClick={() => openGenerate(material)}
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
              onClick={() => {
                setDeleteError(null);
                setDeleteTarget(material);
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    );
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteMaterial(deleteTarget.id);
      setDeleteTarget(null);
      onChanged();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Could not delete material",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  function openGenerate(material: MaterialListItem) {
    setTopicError(null);
    setTopicValue("");
    setGenerateTarget(material);
  }

  async function onSourceRoleChange(
    material: MaterialListItem,
    next: SourceRole,
  ) {
    if (next === (material.source_role ?? "lecture")) return;
    setRoleBusyId(material.id);
    setRoleError(null);
    try {
      await patchMaterialSourceRole(material.id, next);
      onChanged();
    } catch (err) {
      setRoleError(
        err instanceof ApiError ? err.message : "Could not update source role",
      );
    } finally {
      setRoleBusyId(null);
    }
  }

  async function onGenerateSubmit(e?: FormEvent) {
    e?.preventDefault();
    if (!generateTarget) return;
    const topic = topicValue.trim();
    if (!topic) {
      setTopicError("Enter a topic");
      return;
    }
    setTopicBusy(true);
    setTopicError(null);
    try {
      if (generateTarget.kind === "pdf") {
        try {
          await refillPdfOcr(generateTarget.id);
        } catch (err) {
          console.warn("PDF OCR refill skipped", err);
        }
      }
      const { jobId } = await topicGenerate(generateTarget.deck_id, {
        topic,
        materialId: generateTarget.id,
      });
      setGenerateTarget(null);
      setTopicValue("");
      window.location.assign(`/jobs/${encodeURIComponent(jobId)}/drafts`);
    } catch (err) {
      setTopicError(
        err instanceof ApiError ? err.message : "Could not start generation",
      );
    } finally {
      setTopicBusy(false);
    }
  }

  if (materials.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No materials yet. Add one above to generate cards.
      </Typography>
    );
  }

  return (
    <>
      {roleError ? (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setRoleError(null)}>
          {roleError}
        </Alert>
      ) : null}
      <Stack spacing={2}>
        {groups.map(({ kind, sections }) => (
          <Box key={kind}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: "block",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                mb: 0.5,
              }}
            >
              {kindLabel(kind)}
            </Typography>
            <Stack
              component="ul"
              spacing={0}
              divider={<Divider flexItem />}
              sx={{ m: 0, p: 0, listStyle: "none" }}
            >
              {sections.map((entry) => {
                if (entry.type === "flat") {
                  return renderMaterialRow(entry.material);
                }
                const deckId = entry.members[0]?.deck_id ?? "deck";
                const anchorId = entry.members[0]?.id ?? entry.stem;
                const stemLabelId = `split-stem-${kind}-${deckId}-${anchorId}`;
                return (
                  <Box
                    component="li"
                    key={`${kind}-${deckId}-${entry.stem}-${anchorId}`}
                    sx={{ listStyle: "none", py: 0.5 }}
                  >
                    <Typography
                      id={stemLabelId}
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        display: "block",
                        fontWeight: 600,
                        mb: 0.25,
                      }}
                    >
                      {entry.stem}
                    </Typography>
                    <Stack
                      component="ul"
                      spacing={0}
                      divider={<Divider flexItem />}
                      aria-labelledby={stemLabelId}
                      sx={{ m: 0, p: 0, listStyle: "none" }}
                    >
                      {entry.members.map((material) =>
                        renderMaterialRow(material),
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
      >
        <DialogTitle>Delete material?</DialogTitle>
        <DialogContent>
          {deleteError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          ) : null}
          <DialogContentText>
            {deleteTarget
              ? `Delete “${materialDisplayName(deleteTarget.filename)}”? Generation jobs for this material are removed. Accepted cards stay. Open drafts for those jobs are removed.`
              : ""}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteBusy}
            onClick={() => {
              void confirmDelete();
            }}
          >
            {deleteBusy ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={generateTarget !== null}
        onClose={() => !topicBusy && setGenerateTarget(null)}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={onGenerateSubmit} noValidate>
          <DialogTitle>Generate more</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              {generateTarget
                ? `Create more cards from “${materialDisplayName(generateTarget.filename)}”. Existing cards stay.`
                : ""}
            </DialogContentText>
            {topicError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {topicError}
              </Alert>
            ) : null}
            <TextField
              autoFocus
              label="Topic"
              value={topicValue}
              onChange={(ev) => setTopicValue(ev.target.value)}
              required
              fullWidth
              disabled={topicBusy}
              inputProps={{ maxLength: 200 }}
            />
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setGenerateTarget(null)}
              disabled={topicBusy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={topicBusy || !topicValue.trim()}
            >
              {topicBusy ? "Starting…" : "Generate"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
}
