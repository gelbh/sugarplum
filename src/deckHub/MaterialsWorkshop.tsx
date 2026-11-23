import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import SlideshowOutlinedIcon from "@mui/icons-material/SlideshowOutlined";
import TextSnippetOutlinedIcon from "@mui/icons-material/TextSnippetOutlined";
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import type { MaterialListItem } from "../api/client";
import { downloadMaterialUrl, mediaUrl } from "../api/client";
import EmptyNext from "./EmptyNext";
import WorkshopSearchField from "./WorkshopSearchField";
import {
  materialMatchesWorkshopQuery,
  normalizeWorkshopQuery,
  workshopMaterialKindLabel,
  workshopMaterialTitle,
} from "./workshopSearch";
import {
  PILL_BTN,
  ROW_ACTION,
  createWorkshopViewPref,
  type WorkshopViewMode,
} from "./workshopChrome";

const { readViewMode, writeViewMode } = createWorkshopViewPref(
  "sugarplum.materialsWorkshop.view",
);

type ViewMode = WorkshopViewMode;

const SURFACE = {
  borderRadius: 2,
  border: "1px solid",
  borderColor: "rgba(232, 216, 199, 0.12)",
  bgcolor: "rgba(18, 7, 15, 0.28)",
} as const;

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function canOpenFile(material: MaterialListItem): boolean {
  return Boolean(material.r2_key);
}

function KindGlyph({ kind, size = 36 }: { kind: string; size?: number }) {
  const sx = { fontSize: size, color: "rgba(232, 216, 199, 0.55)" } as const;
  if (kind === "pdf") return <PictureAsPdfOutlinedIcon sx={sx} />;
  if (kind === "pptx") return <SlideshowOutlinedIcon sx={sx} />;
  if (kind === "text" || kind === "paste" || kind === "topic") {
    return <TextSnippetOutlinedIcon sx={sx} />;
  }
  return <InsertDriveFileOutlinedIcon sx={sx} />;
}

function MaterialThumb({
  material,
  height = 120,
}: {
  material: MaterialListItem;
  height?: number;
}) {
  if (material.kind === "image" && material.r2_key) {
    return (
      <Box
        component="img"
        src={mediaUrl(material.r2_key)}
        alt=""
        loading="lazy"
        sx={{
          width: "100%",
          height,
          objectFit: "cover",
          display: "block",
          bgcolor: "rgba(0,0,0,0.35)",
        }}
      />
    );
  }
  return (
    <Box
      sx={{
        width: "100%",
        height,
        display: "grid",
        placeItems: "center",
        bgcolor: "rgba(91, 44, 111, 0.14)",
      }}
    >
      <KindGlyph kind={material.kind} size={42} />
    </Box>
  );
}

type Props = {
  materials: MaterialListItem[];
  busyId: string | null;
  guest: boolean;
  onUpload: () => void;
  onDelete: (material: MaterialListItem) => void;
};

