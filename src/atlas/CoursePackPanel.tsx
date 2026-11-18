import { useCallback, useEffect, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ApiError } from "../api/client";
import { ocrEmptyPdfPages } from "../lib/pdfScanOcr";
import {
  SOURCE_ROLE_LABELS,
  SOURCE_ROLES,
  suggestSourceRole,
  type SourceRole,
} from "../lib/sourceRole";
import {
  completeAtlasMaterial,
  deleteAtlasMaterial,
  listAtlasMaterials,
  pasteAtlasMaterial,
  patchAtlasMaterialSourceRole,
  requestAtlasMaterialUploadUrl,
  type AtlasPackMaterial,
} from "./apiMaterials";

type Props = {
  atlasId: string;
  onFocusChanged?: () => void;
};

export default function CoursePackPanel({ atlasId, onFocusChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [materials, setMaterials] = useState<AtlasPackMaterial[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteRole, setPasteRole] = useState<SourceRole>("tutorial");
  const [pasteFilename, setPasteFilename] = useState("");

  const reload = useCallback(async () => {
    const rows = await listAtlasMaterials(atlasId);
    setMaterials(rows);
  }, [atlasId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listAtlasMaterials(atlasId);
        if (!cancelled) setMaterials(rows);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load course pack",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [atlasId, open]);

  async function afterMutate() {
    await reload();
    onFocusChanged?.();
  }

  async function onPaste(ev: FormEvent) {
    ev.preventDefault();
    if (!pasteText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await pasteAtlasMaterial(atlasId, {
        text: pasteText,
        filename: pasteFilename.trim() || null,
        source_role: pasteRole,
      });
      setPasteText("");
      setPasteFilename("");
      await afterMutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Paste failed");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const role = suggestSourceRole(file.name);
      const { materialId, uploadUrl } = await requestAtlasMaterialUploadUrl(
        atlasId,
        {
          filename: file.name,
          contentType: file.type || "application/pdf",
          size: file.size,
          source_role: role,
        },
      );
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/pdf" },
        body: file,
      });
      if (!put.ok) throw new Error("Upload to storage failed");
      let ocrPages: Array<{ page: number; text: string }> | undefined;
      try {
        ocrPages = await ocrEmptyPdfPages(await file.arrayBuffer());
      } catch (err) {
        console.warn("Atlas pack PDF OCR skipped", err);
      }
      await completeAtlasMaterial(
        materialId,
        ocrPages ? { ocrPages } : undefined,
      );
      await afterMutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper variant="outlined" sx={{ mb: 2, overflow: "hidden" }}>
      <Stack
        direction="row"
        alignItems="center"
        sx={{ px: 1.5, py: 1, cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600 }}>Course pack</Typography>
          <Typography variant="body2" color="text.secondary">
            Rank Focus from tutorials, practicals, and past papers. These files
            do not create flashcards.
          </Typography>
        </Box>
        <IconButton
          aria-label={open ? "Collapse course pack" : "Expand course pack"}
          size="small"
        >
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Stack>
      <Collapse in={open}>
        <Stack spacing={2} sx={{ px: 1.5, pb: 1.5 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {materials.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Empty pack: Key needs a tutorial, practical, or past paper that
              names the parasite, or mark one important manually.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {materials.map((m) => (
                <Stack
                  key={m.id}
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  alignItems={{ sm: "center" }}
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    px: 1.25,
                    py: 1,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }} noWrap>
                      {m.filename || m.kind}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {m.kind} · {m.status}
                    </Typography>
                  </Box>
                  <TextField
                    select
                    size="small"
                    label="Role"
                    value={m.source_role}
                    disabled={busy}
                    onChange={(ev) => {
                      const next = ev.target.value as SourceRole;
                      void (async () => {
                        setBusy(true);
                        setError(null);
                        try {
                          await patchAtlasMaterialSourceRole(m.id, next);
                          await afterMutate();
                        } catch (err) {
                          setError(
                            err instanceof ApiError
                              ? err.message
                              : "Could not update role",
                          );
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                    sx={{ minWidth: 140 }}
                  >
                    {SOURCE_ROLES.map((role) => (
                      <MenuItem key={role} value={role}>
                        {SOURCE_ROLE_LABELS[role]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button
                    size="small"
                    color="inherit"
                    disabled={busy}
                    onClick={() => {
                      void (async () => {
                        setBusy(true);
                        setError(null);
                        try {
                          await deleteAtlasMaterial(m.id);
                          await afterMutate();
                        } catch (err) {
                          setError(
                            err instanceof ApiError
                              ? err.message
                              : "Delete failed",
                          );
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    Delete
                  </Button>
                </Stack>
              ))}
            </Stack>
          )}

          <Box component="form" onSubmit={onPaste}>
            <Stack spacing={1.25}>
              <Typography sx={{ fontWeight: 600 }}>Paste notes</Typography>
              <TextField
                multiline
                minRows={3}
                value={pasteText}
                onChange={(ev) => setPasteText(ev.target.value)}
                placeholder="Paste tutorial or past-paper text…"
                disabled={busy}
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  size="small"
                  label="Filename (optional)"
                  value={pasteFilename}
                  onChange={(ev) => {
                    const next = ev.target.value;
                    setPasteFilename(next);
                    setPasteRole(suggestSourceRole(next || null));
                  }}
                  disabled={busy}
                  sx={{ flex: 1 }}
                />
                <TextField
                  select
                  size="small"
                  label="Role"
                  value={pasteRole}
                  onChange={(ev) =>
                    setPasteRole(ev.target.value as SourceRole)
                  }
                  disabled={busy}
                  sx={{ minWidth: 140 }}
                >
                  {SOURCE_ROLES.map((role) => (
                    <MenuItem key={role} value={role}>
                      {SOURCE_ROLE_LABELS[role]}
                    </MenuItem>
                  ))}
                </TextField>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={busy || !pasteText.trim()}
                >
                  Add paste
                </Button>
              </Stack>
            </Stack>
          </Box>

          <Stack spacing={1}>
            <Typography sx={{ fontWeight: 600 }}>Upload PDF</Typography>
            <Button
              variant="outlined"
              component="label"
              disabled={busy}
              sx={{ alignSelf: "flex-start" }}
            >
              Choose PDF
              <input
                hidden
                type="file"
                accept="application/pdf,.pdf"
                onChange={(ev) => {
                  const file = ev.target.files?.[0];
                  ev.target.value = "";
                  if (file) void onUpload(file);
                }}
              />
            </Button>
          </Stack>
        </Stack>
      </Collapse>
    </Paper>
  );
}
