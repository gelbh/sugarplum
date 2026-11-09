import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { formatLearningEta } from "./useLearningRequeue";

export type LearningSoftWaitProps = {
  pendingCount: number;
  nextDueAt: string | null;
  onToday: () => void;
};

export default function LearningSoftWait(props: LearningSoftWaitProps) {
  return (
    <Stack spacing={1.5} alignItems="stretch">
      <Typography variant="body1" sx={{ textAlign: "center" }}>
        Next learning card in{" "}
        {props.nextDueAt ? formatLearningEta(props.nextDueAt) : "a moment"}.
      </Typography>
      <Typography variant="body2" sx={{ textAlign: "center", opacity: 0.8 }}>
        {props.pendingCount} learning{" "}
        {props.pendingCount === 1 ? "card" : "cards"} coming back.
      </Typography>
      <Button variant="contained" onClick={props.onToday}>
        Today
      </Button>
    </Stack>
  );
}
