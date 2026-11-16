import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import type { WorkshopId } from "./workshopStack";

export type MissionTileId = Extract<
  WorkshopId,
  "addMaterial" | "drafts" | "cards" | "study"
>;

const TILE_IMAGES: Record<MissionTileId, string> = {
  addMaterial: "/atlas/sites/muscle.webp",
  drafts: "/achievements/fruits/pineapple.svg",
  cards: "/achievements/fruits/orange.svg",
  study: "/achievements/fruits/strawberry.svg",
};

type Tile = {
  id: MissionTileId;
  title: string;
  blurb: string;
  badge?: string | null;
  muted?: boolean;
  accent?: boolean;
};

type Props = {
  draftCount: number;
  cardCount: number;
  acceptedCount: number;
  emptyDeck: boolean;
  onOpen: (id: MissionTileId) => void;
};

export default function MissionBoard({
  draftCount,
  cardCount,
  acceptedCount,
  emptyDeck,
  onOpen,
}: Props) {
  const tiles: Tile[] = [
    {
      id: "addMaterial",
      title: "Add material",
      blurb: "Upload, paste, topic, or DIY",
      accent: emptyDeck,
    },
    {
      id: "drafts",
      title: "Review drafts",
      blurb: "Accept, edit, or skip generated cards",
      badge: draftCount > 0 ? String(draftCount) : null,
    },
    {
      id: "cards",
      title: "Browse cards",
      blurb: "Select, edit, move, or create",
      badge: cardCount > 0 ? String(cardCount) : null,
    },
    {
      id: "study",
      title: "Study",
      blurb:
        acceptedCount > 0
          ? "See what is due, then start"
          : "Accept cards first",
      muted: acceptedCount === 0,
    },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr" },
        gridTemplateRows: { xs: "1fr 1fr", sm: "1fr 1fr" },
        gap: { xs: 1.5, sm: 2 },
        flex: 1,
        minHeight: { xs: 320, sm: "min(52dvh, 480px)" },
        alignContent: "stretch",
      }}
      role="list"
      aria-label="Deck hub jobs"
    >
      {tiles.map((tile) => {
        const imageSrc = TILE_IMAGES[tile.id];
        const isSvg = imageSrc.endsWith(".svg");
        return (
          <ButtonBase
            key={tile.id}
            role="listitem"
            focusRipple
            disabled={tile.muted}
            onClick={() => onOpen(tile.id)}
            data-tile-id={tile.id}
            aria-label={
              tile.badge
                ? `${tile.title}, ${tile.badge}`
                : tile.muted
                  ? `${tile.title} (unavailable)`
                  : tile.title
            }
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.25,
              textAlign: "center",
              p: { xs: 2, sm: 2.5 },
              borderRadius: 2,
              border: 1,
              borderColor: tile.accent ? "primary.main" : "divider",
              bgcolor: "background.paper",
              opacity: tile.muted ? 0.55 : 1,
              minHeight: 0,
              height: "100%",
              transition: "border-color 160ms ease",
              "&:hover": tile.muted
                ? undefined
                : {
                    borderColor: "primary.main",
                    bgcolor: "action.hover",
                  },
              "&.Mui-disabled": {
                opacity: 0.55,
              },
            }}
          >
            <Box
              aria-hidden
              sx={(theme) => ({
                width: { xs: 64, sm: 80 },
                height: { xs: 64, sm: 80 },
                borderRadius: 2,
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                display: "grid",
                placeItems: "center",
                overflow: "hidden",
                flexShrink: 0,
              })}
            >
              <Box
                component="img"
                src={imageSrc}
                alt=""
                sx={{
                  width: isSvg ? "62%" : "100%",
                  height: isSvg ? "62%" : "100%",
                  objectFit: isSvg ? "contain" : "cover",
                }}
              />
            </Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 600,
                  color: tile.accent ? "primary.main" : "text.primary",
                }}
              >
                {tile.title}
              </Typography>
              {tile.badge ? (
                <Chip size="small" label={tile.badge} color="primary" />
              ) : null}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {tile.blurb}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
