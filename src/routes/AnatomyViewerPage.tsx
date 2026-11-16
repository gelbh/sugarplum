import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import BlurOnOutlinedIcon from "@mui/icons-material/BlurOnOutlined";
import CenterFocusStrongOutlinedIcon from "@mui/icons-material/CenterFocusStrongOutlined";
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined";
import CropFreeOutlinedIcon from "@mui/icons-material/CropFreeOutlined";
import FilterCenterFocusOutlinedIcon from "@mui/icons-material/FilterCenterFocusOutlined";
import FullscreenExitOutlinedIcon from "@mui/icons-material/FullscreenExitOutlined";
import FullscreenOutlinedIcon from "@mui/icons-material/FullscreenOutlined";
import GridOnOutlinedIcon from "@mui/icons-material/GridOnOutlined";
import HelpOutlineOutlinedIcon from "@mui/icons-material/HelpOutlineOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ThreeSixtyOutlinedIcon from "@mui/icons-material/ThreeSixtyOutlined";
import ZoomInOutlinedIcon from "@mui/icons-material/ZoomInOutlined";
import ZoomOutOutlinedIcon from "@mui/icons-material/ZoomOutOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import type { MouseEvent } from "react";
import AnatomyCanvas, {
  type AnatomyCameraMode,
  type AnatomyCanvasBackground,
  type AnatomyCanvasHandle,
  type AnatomyLoadSpec,
} from "../anatomy/AnatomyCanvas";
import AnatomyClipBar from "../anatomy/AnatomyClipBar";
import AnatomyClipHud from "../anatomy/AnatomyClipHud";
import AnatomyHelpOverlay from "../anatomy/AnatomyHelpOverlay";
import AnatomyMobileSheet, {
  type AnatomySheetTab,
} from "../anatomy/AnatomyMobileSheet";
import InfoPanel from "../anatomy/InfoPanel";
import MakeCardsDeckDialog from "../anatomy/MakeCardsDeckDialog";
import {
  activeRegionIdsForOpen,
  parseAnatomySceneManifest,
  safeAnatomyRelativeAsset,
} from "../anatomy/parseScene";
import { anatomyHubHref } from "../anatomy/paths";
import StructurePanel from "../anatomy/StructurePanel";
import {
  createStructureUiState,
  structureUiReducer,
} from "../anatomy/structureState";
import { makeCardsStructureIds } from "../anatomy/structureCard";
import TestYourself, {
  type AnatomyStudyMode,
} from "../anatomy/TestYourself";
import type { AnatomyClip, AnatomySceneManifest } from "../anatomy/types";
import {
  anatomyClipChrome,
  anatomyViewerMobile,
} from "../anatomy/viewerLayout";
import { isPlainClick, navigate } from "../nav/navigate";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

type Props = { sceneId: string; initialRegions?: string[] };

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

