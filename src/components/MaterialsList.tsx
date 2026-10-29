import { useState, type FormEvent } from "react";
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
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  deleteMaterial,
  downloadMaterialUrl,
  topicGenerate,
  type MaterialListItem,
} from "../api/client";
import {
  canGenerateMoreFromMaterial,
  isFigureMaterial,
  materialDisplayName,
} from "../materials/materialActions";
import { navigate } from "../nav/navigate";

export type MaterialsListProps = {
  materials: MaterialListItem[];
  showDeckTitle: boolean;
  onChanged: () => void;
};

function formatMaterialDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default function MaterialsList({
  materials,
  showDeckTitle,
  onChanged,
}: MaterialsListProps) {
  const [deleteTarget, setDeleteTarget] = useState<MaterialListItem | null>(
    null,
  );
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [generateTarget, setGenerateTarget] =
    useState<MaterialListItem | null>(null);
  const [topicValue, setTopicValue] = useState("");
  const [topicBusy, setTopicBusy] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);

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
        No materials yet.
      </Typography>
    );
  }

  return (
    <>
      <Stack
        component="ul"
        spacing={0}
        divider={<Divider flexItem />}
        sx={{ m: 0, p: 0, listStyle: "none" }}
      >
        {materials.map((material) => {
          const name = materialDisplayName(material.filename);
          const deckHref = `/library/decks/${encodeURIComponent(material.deck_id)}`;
          const canGenerate = canGenerateMoreFromMaterial(material);
          return (
            <Box
              component="li"
              key={material.id}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: 1,
                py: 1,
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
                  {material.kind}
                  {" · "}
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
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  component="a"
                  href={downloadMaterialUrl(material.id)}
                >
                  Download
                </Button>
                {canGenerate ? (
                  <Button
                    size="small"
                    onClick={() => openGenerate(material)}
                  >
                    Generate more
                  </Button>
                ) : null}
                <Button
                  size="small"
                  color="error"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(material);
                  }}
                >
                  Delete
                </Button>
              </Stack>
            </Box>
          );
        })}
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
          <Button
            onClick={() => setDeleteTarget(null)}
            disabled={deleteBusy}
          >
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
