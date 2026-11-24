import { useCallback, useState } from "react";
import type { JobListItem } from "../../api/client";
import { navigate } from "../../shared/nav/navigate";

type Args = {
  draftJobs: JobListItem[];
};

export function useDeckHubDraftPicker({ draftJobs }: Args) {
  const [draftPickerOpen, setDraftPickerOpen] = useState(false);

  const openFullDraftReview = useCallback(() => {
    if (draftJobs.length === 0) return;
    if (draftJobs.length === 1) {
      navigate(`/jobs/${encodeURIComponent(draftJobs[0]!.id)}/drafts`);
      return;
    }
    setDraftPickerOpen(true);
  }, [draftJobs]);

  function openDraftJob(jobId: string) {
    setDraftPickerOpen(false);
    navigate(`/jobs/${encodeURIComponent(jobId)}/drafts`);
  }

  return {
    draftPickerOpen,
    setDraftPickerOpen,
    openFullDraftReview,
    openDraftJob,
  };
}
