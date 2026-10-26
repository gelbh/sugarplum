import Stack from "@mui/material/Stack";
import type { JourneyView } from "../journey/types";
import JourneyRail from "./JourneyRail";
import JourneyNextButton from "./JourneyNextButton";

type Props = {
  view: JourneyView;
  onAction?: (action: JourneyView["next"]["action"]) => void;
  /** Hide the Next button (e.g. Today already shows Start study). */
  hideNext?: boolean;
};

/** Title-adjacent journey band: stepper + primary Next as one unit. */
export default function JourneyChrome({ view, onAction, hideNext }: Props) {
  const showNext = !hideNext && !(view.collapsed && view.next.href === "/today");

  if (view.collapsed && !showNext) return null;

  return (
    <Stack spacing={1.5} sx={{ width: "100%" }}>
      <JourneyRail view={view} />
      {showNext ? (
        <Stack direction="row" justifyContent="flex-start">
          <JourneyNextButton view={view} onAction={onAction} />
        </Stack>
      ) : null}
    </Stack>
  );
}
