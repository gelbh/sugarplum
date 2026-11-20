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
import { AnatomyCanvas,
  type AnatomyCameraMode,
  type AnatomyCanvasHandle,
} from "../anatomy";
import { AnatomyClipBar } from "../anatomy";
import { AnatomyClipHud } from "../anatomy";
import { AnatomyHelpOverlay } from "../anatomy";
import { AnatomyMobileSheet,
  type AnatomySheetTab,
} from "../anatomy";
import {
  anatomyViewerBgChoices,
  type BgChoice,
  type BgChoiceId,
} from "../anatomy";
import { buildLoads } from "../anatomy";
import { selectedStructureLabelText } from "../anatomy";
import { InfoPanel } from "../anatomy";
import { MakeCardsDeckDialog } from "../anatomy";
import { anatomyHubHref } from "../anatomy";
import { StructurePanel } from "../anatomy";
import {
  createStructureUiState,
  structureUiReducer,
} from "../anatomy";
import { makeCardsStructureIds } from "../anatomy";
import { TestYourself,
  type AnatomyStudyMode,
} from "../anatomy";
import { useAnatomyViewerClips } from "../anatomy";
import { useAnatomyViewerFullscreen } from "../anatomy";
import { useAnatomyViewerKeys } from "../anatomy";
import { useAnatomyViewerManifest } from "../anatomy";
import {
  anatomyClipChrome,
  anatomyViewerMobile,
} from "../anatomy";
import { isPlainClick, navigate } from "../shared/nav/navigate";

type Props = { sceneId: string; initialRegions?: string[] };

export default function AnatomyViewerPage({
  sceneId,
  initialRegions = [],
}: Props) {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });
  const { showRail, showSheetTriggers } = anatomyViewerMobile(mobile);
  const canvasRef = useRef<AnatomyCanvasHandle>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
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

  const { fullscreen, toggleFullscreen } = useAnatomyViewerFullscreen({
    stageRef,
    setSheetOpen,
    setMoreAnchor,
  });

  const { manifest, error, activeRegions, setActiveRegions } =
    useAnatomyViewerManifest({
      sceneId,
      initialRegions,
      dispatch,
      setAutoRotate,
      setWireframe,
      setFadeOthers,
      setAutoFocus,
      setCameraMode,
      setHelpOpen,
      setBgId,
      setStudyMode,
      setRevealedIds,
      setMakeCardsOpen,
      setMakeCardsNotice,
      setActiveClipId,
      setClipPaused,
      setClipError,
      setSheetOpen,
      setSheetTab,
      setMoreAnchor,
    });

  const bgChoices = useMemo(
    () => anatomyViewerBgChoices(theme.palette.background.paper),
    [theme.palette.background.paper],
  );

  const canvasBackground = bgChoices.find((c) => c.id === bgId)?.value ?? null;

  useEffect(() => {
    if (mobile) return;
    setSheetOpen(false);
    setMoreAnchor(null);
  }, [mobile]);

  const loads = useMemo(() => {
    if (!manifest) return null;
    return buildLoads(sceneId, manifest, activeRegions);
  }, [manifest, sceneId, activeRegions]);

  const loadsKey =
    loads?.map((l) => `${l.structureId}:${l.url}`).join("|") ?? "";

  const { selectClip, togglePauseClip } = useAnatomyViewerClips({
    manifest,
    canvasRef,
    loadsKey,
    dispatch,
    clipPaused,
    setActiveClipId,
    setClipPaused,
    setClipError,
    setAutoRotate,
    setSheetOpen,
  });

  useAnatomyViewerKeys({
    ui,
    dispatch,
    canvasRef,
    setHelpOpen,
  });

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
    ? selectedStructureLabelText({
        label: selectedStructure.label,
        maskNames,
        revealed: revealedIds.has(selectedStructure.id),
      })
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
        spacing={1.5}
        useFlexGap
        sx={{
          alignItems: "center",
          flexWrap: "wrap",
          flexShrink: 0,
          mb: 1,
          minHeight: 36
        }}>
        <Link
          href={anatomyHubHref()}
          underline="hover"
          variant="body2"
          onClick={(ev: MouseEvent<HTMLAnchorElement>) => {
            if (!isPlainClick(ev)) return;
            ev.preventDefault();
            navigate(anatomyHubHref());
          }}
          sx={{
            color: "text.secondary"
          }}
        >
          Anatomy
        </Link>
        <Typography variant="body2" aria-hidden sx={{
          color: "text.secondary"
        }}>
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
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
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
          sx={{
            alignItems: "stretch",
            flex: 1,
            minHeight: 0
          }}>
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
              spacing={0.25}
              useFlexGap
              sx={{
                alignItems: "center",
                flexWrap: "wrap",
                flexShrink: 0,
                px: 0.75,
                py: 0.35,
                borderBottom: 1,
                borderColor: "divider",
                bgcolor: "action.hover"
              }}>
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
                    sx={{
                      color: "text.secondary",
                      px: 0.5,
                      userSelect: "none"
                    }}>
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
                onSelectClip={(clip) => selectClip(clip, false)}
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
                spacing={0.5}
                sx={{
                  alignItems: "center",
                  px: 1.5,
                  py: 0.75
                }}>
                <Typography variant="caption" sx={{
                  color: "text.secondary"
                }}>
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
                <Typography
                  sx={{
                    color: "text.secondary",
                    py: 6,
                    px: 2
                  }}>
                  Enable a region to load 3D models.
                </Typography>
              ) : (
                <AnatomyCanvas
                  ref={canvasRef}
                  loads={loads}
                  ui={ui}
                  background={canvasBackground}
                  autoRotate={autoRotate}
                  wireframe={wireframe}
                  fadeOthers={fadeOthers}
                  clipEnabled={clipEnabled}
                  clipDepth01={clipDepth01}
                  selectedLabelText={selectedLabel}
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
        <Typography sx={{
          color: "text.secondary"
        }}>Loading scene…</Typography>
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
