import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import type { CoverFields, CoverOwnerKind, StoredCoverRow } from "../../api/client";
import { setCover } from "../../api/client";
import CoverUploadTile, { coverCellSx } from "./CoverUploadTile";
import type { ChangeEvent } from "react";

type Props = {
  fillHeight: boolean;
  busy: boolean;
  searching: boolean;
  uploading: boolean;
  photos: CoverFields[];
  pickingId: string | null;
  ownerKind: CoverOwnerKind;
  ownerId: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  run: (action: () => void | Promise<void>) => void;
  setPickingId: (id: string | null) => void;
  onSaved: (row: StoredCoverRow) => void;
};

export default function CoverPosterGrid({
  fillHeight,
  busy,
  searching,
  uploading,
  photos,
  pickingId,
  ownerKind,
  ownerId,
  onFileChange,
  run,
  setPickingId,
  onSaved,
}: Props) {
  const photoTiles = searching
    ? [0, 1, 2, 3, 4].map((key) => (
        <Skeleton
          key={key}
          variant="rounded"
          sx={{
            ...coverCellSx(fillHeight),
            width: "100%",
            bgcolor: "rgba(91, 44, 111, 0.18)",
          }}
        />
      ))
    : photos.slice(0, 5).map((photo) => {
        const picking = pickingId === photo.photoId;
        return (
          <ButtonBase
            key={photo.photoId}
            focusRipple
            disabled={busy}
            aria-label={`Photo by ${photo.photographerName}`}
            onClick={() => {
              setPickingId(photo.photoId);
              run(async () => {
                try {
                  const row = await setCover(
                    ownerKind,
                    ownerId,
                    photo.photoId,
                  );
                  onSaved(row);
                } finally {
                  setPickingId(null);
                }
              });
            }}
            sx={{
              ...coverCellSx(fillHeight),
              border: 1,
              borderColor: "rgba(232, 216, 199, 0.16)",
              bgcolor: "#1a0b18",
              boxShadow: fillHeight
                ? "0 6px 18px rgba(0,0,0,0.28)"
                : "0 10px 28px rgba(0,0,0,0.28)",
              opacity: pickingId && !picking ? 0.45 : 1,
              transition:
                "transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease",
              "@media (prefers-reduced-motion: reduce)": {
                transition: "none",
              },
              "&:hover, &:focus-visible": {
                transform: busy ? "none" : "translateY(-1px) scale(1.015)",
                boxShadow: "0 12px 28px rgba(0,0,0,0.4)",
                zIndex: 1,
              },
            }}
          >
            <Box
              component="img"
              src={photo.imageUrl}
              alt=""
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            <Box
              aria-hidden
              sx={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, transparent 50%, rgba(15, 5, 14, 0.9) 100%)",
                pointerEvents: "none",
              }}
            />
            <Typography
              variant="caption"
              sx={{
                position: "absolute",
                left: 8,
                right: 8,
                bottom: 8,
                zIndex: 1,
                color: "rgba(245,245,245,0.78)",
                textAlign: "left",
                lineHeight: 1.25,
                fontSize: "0.6875rem",
              }}
            >
              {picking ? "Saving…" : photo.photographerName}
            </Typography>
          </ButtonBase>
        );
      });

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: "repeat(3, minmax(0, 1fr))",
        },
        ...(fillHeight
          ? {
              gridTemplateRows: {
                xs: "repeat(3, minmax(0, 1fr))",
                sm: "repeat(2, minmax(0, 1fr))",
              },
              flex: 1,
              minHeight: 0,
              height: "100%",
            }
          : {}),
        gap: fillHeight ? 1 : { xs: 1.25, sm: 1.5 },
      }}
    >
      <CoverUploadTile
        fillHeight={fillHeight}
        busy={busy}
        uploading={uploading}
        onFileChange={onFileChange}
      />
      {photoTiles}
    </Box>
  );
}
