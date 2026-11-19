import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { AnatomyStructure } from "./types";

type Props = {
  structure: AnatomyStructure | null;
};

export default function InfoPanel({ structure }: Props) {
  if (!structure) return null;

  const summary = structure.info?.summary?.trim() || null;
  const synonyms =
    structure.info?.alsoKnownAs?.filter((s) => s.trim().length > 0) ?? [];

  return (
    <Box
      component="aside"
      aria-label="Structure info"
      sx={{
        width: "100%",
        flexShrink: 0,
        borderRadius: 1,
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        p: 1.25,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <Typography
        variant="subtitle2"
        component="h2"
        sx={{ fontWeight: 600, letterSpacing: "-0.01em" }}
      >
        {structure.label}
      </Typography>
      {summary ? (
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          {summary}
        </Typography>
      ) : (
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          No summary yet for this structure.
        </Typography>
      )}
      {synonyms.length > 0 ? (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{
          flexWrap: "wrap"
        }}>
          {synonyms.map((name) => (
            <Chip key={name} label={name} size="small" variant="outlined" />
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}
