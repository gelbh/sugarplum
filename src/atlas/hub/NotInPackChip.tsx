import Chip from "@mui/material/Chip";

/** Dims a shown pack-hidden entry; the chip and pin control stay full contrast. */
export const NOT_IN_PACK_DIM = { opacity: 0.6 } as const;

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
