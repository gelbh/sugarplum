import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import StyleOutlinedIcon from "@mui/icons-material/StyleOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import type { WorkshopId } from "./workshopStack";

export type MissionTileId = Extract<
  WorkshopId,
  "addMaterial" | "drafts" | "cards" | "study"
>;

const TILE_ICONS = {
  addMaterial: AddCircleOutlineIcon,
  drafts: RateReviewOutlinedIcon,
  cards: StyleOutlinedIcon,
  study: TimerOutlinedIcon,
} as const;

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
        gap: { xs: 1.5, sm: 2 },
      }}
      role="list"
      aria-label="Deck mission board"
    >
      {tiles.map((tile) => {
        const Icon = TILE_ICONS[tile.id];
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
              display: "block",
              textAlign: "left",
              p: { xs: 2, sm: 2.5 },
              borderRadius: 2,
              border: 1,
              borderColor: tile.accent ? "primary.main" : "divider",
              bgcolor: "background.paper",
              opacity: tile.muted ? 0.55 : 1,
              transition: "border-color 160ms ease, box-shadow 160ms ease",
              "&:hover": tile.muted
                ? undefined
                : {
                    borderColor: "primary.main",
                    boxShadow: 1,
                  },
              "&.Mui-disabled": {
                opacity: 0.55,
              },
            }}
          >
            <Stack spacing={1} alignItems="flex-start">
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ width: "100%" }}
              >
                <Box
                  aria-hidden
                  sx={(theme) => ({
                    width: 28,
                    height: 28,
                    borderRadius: 1,
                    bgcolor: alpha(theme.palette.primary.main, 0.1),
                    color: "primary.main",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  })}
                >
                  <Icon sx={{ fontSize: 18 }} />
                </Box>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 600,
                    color: tile.accent ? "primary.main" : "text.primary",
                    flex: 1,
                  }}
                >
                  {tile.title}
                </Typography>
                {tile.badge ? (
                  <Chip size="small" label={tile.badge} color="primary" />
                ) : null}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {tile.blurb}
              </Typography>
            </Stack>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
