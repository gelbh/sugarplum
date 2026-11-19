import PauseOutlinedIcon from "@mui/icons-material/PauseOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type Props = {
  activeClipId: string | null;
  activeLabel: string | null;
  clipPaused: boolean;
  clipError: string | null;
  disabled: boolean;
  onTogglePause: () => void;
};

export default function AnatomyClipHud({
  activeClipId,
  activeLabel,
  clipPaused,
  clipError,
  disabled,
  onTogglePause,
}: Props) {
  if (!activeClipId) return null;
  return (
    <Paper
      elevation={3}
      sx={{
        position: "absolute",
        right: 8,
        bottom: 8,
        zIndex: 1,
        px: 1,
        py: 0.5,
      }}
    >
      <Stack direction="row" spacing={0.5} sx={{
        alignItems: "center"
      }}>
        <Typography
          variant="caption"
          sx={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {activeLabel ?? activeClipId}
        </Typography>
        <IconButton
          size="small"
          disabled={disabled}
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
    </Paper>
  );
}
