import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import AnatomyClipBar from "./AnatomyClipBar";
import InfoPanel from "./InfoPanel";
import StructurePanel from "./StructurePanel";
import TestYourself, { type AnatomyStudyMode } from "./TestYourself";
import type { AnatomyClip, AnatomyRegion, AnatomyStructure } from "./types";
import type { StructureUiAction, StructureUiState } from "./structureState";

export type AnatomySheetTab = "structures" | "study" | "clips";

export type AnatomyMobileSheetProps = {
  open: boolean;
  onClose: () => void;
  tab: AnatomySheetTab;
  onTabChange: (tab: AnatomySheetTab) => void;
  /** Portal target so the sheet stays visible during stage fullscreen. */
  container?: HTMLElement | null;
  structures: AnatomyStructure[];
  regions?: AnatomyRegion[];
  activeRegions: Set<string>;
  onChangeRegions: (regionIds: string[]) => void;
  ui: StructureUiState;
  dispatch: (action: StructureUiAction) => void;
  maskNames?: boolean;
  revealedIds?: ReadonlySet<string>;
  studyMode: AnatomyStudyMode;
  onStudyModeChange: (mode: AnatomyStudyMode) => void;
  selectedStructure: AnatomyStructure | null;
  regionStructures: AnatomyStructure[];
  onCorrect: (structureId: string) => void;
  clips?: AnatomyClip[];
  clipsDisabled?: boolean;
  activeClipId?: string | null;
  clipPaused?: boolean;
  clipError?: string | null;
  onSelectClip?: (clip: AnatomyClip) => void;
  onTogglePauseClip?: () => void;
};

export default function AnatomyMobileSheet({
  open,
  onClose,
  tab,
  onTabChange,
  container = null,
  structures,
  regions,
  activeRegions,
  onChangeRegions,
  ui,
  dispatch,
  maskNames,
  revealedIds,
  studyMode,
  onStudyModeChange,
  selectedStructure,
  regionStructures,
  onCorrect,
  clips = [],
  clipsDisabled = false,
  activeClipId = null,
  clipPaused = false,
  clipError = null,
  onSelectClip,
  onTogglePauseClip,
}: AnatomyMobileSheetProps) {
  const titleId = "anatomy-mobile-sheet-title";
  const hasClips = clips.length > 0;
  const title =
    tab === "structures" ? "Structures" : tab === "study" ? "Study" : "Clips";
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      aria-labelledby={titleId}
      ModalProps={{
        container: container ?? undefined,
      }}
      slotProps={{
        paper: {
          sx: {
            maxHeight: "min(70dvh, 560px)",
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            pb: "env(safe-area-inset-bottom)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          },
        },
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        sx={{ px: 1.5, pt: 1, flexShrink: 0 }}
      >
        <Typography
          id={titleId}
          variant="subtitle2"
          sx={{ fontWeight: 600, flex: 1 }}
        >
          {title}
        </Typography>
        <IconButton size="small" aria-label="Done" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Tabs
        value={tab}
        onChange={(_, next: AnatomySheetTab) => onTabChange(next)}
        sx={{ px: 1, flexShrink: 0 }}
      >
        <Tab value="structures" label="Structures" />
        <Tab value="study" label="Study" />
        {hasClips ? <Tab value="clips" label="Clips" /> : null}
      </Tabs>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", px: 1.5, pb: 1.5 }}>
        {tab === "structures" ? (
          <StructurePanel
            structures={structures}
            regions={regions}
            activeRegions={activeRegions}
            onChangeRegions={onChangeRegions}
            ui={ui}
            dispatch={dispatch}
            maskNames={maskNames}
            revealedIds={revealedIds}
          />
        ) : tab === "study" ? (
          <Stack spacing={1.25}>
            <TestYourself
              mode={studyMode}
              onModeChange={onStudyModeChange}
              structure={selectedStructure}
              regionStructures={regionStructures}
              revealedIds={revealedIds ?? new Set()}
              onCorrect={onCorrect}
            />
            {studyMode === "explore" ? (
              <InfoPanel structure={selectedStructure} />
            ) : null}
          </Stack>
        ) : hasClips && onSelectClip && onTogglePauseClip ? (
          <AnatomyClipBar
            clips={clips}
            disabled={clipsDisabled}
            activeClipId={activeClipId}
            clipPaused={clipPaused}
            clipError={clipError}
            onSelectClip={onSelectClip}
            onTogglePause={onTogglePauseClip}
            embedded
          />
        ) : null}
      </Box>
    </Drawer>
  );
}
