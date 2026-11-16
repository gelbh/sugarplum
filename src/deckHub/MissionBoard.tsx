import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import type { WorkshopId } from "./workshopStack";

export type MissionTileId = Extract<
  WorkshopId,
  "addMaterial" | "drafts" | "cards" | "study"
>;

const TILE_IMAGES: Record<MissionTileId, string> = {
  addMaterial: "/atlas/sites/muscle.webp",
  drafts: "/atlas/sites/liver.webp",
  cards: "/atlas/sites/lungs.webp",
  study: "/atlas/sites/eye.webp",
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
      className="board-grid"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr" },
        gap: { xs: 1.5, sm: 2 },
        alignContent: "start",
        maxWidth: 720,
      }}
      role="list"
      aria-label="Deck hub jobs"
    >
      {tiles.map((tile, index) => (
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
            position: "relative",
            aspectRatio: "3 / 4",
            borderRadius: 2,
            overflow: "hidden",
            border: 1,
            borderColor: tile.accent ? "primary.main" : "rgba(232, 216, 199, 0.16)",
            opacity: tile.muted ? 0.55 : 1,
            textAlign: "left",
            animation: `boardPosterIn 420ms ease both`,
            animationDelay: `${index * 40}ms`,
            "@keyframes boardPosterIn": {
              from: { opacity: 0, transform: "translateY(10px)" },
              to: {
                opacity: tile.muted ? 0.55 : 1,
                transform: "translateY(0)",
              },
            },
            ".board-grid:hover &": { opacity: tile.muted ? 0.4 : 0.55 },
            ".board-grid:hover &:hover, .board-grid:hover &:focus-visible": {
              opacity: 1,
              transform: "scale(1.03)",
              zIndex: 2,
              boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
            },
            "@media (prefers-reduced-motion: reduce)": {
              animation: "none",
              ".board-grid:hover &": { opacity: tile.muted ? 0.55 : 1 },
              ".board-grid:hover &:hover, .board-grid:hover &:focus-visible": {
                transform: "none",
                boxShadow: "none",
              },
            },
            "&.Mui-disabled": { opacity: 0.55 },
          }}
        >
          <Box
            component="img"
            src={TILE_IMAGES[tile.id]}
            alt=""
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, transparent 35%, rgba(15, 5, 14, 0.9) 100%)",
            }}
          />
          <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0, p: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  color: tile.accent ? "primary.light" : "#F5F5F5",
                }}
              >
                {tile.title}
              </Typography>
              {tile.badge ? (
                <Chip size="small" label={tile.badge} color="primary" sx={{ height: 22 }} />
              ) : null}
            </Box>
            <Typography variant="caption" sx={{ color: "rgba(245,245,245,0.72)" }}>
              {tile.blurb}
            </Typography>
          </Box>
        </ButtonBase>
      ))}
    </Box>
  );
}
