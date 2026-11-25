import Box from "@mui/material/Box";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import SlideshowOutlinedIcon from "@mui/icons-material/SlideshowOutlined";
import TextSnippetOutlinedIcon from "@mui/icons-material/TextSnippetOutlined";
import type { MaterialListItem } from "../../api/client";
import { mediaUrl } from "../../api/client";

export function KindGlyph({ kind, size = 36 }: { kind: string; size?: number }) {
  const sx = { fontSize: size, color: "rgba(232, 216, 199, 0.55)" } as const;
  if (kind === "pdf") return <PictureAsPdfOutlinedIcon sx={sx} />;
  if (kind === "pptx") return <SlideshowOutlinedIcon sx={sx} />;
  if (kind === "text" || kind === "paste" || kind === "topic") {
    return <TextSnippetOutlinedIcon sx={sx} />;
  }
  return <InsertDriveFileOutlinedIcon sx={sx} />;
}

export function MaterialThumb({
  material,
  height = 120,
}: {
  material: MaterialListItem;
  height?: number;
}) {
  if (material.kind === "image" && material.r2_key) {
    return (
      <Box
        component="img"
        src={mediaUrl(material.r2_key)}
        alt=""
        loading="lazy"
        sx={{
          width: "100%",
          height,
          objectFit: "cover",
          display: "block",
          bgcolor: "rgba(0,0,0,0.35)",
        }}
      />
    );
  }
  return (
    <Box
      sx={{
        width: "100%",
        height,
        display: "grid",
        placeItems: "center",
        bgcolor: "rgba(91, 44, 111, 0.14)",
      }}
    >
      <KindGlyph kind={material.kind} size={42} />
    </Box>
  );
}
