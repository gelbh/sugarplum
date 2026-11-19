import { useMemo, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  deleteMaterial,
  patchMaterialSourceRole,
  refillPdfOcr,
  topicGenerate,
  type MaterialListItem,
} from "../api/client";
import { materialDisplayName } from "../materials/materialActions";
import { partitionSplitSiblings } from "../materials/splitSiblingGroups";
import type { SourceRole } from "../lib/sourceRole";
import EmptyNext from "./EmptyNext";
import MaterialRow from "./MaterialRow";
import { shouldAutoFocusText } from "../shared/lib/autoFocusText";

export type MaterialsListProps = {
  materials: MaterialListItem[];
  showDeckTitle: boolean;
  onChanged: () => void;
  onCreateOcclusion?: (material: MaterialListItem) => void;
  onAddMaterial?: () => void;
};

const KIND_ORDER = ["pdf", "pptx", "paste", "image", "topic"];

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
  onAddMaterial,
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

  function renderMaterialRow(
    material: MaterialListItem,
    rowShowDeckTitle = showDeckTitle,
  ) {
    return (
      <MaterialRow
        key={material.id}
        material={material}
        showDeckTitle={rowShowDeckTitle}
        roleBusy={roleBusyId === material.id}
        onSourceRoleChange={(m, next) => {
          void onSourceRoleChange(m, next);
        }}
        onRequestGenerate={openGenerate}
        onRequestDelete={(m) => {
          setDeleteError(null);
          setDeleteTarget(m);
        }}
        onCreateOcclusion={onCreateOcclusion}
      />
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
    if (onAddMaterial) {
      return (
        <EmptyNext
          title="No materials yet"
          body="Add notes or a file to generate cards."
          primary={{ label: "Add material", onClick: onAddMaterial }}
        />
      );
    }
    return (
      <Typography variant="body2" sx={{
        color: "text.secondary"
      }}>No materials yet. Add one above to generate cards.
              </Typography>
    );
  }

  return (
    <>
      {roleError ? (
        <Alert
          severity="error"
          sx={{ mb: 1 }}
          onClose={() => setRoleError(null)}
        >
          {roleError}
        </Alert>
      ) : null}
      <Stack spacing={2}>
        {groups.map(({ kind, sections }) => (
          <Box key={kind}>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                display: "block",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                mb: 0.5
              }}>
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
                const first = entry.members[0];
                const deckId = first?.deck_id ?? "deck";
                const anchorId = first?.id ?? entry.stem;
                const stemLabelId = `split-stem-${kind}-${deckId}-${anchorId}`;
                const deckTitle = first?.deck_title?.trim() || "Untitled deck";
                const stemCaption = showDeckTitle
                  ? `${deckTitle} · ${entry.stem}`
                  : entry.stem;
                return (
                  <Box
                    component="li"
                    key={`${kind}-${deckId}-${entry.stem}-${anchorId}`}
                    sx={{ listStyle: "none", py: 0.5 }}
                  >
                    <Typography
                      id={stemLabelId}
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        display: "block",
                        fontWeight: 600,
                        mb: 0.25
                      }}>
                      {stemCaption}
                    </Typography>
                    <Stack
                      component="ul"
                      spacing={0}
                      divider={<Divider flexItem />}
                      aria-labelledby={stemLabelId}
                      sx={{ m: 0, p: 0, listStyle: "none" }}
                    >
                      {entry.members.map((material) =>
                        renderMaterialRow(material, false),
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
              autoFocus={shouldAutoFocusText()}
              label="Topic"
              value={topicValue}
              onChange={(ev) => setTopicValue(ev.target.value)}
              required
              fullWidth
              disabled={topicBusy}
              slotProps={{
                htmlInput: { maxLength: 200 }
              }}
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
