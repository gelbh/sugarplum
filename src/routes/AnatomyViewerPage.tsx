import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import CenterFocusStrongOutlinedIcon from "@mui/icons-material/CenterFocusStrongOutlined";
import GridOnOutlinedIcon from "@mui/icons-material/GridOnOutlined";
import ThreeSixtyOutlinedIcon from "@mui/icons-material/ThreeSixtyOutlined";
import ZoomInOutlinedIcon from "@mui/icons-material/ZoomInOutlined";
import ZoomOutOutlinedIcon from "@mui/icons-material/ZoomOutOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import type { MouseEvent } from "react";
import AnatomyCanvas, {
  type AnatomyCanvasBackground,
  type AnatomyCanvasHandle,
  type AnatomyLoadSpec,
} from "../anatomy/AnatomyCanvas";
import {
  defaultActiveRegionIds,
  parseAnatomySceneManifest,
  safeAnatomyRelativeAsset,
} from "../anatomy/parseScene";
import { anatomyHubHref } from "../anatomy/paths";
import StructurePanel from "../anatomy/StructurePanel";
import {
  createStructureUiState,
  structureUiReducer,
} from "../anatomy/structureState";
import type { AnatomySceneManifest } from "../anatomy/types";
import { isPlainClick, navigate } from "../nav/navigate";

type Props = { sceneId: string };

type BgChoiceId = "page" | "paper" | "studio" | "white" | "stage";

type BgChoice = {
  id: BgChoiceId;
  label: string;
  swatch: string | "checker";
  value: AnatomyCanvasBackground;
};

function buildLoads(
  sceneId: string,
  manifest: AnatomySceneManifest,
  activeRegions: Set<string>,
): AnatomyLoadSpec[] | null {
  const base = `/anatomy/${encodeURIComponent(sceneId)}/`;
  const structures =
    manifest.regions && manifest.regions.length > 0
      ? manifest.structures.filter(
          (s) => s.region != null && activeRegions.has(s.region),
        )
      : manifest.structures;

  if (manifest.asset) {
    const rel = safeAnatomyRelativeAsset(manifest.asset);
    if (!rel) return null;
    const url = `${base}${rel}`;
    return structures.map((s) => ({
      structureId: s.id,
      url,
      node: s.node,
    }));
  }
  const loads: AnatomyLoadSpec[] = [];
  for (const s of structures) {
    if (!s.asset) return null;
    const rel = safeAnatomyRelativeAsset(s.asset);
    if (!rel) return null;
    loads.push({
      structureId: s.id,
      url: `${base}${rel}`,
      node: s.node,
    });
  }
  return loads;
}

