import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RateReviewIcon from "@mui/icons-material/RateReview";

type Props = {
  jobId: string | null;
  jobReused?: boolean;
  localOnly: boolean;
  setActiveStep: (n: number) => void;
};

export function CreateMaterialDoneStep({
  jobId,
  jobReused = false,
  localOnly,
  setActiveStep,
}: Props) {
  return (
    <Stack spacing={2}>
      <Typography variant="body1">
        {jobId
          ? jobReused
            ? "This file was already on the deck. Review prior drafts next."
            : "Generation started. Review drafts next."
          : localOnly
            ? "Done. Cards are ready to study."
            : "Done. Add more material or continue when ready."}
      </Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        {jobId ? (
          <Button
            variant="contained"
            color="primary"
            startIcon={<RateReviewIcon />}
            href={`/jobs/${encodeURIComponent(jobId)}/drafts`}
            aria-label="View drafts"
          >
            View drafts
          </Button>
        ) : (
          <Button
            variant="contained"
            color="primary"
            startIcon={<PlayArrowIcon />}
            href="/study"
            aria-label="Study"
          >
            Study
          </Button>
        )}
        <Button variant="outlined" onClick={() => setActiveStep(0)}>
          Add more
        </Button>
      </Stack>
    </Stack>
  );
}
