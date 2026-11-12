import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import type { AtlasEntryView, AtlasImageView } from "./types";

export function heroImage(entry: AtlasEntryView): AtlasImageView | null {
  return entry.images.find((i) => i.isHero) ?? null;
}

type Props = {
  image: AtlasImageView | null;
  ratio?: string;
  /** `cover` crops to fill (tiles). `contain` shows the full image. */
  fit?: "cover" | "contain";
  compact?: boolean;
  sx?: SxProps<Theme>;
};

export default function AtlasImage({
  image,
  ratio,
  fit = "cover",
  compact,
  sx,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [image?.src]);

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
        <>
          {image.placeholderSrc ? (
            <Box
              component="img"
              src={image.placeholderSrc}
              alt=""
              aria-hidden
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: fit,
                filter: "blur(12px)",
                transform: fit === "cover" ? "scale(1.08)" : "none",
                opacity: loaded ? 0 : 1,
                transition: "opacity 180ms ease",
              }}
            />
          ) : null}
          <Box
            component="img"
            src={image.src}
            alt={image.caption ?? ""}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: fit,
              objectPosition: "center",
              opacity: loaded || !image.placeholderSrc ? 1 : 0,
              transition: "opacity 180ms ease",
            }}
          />
        </>
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
