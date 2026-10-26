import Stack from "@mui/material/Stack";
import type { JourneyView } from "../journey/types";
import JourneyRail from "./JourneyRail";
import JourneyNextButton from "./JourneyNextButton";

type Props = {
  view: JourneyView;
  onAction?: (action: JourneyView["next"]["action"]) => void;
  /** Hide the Next button (e.g. Today already shows Start study). */
  hideNext?: boolean;
  /** Hide the stage stepper (e.g. Library already has CreateMaterialStepper). */
  hideRail?: boolean;
};

/** Title-adjacent journey band: stepper + primary Next as one unit. */
export default function JourneyChrome({
  view,
  onAction,
  hideNext,
  hideRail,
}: Props) {
  const showNext = !hideNext && !(view.collapsed && view.next.href === "/today");
  const showRail = !hideRail && !view.collapsed;

  if (!showRail && !showNext) return null;

  return (
    <Stack spacing={1.5} sx={{ width: "100%" }}>
      {showRail ? <JourneyRail view={view} /> : null}
      {showNext ? (
        <Stack direction="row" justifyContent="flex-start">
          <JourneyNextButton view={view} onAction={onAction} />
        </Stack>
      ) : null}
    </Stack>
  );
}
