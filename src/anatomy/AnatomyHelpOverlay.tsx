import CloseIcon from "@mui/icons-material/Close";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type Props = {
  open: boolean;
  onClose: () => void;
  touch?: boolean;
};

const DESKTOP_ROWS: { keys: string; action: string }[] = [
  { keys: "Drag", action: "Orbit" },
  { keys: "Scroll / Ctrl+drag", action: "Zoom" },
  { keys: "Right-drag", action: "Pan" },
  { keys: "H", action: "Hide selected" },
  { keys: "I", action: "Isolate selected" },
  { keys: "R", action: "Reset view" },
  { keys: "Click", action: "Select structure" },
];

const TOUCH_ROWS: { keys: string; action: string }[] = [
  { keys: "One-finger drag", action: "Orbit" },
  { keys: "Pinch", action: "Zoom" },
  { keys: "Two-finger drag", action: "Pan" },
  { keys: "Tap", action: "Select structure" },
];

export default function AnatomyHelpOverlay({
  open,
  onClose,
  touch = false,
}: Props) {
  if (!open) return null;
  const rows = touch ? TOUCH_ROWS : DESKTOP_ROWS;
  return (
    <Box
      role="dialog"
      aria-label="Anatomy controls help"
      sx={{
        position: "absolute",
        right: 12,
        bottom: 12,
        zIndex: 2,
        maxWidth: 280,
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        boxShadow: 3,
        p: 1.25,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 0.75 }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Controls
        </Typography>
        <IconButton
          size="small"
          aria-label="Close help"
          onClick={onClose}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Stack spacing={0.5}>
        {rows.map((row) => (
          <Stack
            key={row.keys}
            direction="row"
            justifyContent="space-between"
            spacing={1}
          >
            <Typography
              variant="caption"
              sx={{ fontFamily: "ui-monospace, monospace", flexShrink: 0 }}
            >
              {row.keys}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {row.action}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