export default function AnatomyViewerPage({ sceneId }: Props) {
  const theme = useTheme();
  const canvasRef = useRef<AnatomyCanvasHandle>(null);
  const [manifest, setManifest] = useState<AnatomySceneManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRegions, setActiveRegions] = useState<Set<string>>(
    () => new Set(),
  );
  const [ui, dispatch] = useReducer(
    structureUiReducer,
    undefined,
    createStructureUiState,
  );
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [bgId, setBgId] = useState<BgChoiceId>("page");

  const bgChoices = useMemo<BgChoice[]>(
    () => [
      {
        id: "page",
        label: "Page",
        swatch: "checker",
        value: null,
      },
      {
        id: "paper",
        label: "Paper",
        swatch: theme.palette.background.paper,
        value: theme.palette.background.paper,
      },
      {
        id: "studio",
        label: "Studio",
        swatch: "#d8d2cc",
        value: "#d8d2cc",
      },
      {
        id: "white",
        label: "White",
        swatch: "#ffffff",
        value: "#ffffff",
      },
      {
        id: "stage",
        label: "Stage",
        swatch: "#1e0d1b",
        value: "#1e0d1b",
      },
    ],
    [theme.palette.background.paper],
  );

  const canvasBackground = bgChoices.find((c) => c.id === bgId)?.value ?? null;

  useEffect(() => {
    dispatch({ type: "reset" });
    setAutoRotate(false);
    setWireframe(false);
    setBgId("page");
  }, [sceneId]);

  useEffect(() => {
    let cancelled = false;
    setManifest(null);
    setError(null);
    setActiveRegions(new Set());
    void (async () => {
      try {
        const res = await fetch(
          `/anatomy/${encodeURIComponent(sceneId)}/scene.json`,
        );
        if (!res.ok) throw new Error(`Could not load scene (${res.status})`);
        const json: unknown = await res.json();
        const parsed = parseAnatomySceneManifest(json);
        if (parsed.id !== sceneId) {
          throw new Error("Scene id mismatch");
        }
        if (!cancelled) {
          setManifest(parsed);
          setActiveRegions(new Set(defaultActiveRegionIds(parsed)));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load scene");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  const loads = useMemo(() => {
    if (!manifest) return null;
    return buildLoads(sceneId, manifest, activeRegions);
  }, [manifest, sceneId, activeRegions]);

  const selectedLabel =
    manifest?.structures.find((s) => s.id === ui.selectedId)?.label ?? null;

  const changeRegions = (regionIds: string[]) => {
    setActiveRegions(new Set(regionIds));
    dispatch({ type: "reset" });
  };

  const canvasReady = !!manifest && !!loads && loads.length > 0;

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        px: { xs: 1.5, md: 2 },
        py: { xs: 1, md: 1.25 },
        boxSizing: "border-box",
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        useFlexGap
        flexWrap="wrap"
        sx={{ flexShrink: 0, mb: 1, minHeight: 36 }}
      >
        <Link
          href={anatomyHubHref()}
          underline="hover"
          variant="body2"
          color="text.secondary"
          onClick={(ev: MouseEvent<HTMLAnchorElement>) => {
            if (!isPlainClick(ev)) return;
            ev.preventDefault();
            navigate(anatomyHubHref());
          }}
        >
          Anatomy
        </Link>
        <Typography color="text.secondary" variant="body2" aria-hidden>
          /
        </Typography>
        <Typography
          variant="h6"
          component="h1"
          sx={{ fontWeight: 600, letterSpacing: "-0.02em", fontSize: "1.1rem" }}
        >
          {manifest?.title ?? sceneId}
        </Typography>
        {selectedLabel ? (
          <Chip label={selectedLabel} size="small" color="primary" />
        ) : (
          <Typography variant="body2" color="text.secondary">
            Pick a structure in the list or on the model.
          </Typography>
        )}
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 1, flexShrink: 0 }}>
          {error}
        </Alert>
      ) : null}
      {manifest && loads === null ? (
        <Alert severity="error" sx={{ mb: 1, flexShrink: 0 }}>
          Invalid asset paths in scene manifest.
        </Alert>
      ) : null}

      {manifest && loads ? (
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.25}
          alignItems="stretch"
          sx={{ flex: 1, minHeight: 0 }}
        >
          <StructurePanel
            structures={manifest.structures}
            regions={manifest.regions}
            activeRegions={activeRegions}
            onChangeRegions={changeRegions}
            ui={ui}
            dispatch={dispatch}
          />
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: { xs: 240, md: 0 },
              display: "flex",
              flexDirection: "column",
              borderRadius: 1,
              border: 1,
              borderColor: "divider",
              overflow: "hidden",
              bgcolor: "background.default",
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.25}
              flexWrap="wrap"
              useFlexGap
              sx={{
                flexShrink: 0,
                px: 0.75,
                py: 0.35,
                borderBottom: 1,
                borderColor: "divider",
                bgcolor: "action.hover",
              }}
            >
              <Tooltip title="Reset view">
                <span>
                  <IconButton
                    size="small"
                    disabled={!canvasReady}
                    aria-label="Reset view"
                    onClick={() => canvasRef.current?.resetView()}
                  >
                    <CenterFocusStrongOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Zoom in">
                <span>
                  <IconButton
                    size="small"
                    disabled={!canvasReady}
                    aria-label="Zoom in"
                    onClick={() => canvasRef.current?.zoomBy(0.8)}
                  >
                    <ZoomInOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Zoom out">
                <span>
                  <IconButton
                    size="small"
                    disabled={!canvasReady}
                    aria-label="Zoom out"
                    onClick={() => canvasRef.current?.zoomBy(1.25)}
                  >
                    <ZoomOutOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Tooltip title={autoRotate ? "Stop rotate" : "Auto-rotate"}>
                <span>
                  <IconButton
                    size="small"
                    disabled={!canvasReady}
                    color={autoRotate ? "primary" : "default"}
                    aria-pressed={autoRotate}
                    aria-label="Auto-rotate"
                    onClick={() => setAutoRotate((on) => !on)}
                  >
                    <ThreeSixtyOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={wireframe ? "Solid shading" : "Wireframe"}>
                <span>
                  <IconButton
                    size="small"
                    disabled={!canvasReady}
                    color={wireframe ? "primary" : "default"}
                    aria-pressed={wireframe}
                    aria-label="Wireframe"
                    onClick={() => setWireframe((on) => !on)}
                  >
                    <GridOnOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 0.5, userSelect: "none" }}
              >
                BG
              </Typography>
              {bgChoices.map((choice) => {
                const selected = bgId === choice.id;
                return (
                  <Tooltip key={choice.id} title={choice.label}>
                    <span>
                      <IconButton
                        size="small"
                        aria-label={`Background ${choice.label}`}
                        aria-pressed={selected}
                        onClick={() => setBgId(choice.id)}
                        sx={{
                          p: 0.4,
                          border: 1,
                          borderColor: selected ? "primary.main" : "divider",
                          borderRadius: 1,
                        }}
                      >
                        <Box
                          aria-hidden
                          sx={{
                            width: 16,
                            height: 16,
                            borderRadius: 0.5,
                            border: 1,
                            borderColor: "divider",
                            ...(choice.swatch === "checker"
                              ? {
                                  backgroundImage:
                                    "linear-gradient(45deg, rgba(128,128,128,0.35) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,0.35) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.35) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.35) 75%)",
                                  backgroundSize: "8px 8px",
                                  backgroundPosition:
                                    "0 0, 0 4px, 4px -4px, -4px 0",
                                  bgcolor: "background.default",
                                }
                              : { bgcolor: choice.swatch }),
                          }}
                        />
                      </IconButton>
                    </span>
                  </Tooltip>
                );
              })}
            </Stack>
            <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
              {loads.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 6, px: 2 }}>
                  Enable a region to load 3D models.
                </Typography>
              ) : (
                <AnatomyCanvas
                  ref={canvasRef}
                  key={loads.map((l) => `${l.structureId}:${l.url}`).join("|")}
                  loads={loads}
                  ui={ui}
                  background={canvasBackground}
                  autoRotate={autoRotate}
                  wireframe={wireframe}
                  onSelect={(id) => dispatch({ type: "select", id })}
                />
              )}
            </Box>
          </Box>
        </Stack>
      ) : !error && !manifest ? (
        <Typography color="text.secondary">Loading scene…</Typography>
      ) : null}
    </Box>
  );
}
