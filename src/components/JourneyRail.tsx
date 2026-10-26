import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CollectionsBookmarkIcon from "@mui/icons-material/CollectionsBookmark";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import RateReviewIcon from "@mui/icons-material/RateReview";
import SchoolIcon from "@mui/icons-material/School";
import type { SvgIconComponent } from "@mui/icons-material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import type { JourneyView, JourneyStageId } from "../journey/types";

type Props = {
  view: JourneyView;
};

const STAGE_ICON: Record<JourneyStageId, SvgIconComponent> = {
  deck: CollectionsBookmarkIcon,
  material: NoteAddIcon,
  review: RateReviewIcon,
  study: SchoolIcon,
};

const STAGE_SHORT_LABEL: Record<JourneyStageId, string> = {
  deck: "Deck",
  material: "Mat",
  review: "Rev",
  study: "Study",
};

function stageIcon(s: JourneyView["stages"][number]) {
  const Icon = STAGE_ICON[s.id];
  if (s.done) {
    return <CheckCircleIcon color="success" fontSize="small" />;
  }
  return <Icon color={s.active ? "primary" : "inherit"} fontSize="small" />;
}

export default function JourneyRail({ view }: Props) {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));

  if (view.collapsed) return null;

  if (isXs) {
    return (
      <Paper elevation={1} sx={{ width: "100%", p: 1.5 }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          useFlexGap
          flexWrap="wrap"
        >
          {view.stages.map((s) => (
            <Stack
              key={s.id}
              alignItems="center"
              spacing={0.25}
              aria-label={s.label}
              sx={{ minWidth: 0, flex: "1 1 auto" }}
            >
              {stageIcon(s)}
              <Typography
                variant="caption"
                color={s.done ? "textPrimary" : s.active ? "textPrimary" : "text.secondary"}
                noWrap
              >
                {STAGE_SHORT_LABEL[s.id]}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper elevation={1} sx={{ width: 280, p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6">Journey</Typography>
        <List>
          {view.stages.map((s) => {
            const Icon = STAGE_ICON[s.id];
            return (
              <ListItem key={s.id} disableGutters>
                <ListItemIcon>
                  {s.done ? (
                    <CheckCircleIcon color="success" />
                  ) : (
                    <Icon color={s.active ? "primary" : "inherit"} />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={s.label}
                  primaryTypographyProps={{
                    color: s.done ? undefined : s.active ? "textPrimary" : "text.secondary",
                  }}
                />
              </ListItem>
            );
          })}
        </List>
      </Stack>
    </Paper>
  );
}
