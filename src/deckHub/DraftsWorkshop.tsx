import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { JobListItem } from "../api/client";
import { navigate } from "../nav/navigate";

type Props = {
  draftJobs: JobListItem[];
  onAddMoreMaterial: () => void;
};

export default function DraftsWorkshop({
  draftJobs,
  onAddMoreMaterial,
}: Props) {
  const primary = draftJobs[0] ?? null;
  const totalDrafts = draftJobs.reduce((sum, job) => sum + job.draft_count, 0);

  return (
    <Stack spacing={2}>
      {draftJobs.length === 0 ? (
        <Alert severity="info">
          No draft jobs for this deck yet. Add material to generate cards.
        </Alert>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary">
            {totalDrafts} draft{totalDrafts === 1 ? "" : "s"} across{" "}
            {draftJobs.length} job{draftJobs.length === 1 ? "" : "s"}. Open a
            job to accept, edit, or skip.
          </Typography>
          {primary ? (
            <Button
              variant="contained"
              onClick={() =>
                navigate(`/jobs/${encodeURIComponent(primary.id)}/drafts`)
              }
            >
              Review{" "}
              {primary.filename?.trim() || "latest drafts"}
            </Button>
          ) : null}
          <Stack
            component="ul"
            spacing={0}
            divider={<Divider flexItem />}
            sx={{ m: 0, p: 0, listStyle: "none" }}
          >
            {draftJobs.map((job) => (
              <Box component="li" key={job.id} sx={{ py: 1 }}>
                <Link
                  href={`/jobs/${encodeURIComponent(job.id)}/drafts`}
                  underline="hover"
                  color="primary"
                  variant="body2"
                  onClick={(ev) => {
                    ev.preventDefault();
                    navigate(`/jobs/${encodeURIComponent(job.id)}/drafts`);
                  }}
                >
                  {job.filename?.trim() || "Untitled material"}
                  {" · "}
                  {job.draft_count} draft
                  {job.draft_count === 1 ? "" : "s"}
                </Link>
              </Box>
            ))}
          </Stack>
        </>
      )}
      <Button
        variant="text"
        onClick={onAddMoreMaterial}
        sx={{ alignSelf: "flex-start" }}
      >
        Add more material
      </Button>
    </Stack>
  );
}
