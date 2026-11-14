import PauseOutlinedIcon from "@mui/icons-material/PauseOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { AnatomyClip } from "./types";

type Props = {
  clips: AnatomyClip[];
  disabled: boolean;
  activeClipId: string | null;
  clipPaused: boolean;
  clipError: string | null;
  onSelectClip: (clip: AnatomyClip) => void;
  onTogglePause: () => void;
  embedded?: boolean;
};

export default function AnatomyClipBar({
  clips,
  disabled,
  activeClipId,
  clipPaused,
  clipError,
  onSelectClip,
  onTogglePause,
  embedded = false,
}: Props) {
  if (clips.length === 0) return null;
  return (
    <Stack
      direction="row"
      alignItems="center"
      flexWrap="wrap"
      useFlexGap
      spacing={0.75}
      sx={{
        flexShrink: 0,
        px: embedded ? 0 : 1,
        py: embedded ? 0 : 0.5,
        ...(embedded
          ? {}
          : { borderBottom: 1, borderColor: "divider" }),
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ userSelect: "none" }}
      >
        Clips
      </Typography>
      {clips.map((clip) => (
        <Chip
          key={clip.id}
          size="small"
          label={clip.label}
          color={activeClipId === clip.id ? "primary" : "default"}
          variant={activeClipId === clip.id ? "filled" : "outlined"}
          disabled={disabled}
          onClick={() => onSelectClip(clip)}
        />
      ))}
      <IconButton
        size="small"
        disabled={disabled || !activeClipId}
        aria-label={clipPaused ? "Resume clip" : "Pause clip"}
        onClick={onTogglePause}
      >
        {clipPaused ? (
          <PlayArrowOutlinedIcon fontSize="small" />
        ) : (
          <PauseOutlinedIcon fontSize="small" />
        )}
      </IconButton>
      {clipError ? (
        <Typography variant="caption" color="error">
          {clipError}
        </Typography>
      ) : null}
    </Stack>
  );
}