export default function MaterialsWorkshop({
  materials,
  busyId,
  guest,
  onUpload,
  onDelete,
}: Props) {
  const [view, setView] = useState<ViewMode>(() => readViewMode());
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<MaterialListItem | null>(null);
  const busy = busyId !== null;
  const visible = materials.filter((m) =>
    materialMatchesWorkshopQuery(m, query),
  );
  const searching = normalizeWorkshopQuery(query) !== "";
  const countLabel =
    materials.length === 0
      ? "No files yet"
      : searching
        ? `${visible.length} of ${materials.length} files`
        : materials.length === 1
          ? "1 file"
          : `${materials.length} files`;

  function onViewChange(_: unknown, next: ViewMode | null) {
    if (!next) return;
    setView(next);
    writeViewMode(next);
  }

  return (
    <Stack spacing={1.75} sx={{ minHeight: 0 }}>
      <Stack
        direction="row"
        useFlexGap
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 1.25,
        }}
      >
        <Stack
          direction="row"
          spacing={1.25}
          useFlexGap
          sx={{
            alignItems: "center",
          }}
        >
          <Button
            variant="contained"
            size="small"
            startIcon={<AddRoundedIcon sx={{ fontSize: 18 }} />}
            onClick={onUpload}
            disabled={guest || busy}
            sx={{
              ...PILL_BTN,
              px: 1.75,
              py: 0.85,
              fontSize: "0.8125rem",
            }}
          >
            Upload file
          </Button>
          <Typography
            variant="caption"
            sx={{
              color: "rgba(232, 216, 199, 0.55)",
              letterSpacing: "0.04em",
            }}
          >
            {countLabel}
          </Typography>
          {materials.length > 0 ? (
            <WorkshopSearchField
              value={query}
              onChange={setQuery}
              placeholder="Search files…"
              ariaLabel="Search files"
              ariaControls="materials-workshop-results"
            />
          ) : null}
        </Stack>

        {materials.length > 0 ? (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            aria-label="File layout"
            onChange={onViewChange}
            sx={{
              bgcolor: "rgba(18, 7, 15, 0.35)",
              "& .MuiToggleButton-root": {
                borderColor: "rgba(232, 216, 199, 0.16)",
                color: "rgba(232, 216, 199, 0.55)",
                px: 1,
                "&.Mui-selected": {
                  color: "primary.light",
                  bgcolor: "rgba(91, 44, 111, 0.35)",
                },
              },
            }}
          >
            <ToggleButton value="icons" aria-label="Icons" title="Icons">
              <GridViewOutlinedIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="details" aria-label="Details" title="Details">
              <ViewListOutlinedIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        ) : null}
      </Stack>

      {materials.length === 0 ? (
        guest ? (
          <Box sx={{ ...SURFACE, px: 2.25, py: 2.5 }}>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              Sign in to upload and browse study files for this deck.
            </Typography>
          </Box>
        ) : (
          <EmptyNext
            title="No files yet"
            body="Upload a PDF, PPTX, or image to generate drafts from."
            primary={{ label: "Upload file", onClick: onUpload }}
          />
        )
      ) : searching && visible.length === 0 ? (
        <Box
          id="materials-workshop-results"
          sx={{
            ...SURFACE,
            px: 2.25,
            py: 2.5,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {`No files match "${query.trim()}"`}
          </Typography>
        </Box>
      ) : view === "icons" ? (
        <Box
          id="materials-workshop-results"
          component="ul"
          sx={{
            m: 0,
            p: 0,
            listStyle: "none",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
            gap: 1.25,
          }}
        >
          {visible.map((material) => {
            const title = workshopMaterialTitle(material);
            const rowBusy = busyId === material.id;
            const openable = canOpenFile(material);
            return (
              <Box
                component="li"
                key={material.id}
                sx={{
                  ...SURFACE,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  transition:
                    "background-color 140ms ease, border-color 140ms ease",
                  "&:hover": {
                    borderColor: "rgba(232, 216, 199, 0.22)",
                    bgcolor: "rgba(91, 44, 111, 0.16)",
                    "& .sp-material-tile-actions": { opacity: 1 },
                  },
                }}
              >
                <Box
                  component="button"
                  type="button"
                  aria-label={`View ${title}`}
                  disabled={busy || guest || !openable}
                  onClick={() => {
                    if (openable) setPreview(material);
                  }}
                  sx={{
                    all: "unset",
                    cursor: openable && !busy && !guest ? "pointer" : "default",
                    display: "block",
                    width: "100%",
                  }}
                >
                  <MaterialThumb material={material} />
                </Box>
                <Stack spacing={0.35} sx={{ px: 1.1, pt: 1, pb: 0.35 }}>
                  <Typography
                    variant="body2"
                    noWrap
                    title={title}
                    sx={{
                      fontWeight: 500,
                      color: "rgba(245, 245, 245, 0.92)",
                      lineHeight: 1.3,
                    }}
                  >
                    {title}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "rgba(232, 216, 199, 0.55)" }}
                  >
                    {workshopMaterialKindLabel(material.kind)}
                    {material.page_count != null
                      ? ` · ${material.page_count}p`
                      : ""}
                  </Typography>
                </Stack>
                <Stack
                  className="sp-material-tile-actions"
                  direction="row"
                  sx={{
                    justifyContent: "flex-end",
                    px: 0.5,
                    pb: 0.5,
                    opacity: { xs: 1, sm: 0.55 },
                    transition: "opacity 140ms ease",
                  }}
                >
                  <FileActions
                    material={material}
                    title={title}
                    busy={busy}
                    guest={guest}
                    rowBusy={rowBusy}
                    onView={() => setPreview(material)}
                    onDelete={onDelete}
                  />
                </Stack>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Stack
          id="materials-workshop-results"
          component="ul"
          spacing={0.75}
          sx={{ m: 0, p: 0, listStyle: "none" }}
        >
          {visible.map((material) => {
            const title = workshopMaterialTitle(material);
            const metaParts = [
              workshopMaterialKindLabel(material.kind),
              material.page_count != null
                ? `${material.page_count} page${material.page_count === 1 ? "" : "s"}`
                : null,
              material.status !== "ready" ? material.status : null,
              formatCreatedAt(material.created_at),
            ].filter(Boolean);
            const rowBusy = busyId === material.id;
            const openable = canOpenFile(material);

            return (
              <Box
                component="li"
                key={material.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1.25,
                  py: 0.85,
                  ...SURFACE,
                  transition:
                    "background-color 140ms ease, border-color 140ms ease",
                  "&:hover": {
                    borderColor: "rgba(232, 216, 199, 0.22)",
                    bgcolor: "rgba(91, 44, 111, 0.16)",
                    "& .sp-material-row-actions": { opacity: 1 },
                  },
                }}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    flexShrink: 0,
                    borderRadius: 1.25,
                    overflow: "hidden",
                    border: "1px solid",
                    borderColor: "rgba(232, 216, 199, 0.12)",
                  }}
                >
                  <MaterialThumb material={material} height={48} />
                </Box>
                <Box
                  component="button"
                  type="button"
                  disabled={!openable || busy || guest}
                  onClick={() => {
                    if (openable) setPreview(material);
                  }}
                  sx={{
                    all: "unset",
                    flex: 1,
                    minWidth: 0,
                    py: 0.25,
                    cursor: openable && !busy && !guest ? "pointer" : "default",
                  }}
                >
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      fontWeight: 500,
                      color: "rgba(245, 245, 245, 0.92)",
                      lineHeight: 1.35,
                    }}
                  >
                    {title}
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={0.75}
                    useFlexGap
                    sx={{
                      flexWrap: "wrap",
                      mt: 0.55,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        display: "inline-flex",
                        px: 0.85,
                        py: 0.15,
                        borderRadius: 999,
                        border: "1px solid",
                        borderColor: "rgba(232, 216, 199, 0.18)",
                        bgcolor: "rgba(18, 7, 15, 0.35)",
                        typography: "caption",
                        fontSize: "0.6875rem",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "rgba(232, 216, 199, 0.62)",
                      }}
                    >
                      {workshopMaterialKindLabel(material.kind)}
                    </Box>
                    {metaParts.slice(1).map((part) => (
                      <Typography
                        key={`${material.id}-${part}`}
                        variant="caption"
                        sx={{ color: "rgba(232, 216, 199, 0.55)" }}
                      >
                        {part}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
                <Stack
                  className="sp-material-row-actions"
                  direction="row"
                  spacing={0.15}
                  sx={{
                    flexShrink: 0,
                    opacity: { xs: 1, sm: 0.55 },
                    transition: "opacity 140ms ease",
                  }}
                >
                  <FileActions
                    material={material}
                    title={title}
                    busy={busy}
                    guest={guest}
                    rowBusy={rowBusy}
                    onView={() => setPreview(material)}
                    onDelete={onDelete}
                  />
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      <MaterialPreviewDialog
        material={preview}
        guest={guest}
        onClose={() => setPreview(null)}
      />
    </Stack>
  );
}

function FileActions({
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

function MaterialPreviewDialog({
  material,
  guest,
  onClose,
}: {
  material: MaterialListItem | null;
  guest: boolean;
  onClose: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    function clearBlob() {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
    }

    if (!material || guest || !material.r2_key) {
      clearBlob();
      setTextBody(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    if (
      material.kind === "image" ||
      material.kind === "pptx" ||
      material.kind === "topic"
    ) {
      clearBlob();
      setTextBody(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    clearBlob();
    setLoading(true);
    setLoadError(null);
    setTextBody(null);

    void (async () => {
      try {
        const res = await fetch(downloadMaterialUrl(material.id), {
          credentials: "same-origin",
        });
        if (!res.ok) {
          throw new Error(`Could not open file (${res.status})`);
        }
        if (material.kind === "text" || material.kind === "paste") {
          const text = await res.text();
          if (!cancelled) setTextBody(text);
        } else {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          blobUrlRef.current = url;
          setBlobUrl(url);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not open file",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [material, guest]);

  const open = material !== null;
  const title = material ? workshopMaterialTitle(material) : "File";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={material?.kind === "pdf" ? "lg" : "md"}
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            bgcolor: "#12070f",
            backgroundImage: "none",
            border: "1px solid rgba(232, 216, 199, 0.14)",
            minHeight: material?.kind === "pdf" ? "70vh" : undefined,
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
          fontWeight: 400,
          pr: 2,
        }}
      >
        {title}
      </DialogTitle>
      <DialogContent
        sx={{
          px: 2.5,
          pb: 1.5,
          display: "flex",
          flexDirection: "column",
          minHeight: material?.kind === "pdf" ? "55vh" : 200,
        }}
      >
        {loading ? (
          <Box sx={{ flex: 1, display: "grid", placeItems: "center", py: 6 }}>
            <CircularProgress size={28} />
          </Box>
        ) : loadError ? (
          <Typography color="error" variant="body2">
            {loadError}
          </Typography>
        ) : material?.kind === "image" && material.r2_key ? (
          <Box
            component="img"
            src={mediaUrl(material.r2_key)}
            alt={title}
            sx={{
              maxWidth: "100%",
              maxHeight: "70vh",
              objectFit: "contain",
              mx: "auto",
              display: "block",
              borderRadius: 1,
            }}
          />
        ) : material?.kind === "pdf" && blobUrl ? (
          <Box
            component="iframe"
            title={title}
            src={blobUrl}
            sx={{
              flex: 1,
              width: "100%",
              minHeight: "55vh",
              border: 0,
              borderRadius: 1,
              bgcolor: "#1a1018",
            }}
          />
        ) : textBody != null ? (
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              borderRadius: 1.5,
              border: "1px solid rgba(232, 216, 199, 0.12)",
              bgcolor: "rgba(18, 7, 15, 0.45)",
              color: "rgba(245, 245, 245, 0.88)",
              fontSize: "0.8125rem",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "60vh",
              overflow: "auto",
            }}
          >
            {textBody || "(empty file)"}
          </Box>
        ) : material ? (
          <Stack spacing={1.25} sx={{ py: 2 }}>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
              {material.kind === "pptx"
                ? "PowerPoint files open via download. Preview is not available in the browser."
                : "This file cannot be previewed here."}
            </Typography>
            {material.r2_key && !guest ? (
              <Button
                variant="outlined"
                href={downloadMaterialUrl(material.id)}
                startIcon={<FileDownloadOutlinedIcon />}
                sx={PILL_BTN}
              >
                Download file
              </Button>
            ) : null}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.75, gap: 1 }}>
        {material?.r2_key && !guest ? (
          <Button
            href={downloadMaterialUrl(material.id)}
            startIcon={<FileDownloadOutlinedIcon />}
            sx={{
              ...PILL_BTN,
              color: "rgba(232, 216, 199, 0.75)",
            }}
          >
            Download
          </Button>
        ) : null}
        <Button onClick={onClose} variant="contained" sx={PILL_BTN}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
