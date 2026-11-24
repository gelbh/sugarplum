import type { SvgIconComponent } from "@mui/icons-material";
import CollectionsBookmarkOutlinedIcon from "@mui/icons-material/CollectionsBookmarkOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import NoteAddOutlinedIcon from "@mui/icons-material/NoteAddOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
export type MissionTileId =
  "addMaterial" | "drafts" | "cards" | "materials" | "study";

type BoardTileId = Exclude<MissionTileId, "study">;

const TILE_ICONS: Record<BoardTileId, SvgIconComponent> = {
  addMaterial: NoteAddOutlinedIcon,
  drafts: RateReviewOutlinedIcon,
  cards: CollectionsBookmarkOutlinedIcon,
  materials: FolderOpenOutlinedIcon,
};

type Tile = {
  id: BoardTileId;
  title: string;
  blurb: string;
  badge?: string | null;
  accent?: boolean;
};

type Props = {
  draftCount: number;
  cardCount: number;
  materialCount: number;
  emptyDeck: boolean;
  onOpen: (id: MissionTileId) => void;
};

export default function MissionBoard({
  draftCount,
  cardCount,
  materialCount,
  emptyDeck,
  onOpen,
}: Props) {
  const tiles: Tile[] = [
    {
      id: "addMaterial",
      title: "Create flashcards",
      blurb: "Upload, paste, or create a card",
      accent: emptyDeck,
    },
    ...(draftCount > 0
      ? [
          {
            id: "drafts" as const,
            title: "Review drafts",
            blurb: "Accept, edit, or skip",
            badge: String(draftCount),
          },
        ]
      : []),
    ...(cardCount > 0
      ? [
          {
            id: "cards" as const,
            title: "Browse cards",
            blurb: "Select, edit, move, or create",
            badge: String(cardCount),
          },
        ]
      : []),
    ...(materialCount > 0
      ? [
          {
            id: "materials" as const,
            title: "Browse files",
            blurb: "Download or remove uploads",
            badge: String(materialCount),
          },
        ]
      : []),
  ];

  return (
    <Box
      className="board-grid"
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 200px))",
        gap: { xs: 1.5, sm: 2 },
        justifyContent: "center",
        alignContent: "center",
        flex: 1,
        width: "100%",
        minHeight: 0,
        maxWidth: 720,
        mx: "auto",
      }}
      role="list"
      aria-label="Deck hub jobs"
    >
      {tiles.map((tile, index) => {
        const Icon = TILE_ICONS[tile.id];
        return (
          <ButtonBase
            key={tile.id}
            role="listitem"
            focusRipple
            onClick={() => onOpen(tile.id)}
            data-tile-id={tile.id}
            aria-label={
              tile.badge ? `${tile.title}, ${tile.badge}` : tile.title
            }
            sx={{
              position: "relative",
              aspectRatio: "3 / 4",
              borderRadius: 2,
              overflow: "hidden",
              border: 1,
              borderColor: tile.accent
                ? "primary.main"
                : "rgba(232, 216, 199, 0.16)",
              bgcolor: "#12070f",
              textAlign: "left",
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              animation: `boardPosterIn 420ms ease both`,
              animationDelay: `${index * 40}ms`,
              "@keyframes boardPosterIn": {
                from: { opacity: 0, transform: "translateY(10px)" },
                to: { opacity: 1, transform: "translateY(0)" },
              },
              ".board-grid:hover &": { opacity: 0.55 },
              ".board-grid:hover &:hover, .board-grid:hover &:focus-visible": {
                opacity: 1,
                transform: "scale(1.03)",
                zIndex: 2,
                boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
              },
              "@media (prefers-reduced-motion: reduce)": {
                animation: "none",
                ".board-grid:hover &": { opacity: 1 },
                ".board-grid:hover &:hover, .board-grid:hover &:focus-visible":
                  {
                    transform: "none",
                    boxShadow: "none",
                  },
              },
            }}
          >
            <Box
              aria-hidden
              sx={{
                position: "absolute",
                inset: 0,
                background: tile.accent
                  ? "radial-gradient(ellipse at 50% 32%, rgba(91, 44, 111, 0.55) 0%, rgba(26, 11, 24, 0.94) 62%, #12070f 100%)"
                  : "radial-gradient(ellipse at 50% 28%, rgba(91, 44, 111, 0.28) 0%, rgba(26, 11, 24, 0.92) 58%, #12070f 100%)",
              }}
            />
            <Box
              sx={{
                position: "relative",
                flex: 1,
                display: "grid",
                placeItems: "center",
                pt: 1,
              }}
            >
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  border: "1px solid",
                  borderColor: tile.accent
                    ? "rgba(209, 163, 226, 0.45)"
                    : "rgba(232, 216, 199, 0.22)",
                  bgcolor: tile.accent
                    ? "rgba(91, 44, 111, 0.42)"
                    : "rgba(91, 44, 111, 0.22)",
                  boxShadow: tile.accent
                    ? "0 0 0 8px rgba(91, 44, 111, 0.14)"
                    : "0 0 0 8px rgba(91, 44, 111, 0.08)",
                  display: "grid",
                  placeItems: "center",
                  color: tile.accent
                    ? "primary.light"
                    : "rgba(245,245,245,0.88)",
                }}
              >
                <Icon sx={{ fontSize: 28 }} />
              </Box>
            </Box>
            <Box
              sx={{
                position: "relative",
                px: 1.5,
                pb: 1.5,
                pt: 0.5,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  mb: 0.5,
                }}
              >
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 700,
                    color: tile.accent ? "primary.light" : "#F5F5F5",
                    lineHeight: 1.2,
                  }}
                >
                  {tile.title}
                </Typography>
                {tile.badge ? (
                  <Chip
                    size="small"
                    label={tile.badge}
                    color="primary"
                    sx={{ height: 22 }}
                  />
                ) : null}
              </Box>
              <Typography
                variant="caption"
                sx={{
                  color: "rgba(245,245,245,0.68)",
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {tile.blurb}
              </Typography>
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
