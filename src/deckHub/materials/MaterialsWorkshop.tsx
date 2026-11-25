import { useDeferredValue, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined";
import type { MaterialListItem } from "../../api/client";
import EmptyNext from "../workshop/EmptyNext";
import { MaterialThumb } from "./MaterialThumb";
import FileActions from "./MaterialFileActions";
import MaterialPreviewDialog from "./MaterialPreviewDialog";
import WorkshopSearchField from "../workshop/WorkshopSearchField";
import {
  materialMatchesWorkshopQuery,
  normalizeWorkshopQuery,
  workshopMaterialKindLabel,
  workshopMaterialTitle,
} from "../workshop/workshopSearch";
import {
  PILL_BTN,
  WORKSHOP_SURFACE,
  createWorkshopViewPref,
  type WorkshopViewMode,
} from "../workshop/workshopChrome";

const { readViewMode, writeViewMode } = createWorkshopViewPref(
  "sugarplum.materialsWorkshop.view",
);

type ViewMode = WorkshopViewMode;

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
  const deferredQuery = useDeferredValue(query);
  const [preview, setPreview] = useState<MaterialListItem | null>(null);
  const busy = busyId !== null;
  const visible = materials.filter((m) =>
    materialMatchesWorkshopQuery(m, deferredQuery),
  );
  const searching = normalizeWorkshopQuery(deferredQuery) !== "";
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
          <Box sx={{ ...WORKSHOP_SURFACE, px: 2.25, py: 2.5 }}>
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
            ...WORKSHOP_SURFACE,
            px: 2.25,
            py: 2.5,
          }}
        >
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {`No files match "${deferredQuery.trim()}"`}
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
                  ...WORKSHOP_SURFACE,
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
                  ...WORKSHOP_SURFACE,
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