export default function AnatomyViewerPage({
  sceneId,
  initialRegions = [],
}: Props) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("md"), { noSsr: true });
  const { showRail, showSheetTriggers } = anatomyViewerMobile(mobile);
  const canvasRef = useRef<AnatomyCanvasHandle>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
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
  const [fadeOthers, setFadeOthers] = useState(false);
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipDepth01, setClipDepth01] = useState(0.5);
  const [autoFocus, setAutoFocus] = useState(true);
  const [cameraMode, setCameraMode] =
    useState<AnatomyCameraMode>("perspective");
  const [helpOpen, setHelpOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [bgId, setBgId] = useState<BgChoiceId>("page");
  const [studyMode, setStudyMode] = useState<AnatomyStudyMode>("explore");
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [makeCardsOpen, setMakeCardsOpen] = useState(false);
  const [makeCardsNotice, setMakeCardsNotice] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [clipPaused, setClipPaused] = useState(false);
  const [clipError, setClipError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<AnatomySheetTab>("structures");
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);

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
    setFadeOthers(false);
    setAutoFocus(true);
    setCameraMode("perspective");
    setHelpOpen(false);
    setBgId("page");
    setStudyMode("explore");
    setRevealedIds(new Set());
    setMakeCardsOpen(false);
    setMakeCardsNotice(null);
    setActiveClipId(null);
    setClipPaused(false);
    setClipError(null);
    setSheetOpen(false);
    setSheetTab("structures");
    setMoreAnchor(null);
  }, [sceneId]);

  useEffect(() => {
    const onFs = () => {
      const onStage = document.fullscreenElement === stageRef.current;
      setFullscreen(onStage);
      if (onStage) {
        setSheetOpen(false);
        setMoreAnchor(null);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (mobile) return;
    setSheetOpen(false);
    setMoreAnchor(null);
  }, [mobile]);

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
          setActiveRegions(
            new Set(activeRegionIdsForOpen(parsed, initialRegions)),
          );
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
    // initialRegions applied on mount; parent remounts when the region key changes.
  }, [sceneId]);

  const loads = useMemo(() => {
    if (!manifest) return null;
    return buildLoads(sceneId, manifest, activeRegions);
  }, [manifest, sceneId, activeRegions]);

  const loadsKey = loads?.map((l) => `${l.structureId}:${l.url}`).join("|") ?? "";
  useEffect(() => {
    setActiveClipId(null);
    setClipPaused(false);
    setClipError(null);
  }, [loadsKey]);

  const selectedStructure =
    manifest?.structures.find((s) => s.id === ui.selectedId) ?? null;
  const regionStructures = useMemo(() => {
    if (!manifest) return [];
    if (!manifest.regions?.length) return manifest.structures;
    return manifest.structures.filter(
      (s) => s.region != null && activeRegions.has(s.region),
    );
  }, [manifest, activeRegions]);
  const maskNames = studyMode === "type" || studyMode === "mcq";
  const selectedLabel = selectedStructure
    ? maskNames && !revealedIds.has(selectedStructure.id)
      ? "Hidden"
      : selectedStructure.label
    : null;
  const makeCardsIds = useMemo(
    () => makeCardsStructureIds(ui.selectedId, revealedIds),
    [ui.selectedId, revealedIds],
  );
  const makeCardsStructures = useMemo(() => {
    if (!manifest || makeCardsIds.length === 0) return [];
    const byId = new Map(manifest.structures.map((s) => [s.id, s]));
    return makeCardsIds
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => s != null);
  }, [manifest, makeCardsIds]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (isTypingTarget(ev.target)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const key = ev.key.toLowerCase();
      if (key === "h") {
        if (!ui.selectedId) return;
        ev.preventDefault();
        dispatch({ type: "toggleHidden", id: ui.selectedId });
        return;
      }
      if (key === "i") {
        if (!ui.selectedId) return;
        ev.preventDefault();
        dispatch(
          ui.isolatedId === ui.selectedId
            ? { type: "clearIsolate" }
            : { type: "isolate", id: ui.selectedId },
        );
        return;
      }
      if (key === "r") {
        ev.preventDefault();
        canvasRef.current?.resetView();
        return;
      }
      if (key === "?" || (ev.shiftKey && key === "/")) {
        ev.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ui.selectedId, ui.isolatedId]);

  const toggleFullscreen = async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* ignore fullscreen rejection */
    }
  };

  const changeRegions = (regionIds: string[]) => {
    setActiveRegions(new Set(regionIds));
    dispatch({ type: "reset" });
  };

  const canvasReady = !!manifest && !!loads && loads.length > 0;
  const toggleClipPlane = () => {
    if (!canvasReady || loads.length === 0) return;
    setClipEnabled((on) => !on);
  };
  const sceneClips = manifest?.clips ?? [];
  const hasClips = sceneClips.length > 0;
  const { showClipBar, showClipsTrigger } = anatomyClipChrome(mobile, hasClips);
  const activeClipLabel =
    sceneClips.find((c) => c.id === activeClipId)?.label ?? null;

  const selectClip = (clip: AnatomyClip, closeSheet: boolean) => {
    if (!manifest) return;
    const allIds = manifest.structures.map((s) => s.id);
    if (clip.reveal && clip.reveal.length > 0) {
      const keep = new Set(clip.reveal);
      dispatch({
        type: "hideAll",
        ids: allIds.filter((id) => !keep.has(id)),
      });
    }
    canvasRef.current?.stopClips();
    const ok = canvasRef.current?.playClip(clip.animation, {
      loop: clip.loop !== false,
    });
    if (!ok) {
      setClipError(`Animation "${clip.animation}" not found`);
      setActiveClipId(null);
      setClipPaused(false);
      return;
    }
    setClipError(null);
    setActiveClipId(clip.id);
    setClipPaused(false);
    setAutoRotate(false);
    if (closeSheet) setSheetOpen(false);
  };

  const togglePauseClip = () => {
    if (clipPaused) {
      canvasRef.current?.resumeClips();
      setClipPaused(false);
    } else {
      canvasRef.current?.pauseClips();
      setClipPaused(true);
    }
  };

  const markCorrect = (id: string) => {
    setRevealedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const bgSwatchButton = (choice: BgChoice) => {
    const selected = bgId === choice.id;
    return (
      <Tooltip key={choice.id} title={choice.label}>
        <span>
          <IconButton
            size="small"
            aria-label={`Background ${choice.label}`}
            aria-pressed={selected}
            onClick={() => {
              setBgId(choice.id);
              setMoreAnchor(null);
            }}
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
                      backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
                      bgcolor: "background.default",
                    }
                  : { bgcolor: choice.swatch }),
              }}
            />
          </IconButton>
        </span>
      </Tooltip>
    );
  };

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
        <Button
          size="small"
          variant="outlined"
          disabled={makeCardsStructures.length === 0}
          onClick={() => setMakeCardsOpen(true)}
          sx={{ ml: { xs: 0, md: "auto" } }}
        >
          Make cards
          {makeCardsStructures.length > 0
            ? ` (${makeCardsStructures.length})`
            : ""}
        </Button>
      </Stack>

      {makeCardsNotice ? (
        <Alert
          severity="success"
          sx={{ mb: 1, flexShrink: 0 }}
          onClose={() => setMakeCardsNotice(null)}
        >
          {makeCardsNotice}
        </Alert>
      ) : null}
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
          direction={showRail ? "row" : "column"}
          spacing={1.25}
          alignItems="stretch"
          sx={{ flex: 1, minHeight: 0 }}
        >
          {showRail ? (
            <Stack
              spacing={1.25}
              sx={{
                width: 280,
                flex: "0 0 auto",
                flexShrink: 0,
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <StructurePanel
                  structures={manifest.structures}
                  regions={manifest.regions}
                  activeRegions={activeRegions}
                  onChangeRegions={changeRegions}
                  ui={ui}
                  dispatch={dispatch}
                  maskNames={maskNames}
                  revealedIds={revealedIds}
                />
              </Box>
              <TestYourself
                mode={studyMode}
                onModeChange={setStudyMode}
                structure={selectedStructure}
                regionStructures={regionStructures}
                revealedIds={revealedIds}
                onCorrect={markCorrect}
              />
              {studyMode === "explore" ? (
                <InfoPanel structure={selectedStructure} />
              ) : null}
            </Stack>
          ) : null}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
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
              {!mobile ? (
                <>
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
                  <Tooltip
                    title={fadeOthers ? "Fade others on" : "Fade others off"}
                  >
                    <span>
                      <IconButton
                        size="small"
                        disabled={!canvasReady}
                        color={fadeOthers ? "primary" : "default"}
                        aria-pressed={fadeOthers}
                        aria-label="Fade others"
                        onClick={() => setFadeOthers((on) => !on)}
                      >
                        <BlurOnOutlinedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip
                    title={clipEnabled ? "Clip plane on" : "Clip plane off"}
                  >
                    <span>
                      <IconButton
                        size="small"
                        disabled={!canvasReady || loads.length === 0}
                        color={clipEnabled ? "primary" : "default"}
                        aria-pressed={clipEnabled}
                        aria-label="Clip plane"
                        onClick={toggleClipPlane}
                      >
                        <ContentCutOutlinedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  {clipEnabled ? (
                    <Slider
                      size="small"
                      min={0}
                      max={1}
                      step={0.01}
                      value={clipDepth01}
                      onChange={(_, v) =>
                        setClipDepth01(typeof v === "number" ? v : v[0])
                      }
                      aria-label="Clip depth"
                      sx={{ width: 96, mx: 1 }}
                    />
                  ) : null}
                  <Tooltip
                    title={autoFocus ? "Auto-focus on" : "Auto-focus off"}
                  >
                    <span>
                      <IconButton
                        size="small"
                        disabled={!canvasReady}
                        color={autoFocus ? "primary" : "default"}
                        aria-pressed={autoFocus}
                        aria-label="Auto-focus selection"
                        onClick={() => setAutoFocus((v) => !v)}
                      >
                        <FilterCenterFocusOutlinedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip
                    title={
                      cameraMode === "orthographic"
                        ? "Perspective camera"
                        : "Orthographic camera"
                    }
                  >
                    <span>
                      <IconButton
                        size="small"
                        disabled={!canvasReady}
                        color={
                          cameraMode === "orthographic" ? "primary" : "default"
                        }
                        aria-pressed={cameraMode === "orthographic"}
                        aria-label="Toggle orthographic camera"
                        onClick={() => {
                          setCameraMode((mode) =>
                            mode === "perspective"
                              ? "orthographic"
                              : "perspective",
                          );
                        }}
                      >
                        <CropFreeOutlinedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip
                    title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                  >
                    <span>
                      <IconButton
                        size="small"
                        disabled={!canvasReady}
                        aria-pressed={fullscreen}
                        aria-label={
                          fullscreen ? "Exit fullscreen" : "Fullscreen"
                        }
                        onClick={() => void toggleFullscreen()}
                      >
                        {fullscreen ? (
                          <FullscreenExitOutlinedIcon fontSize="small" />
                        ) : (
                          <FullscreenOutlinedIcon fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                </>
              ) : (
                <Tooltip title="More tools">
                  <span>
                    <IconButton
                      size="small"
                      disabled={!canvasReady}
                      aria-label="More tools"
                      aria-haspopup="menu"
                      aria-expanded={moreAnchor != null}
                      onClick={(ev) => setMoreAnchor(ev.currentTarget)}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              )}
              <Tooltip title="Controls help">
                <IconButton
                  size="small"
                  color={helpOpen ? "primary" : "default"}
                  aria-pressed={helpOpen}
                  aria-label="Controls help"
                  onClick={() => setHelpOpen((v) => !v)}
                >
                  <HelpOutlineOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {!mobile ? (
                <>
                  <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ px: 0.5, userSelect: "none" }}
                  >
                    BG
                  </Typography>
                  {bgChoices.map((choice) => bgSwatchButton(choice))}
                </>
              ) : null}
            </Stack>
            {showClipBar ? (
              <AnatomyClipBar
                clips={sceneClips}
                disabled={!canvasReady}
                activeClipId={activeClipId}
                clipPaused={clipPaused}
                clipError={clipError}
                onSelectClip={(clip: AnatomyClip) => selectClip(clip, false)}
                onTogglePause={togglePauseClip}
              />
            ) : null}
            <Menu
              anchorEl={moreAnchor}
              open={moreAnchor != null}
              onClose={() => setMoreAnchor(null)}
              container={stageEl ?? undefined}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            >
              <MenuItem
                disabled={!canvasReady}
                selected={wireframe}
                onClick={() => {
                  setWireframe((on) => !on);
                  setMoreAnchor(null);
                }}
              >
                Wireframe
              </MenuItem>
              <MenuItem
                disabled={!canvasReady}
                selected={fadeOthers}
                onClick={() => {
                  setFadeOthers((on) => !on);
                  setMoreAnchor(null);
                }}
              >
                Fade others
              </MenuItem>
              <MenuItem
                disabled={!canvasReady || loads.length === 0}
                selected={clipEnabled}
                onClick={() => {
                  toggleClipPlane();
                  setMoreAnchor(null);
                }}
              >
                Clip plane
              </MenuItem>
              <MenuItem
                disabled={!canvasReady}
                selected={autoFocus}
                onClick={() => {
                  setAutoFocus((v) => !v);
                  setMoreAnchor(null);
                }}
              >
                Auto-focus
              </MenuItem>
              <MenuItem
                disabled={!canvasReady}
                selected={cameraMode === "orthographic"}
                onClick={() => {
                  setCameraMode((mode) =>
                    mode === "perspective" ? "orthographic" : "perspective",
                  );
                  setMoreAnchor(null);
                }}
              >
                Orthographic
              </MenuItem>
              <MenuItem
                disabled={!canvasReady}
                onClick={() => {
                  setMoreAnchor(null);
                  void toggleFullscreen();
                }}
              >
                {fullscreen ? "Exit fullscreen" : "Fullscreen"}
              </MenuItem>
              <Divider />
              <Stack
                direction="row"
                alignItems="center"
                spacing={0.5}
                sx={{ px: 1.5, py: 0.75 }}
              >
                <Typography variant="caption" color="text.secondary">
                  BG
                </Typography>
                {bgChoices.map((choice) => bgSwatchButton(choice))}
              </Stack>
            </Menu>
            <Box
              ref={(el: HTMLDivElement | null) => {
                stageRef.current = el;
                setStageEl(el);
              }}
              sx={{
                flex: 1,
                minHeight: 0,
                position: "relative",
                bgcolor: "background.default",
              }}
            >
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
                  fadeOthers={fadeOthers}
                  clipEnabled={clipEnabled}
                  clipDepth01={clipDepth01}
                  autoFocus={autoFocus}
                  cameraMode={cameraMode}
                  onSelect={(id) => dispatch({ type: "select", id })}
                />
              )}
              {showSheetTriggers ? (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    position: "absolute",
                    left: 8,
                    bottom: 8,
                    zIndex: 1,
                  }}
                >
                  <Button
                    size="small"
                    variant="contained"
                    aria-haspopup="dialog"
                    aria-expanded={sheetOpen && sheetTab === "structures"}
                    aria-controls={
                      sheetOpen ? "anatomy-mobile-sheet-title" : undefined
                    }
                    onClick={() => {
                      setSheetTab("structures");
                      setSheetOpen(true);
                    }}
                  >
                    Structures
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    aria-haspopup="dialog"
                    aria-expanded={sheetOpen && sheetTab === "study"}
                    aria-controls={
                      sheetOpen ? "anatomy-mobile-sheet-title" : undefined
                    }
                    onClick={() => {
                      setSheetTab("study");
                      setSheetOpen(true);
                    }}
                  >
                    Study
                  </Button>
                  {showClipsTrigger ? (
                    <Button
                      size="small"
                      variant="contained"
                      aria-haspopup="dialog"
                      aria-expanded={sheetOpen && sheetTab === "clips"}
                      aria-controls={
                        sheetOpen ? "anatomy-mobile-sheet-title" : undefined
                      }
                      onClick={() => {
                        setSheetTab("clips");
                        setSheetOpen(true);
                      }}
                    >
                      Clips
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
              {mobile ? (
                <AnatomyClipHud
                  activeClipId={activeClipId}
                  activeLabel={activeClipLabel}
                  clipPaused={clipPaused}
                  clipError={clipError}
                  disabled={!canvasReady}
                  onTogglePause={togglePauseClip}
                />
              ) : null}
              <AnatomyHelpOverlay
                open={helpOpen}
                onClose={() => setHelpOpen(false)}
                touch={mobile}
              />
            </Box>
          </Box>
        </Stack>
      ) : !error && !manifest ? (
        <Typography color="text.secondary">Loading scene…</Typography>
      ) : null}

      {manifest ? (
        <AnatomyMobileSheet
          open={showSheetTriggers && sheetOpen}
          onClose={() => setSheetOpen(false)}
          tab={sheetTab}
          onTabChange={setSheetTab}
          container={stageEl}
          structures={manifest.structures}
          regions={manifest.regions}
          activeRegions={activeRegions}
          onChangeRegions={changeRegions}
          ui={ui}
          dispatch={dispatch}
          maskNames={maskNames}
          revealedIds={revealedIds}
          studyMode={studyMode}
          onStudyModeChange={setStudyMode}
          selectedStructure={selectedStructure}
          regionStructures={regionStructures}
          onCorrect={markCorrect}
          clips={sceneClips}
          clipsDisabled={!canvasReady}
          activeClipId={activeClipId}
          clipPaused={clipPaused}
          clipError={clipError}
          onSelectClip={(clip) => selectClip(clip, true)}
          onTogglePauseClip={togglePauseClip}
        />
      ) : null}

      <MakeCardsDeckDialog
        open={makeCardsOpen}
        sceneId={sceneId}
        sceneTitle={manifest?.title ?? sceneId}
        structures={makeCardsStructures}
        onClose={() => setMakeCardsOpen(false)}
        onCreated={(count) => {
          setMakeCardsNotice(
            count === 1
              ? "Created 1 Study card. Open Library to review it."
              : `Created ${count} Study cards. Open Library to review them.`,
          );
        }}
      />
    </Box>
  );
}
