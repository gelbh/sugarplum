import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { learningSoftWaitFollowUpCopy } from "./learningSoftWaitCopy";
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
        {learningSoftWaitFollowUpCopy(props.pendingCount)}
      </Typography>
      <Button variant="contained" onClick={props.onToday}>
        Today
      </Button>
    </Stack>
  );
}
