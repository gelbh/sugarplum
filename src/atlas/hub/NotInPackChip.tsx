import Chip from "@mui/material/Chip";

export default function NotInPackChip() {
  return (
    <Chip
      component="span"
      label="Not in your pack"
      size="small"
      variant="outlined"
      sx={{
        height: 22,
        bgcolor: "background.paper",
        "& .MuiChip-label": { px: 0.75 },
      }}
    />
  );
}
