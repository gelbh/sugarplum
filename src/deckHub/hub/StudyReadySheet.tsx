import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { navigate } from "../../shared/nav/navigate";

export type StudyReadySummary = {
  due: number;
  accepted: number;
  introRemaining?: number;
};

type Props = {
  deckId: string;
  acceptedCount: number;
  summary: StudyReadySummary | null;
  loading?: boolean;
  error?: string | null;
};

export default function StudyReadySheet({
  deckId,
  acceptedCount,
  summary,
  loading = false,
  error = null,
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
  const introRemaining = summary?.introRemaining ?? null;

  return (
    <Stack spacing={2}>
      <Typography variant="body2" sx={{
        color: "text.secondary"
      }}>
        Ready when you are. Start study opens the existing session for this
        deck.
      </Typography>
      {error ? <Alert severity="error">{error}</Alert> : null}
      <Stack direction="row" spacing={1} useFlexGap sx={{
        flexWrap: "wrap"
      }}>
        {due !== null ? (
          <Chip label={`${due} due`} color={due > 0 ? "primary" : "default"} />
        ) : null}
        {introRemaining !== null ? (
          <Chip
            label={`${introRemaining} intro left`}
            variant="outlined"
          />
        ) : null}
        <Chip label={`${accepted} accepted`} variant="outlined" />
        {loading || (summary === null && !error) ? (
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
