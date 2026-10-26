import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CollectionsBookmarkIcon from "@mui/icons-material/CollectionsBookmark";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import RateReviewIcon from "@mui/icons-material/RateReview";
import SchoolIcon from "@mui/icons-material/School";
import type { JourneyView, JourneyStageId } from "./types";
import JourneyNextButton from "./JourneyNextButton";
import Typography from "@mui/material/Typography";

type Props = {
  view: JourneyView;
};

const STAGE_ICON: Record<JourneyStageId, any> = {
  deck: CollectionsBookmarkIcon,
  material: NoteAddIcon,
  review: RateReviewIcon,
  study: SchoolIcon,
};

export default function JourneyRail({ view }: Props) {
  if (view.collapsed) return null;

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
                  {s.done ? <CheckCircleIcon color="success" /> : <Icon color={s.active ? "primary" : "inherit"} />}
                </ListItemIcon>
                <ListItemText primary={s.label} />
              </ListItem>
            );
          })}
        </List>

        <Box>
          <JourneyNextButton next={view.next} />
        </Box>
      </Stack>
    </Paper>
  );
}

