import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import type { AtlasEntryView, AtlasImageView } from "./types";

export function heroImage(entry: AtlasEntryView): AtlasImageView | null {
  return entry.images.find((i) => i.isHero) ?? entry.images[0] ?? null;
}

type Props = {
  image: AtlasImageView | null;
  ratio?: string;
  compact?: boolean;
  sx?: SxProps<Theme>;
};

export default function AtlasImage({ image, ratio, compact, sx }: Props) {
  return (
    <Box
      sx={[
        (theme) => ({
          position: "relative",
          aspectRatio: ratio,
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          backgroundImage: `repeating-linear-gradient(135deg, ${alpha(
            theme.palette.primary.main,
            0.05,
          )} 0 8px, ${alpha(theme.palette.primary.main, 0.1)} 8px 16px)`,
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {image ? (
        <Box
          component="img"
          src={image.src}
          alt={image.caption ?? ""}
          loading="lazy"
          decoding="async"
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : compact ? null : (
        <Box
          component="span"
          sx={{ fontSize: "0.78rem", color: "text.secondary", px: 1 }}
        >
          No image yet
        </Box>
      )}
    </Box>
  );
}
