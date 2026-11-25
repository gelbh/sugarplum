import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import type { ChangeEvent } from "react";

export function coverCellSx(fillHeight: boolean) {
  return {
    position: "relative" as const,
    ...(fillHeight
      ? { minHeight: 0, height: "100%" }
      : { aspectRatio: "3 / 4" }),
    borderRadius: 1.5,
    overflow: "hidden" as const,
  };
}

type Props = {
  fillHeight: boolean;
  busy: boolean;
  uploading: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export default function CoverUploadTile({
  fillHeight,
  busy,
  uploading,
  onFileChange,
}: Props) {
  return (
    <ButtonBase
      component="label"
      focusRipple
      disabled={busy}
      aria-label={uploading ? "Uploading cover" : "Upload your own cover"}
      sx={{
        ...coverCellSx(fillHeight),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.75,
        px: 1,
        border: "1px dashed",
        borderColor: "rgba(91, 44, 111, 0.55)",
        bgcolor: "rgba(91, 44, 111, 0.14)",
        boxShadow: "none",
        transition: "transform 180ms ease, border-color 180ms ease",
        "@media (prefers-reduced-motion: reduce)": {
          transition: "none",
        },
        "&:hover, &:focus-visible": {
          transform: busy ? "none" : "translateY(-1px) scale(1.015)",
          borderColor: "primary.main",
          zIndex: 1,
        },
      }}
    >
      <Typography
        component="span"
        sx={{
          fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
          fontSize: "1.75rem",
          lineHeight: 1,
          color: "primary.light",
        }}
      >
        +
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: "primary.light",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textAlign: "center",
          lineHeight: 1.25,
        }}
      >
        {uploading ? "Uploading…" : "Upload your own"}
      </Typography>
      <input
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileChange}
      />
    </ButtonBase>
  );
}
