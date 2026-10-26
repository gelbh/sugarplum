import Button from "@mui/material/Button";
import type { FC } from "react";
import AddIcon from "@mui/icons-material/Add";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import RateReviewIcon from "@mui/icons-material/RateReview";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import type { JourneyView } from "./types";

type Props = {
  next: JourneyView["next"];
};

const ACTION_ICON: Record<string, FC> = {
  create_deck: AddIcon,
  add_material: NoteAddIcon,
  review: RateReviewIcon,
  study: PlayArrowIcon,
  add_more: AddIcon,
};

export default function JourneyNextButton({ next }: Props) {
  const Icon = ACTION_ICON[next.action] ?? AddIcon;
  return (
    <Button
      variant="contained"
      href={next.href ?? undefined}
      startIcon={<Icon />}
      aria-label={next.label}
    >
      {next.label}
    </Button>
  );
}

