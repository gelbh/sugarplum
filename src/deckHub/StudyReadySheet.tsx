import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { navigate } from "../nav/navigate";

export type StudyReadySummary = {
  due: number;
  accepted: number;
  newCards?: number;
};

type Props = {
  deckId: string;
  acceptedCount: number;
  summary: StudyReadySummary | null;
  loading?: boolean;
};

export default function StudyReadySheet({
  deckId,
  acceptedCount,
  summary,
  loading = false,
}: Props) {
  if (acceptedCount === 0) {
    return (
      <Alert severity="info">
        Accept some cards first, then study opens from here.
      </Alert>
    );
  }

  const due = summary?.due ?? null;
  const accepted = summary?.accepted ?? acceptedCount;
  const newCards = summary?.newCards ?? null;

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Ready when you are. Start study opens the existing session for this
        deck.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {due !== null ? (
          <Chip label={`${due} due`} color={due > 0 ? "primary" : "default"} />
        ) : null}
        {newCards !== null ? (
          <Chip label={`${newCards} new`} variant="outlined" />
        ) : null}
        <Chip label={`${accepted} accepted`} variant="outlined" />
        {loading || summary === null ? (
          <Chip label="Loading counts…" variant="outlined" />
        ) : null}
      </Stack>
      <Button
        variant="contained"
        onClick={() => navigate(`/study?deckId=${encodeURIComponent(deckId)}`)}
      >
        Start study
      </Button>
    </Stack>
  );
}
