import Button from "@mui/material/Button";
import type { SvgIconComponent } from "@mui/icons-material";
import AddIcon from "@mui/icons-material/Add";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import RateReviewIcon from "@mui/icons-material/RateReview";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import type { JourneyView } from "./types";
import type { FC } from "react";

type Props = {
  view: JourneyView;
  onAction?: (action: JourneyView["next"]["action"]) => void;
  disabled?: boolean;
};

const ACTION_ICON: Record<JourneyView["next"]["action"], SvgIconComponent> = {
  create_deck: AddIcon,
  add_material: NoteAddIcon,
  review: RateReviewIcon,
  study: PlayArrowIcon,
  add_more: AddIcon,
};

const JourneyNextButton: FC<Props> = ({ view, onAction, disabled }) => {
  const next = view.next;
  const Icon = ACTION_ICON[next.action] ?? AddIcon;

  const handleClick = () => {
    if (next.href) return;
    onAction?.(next.action);
  };

  return (
    <Button
      variant="contained"
      color="primary"
      startIcon={<Icon />}
      href={next.href ?? undefined}
      onClick={next.href ? undefined : handleClick}
      disabled={disabled}
      aria-label={next.label}
    >
      {next.label}
    </Button>
  );
};

export default JourneyNextButton;

