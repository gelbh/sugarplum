import Box from "@mui/material/Box";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import type { JourneyView } from "../journey/types";
import { stepperSx } from "../materials/stepperSx";

type Props = {
  view: JourneyView;
};

/** Quiet horizontal progress under the page title. No card chrome. */
export default function JourneyRail({ view }: Props) {
  if (view.collapsed) return null;

  const activeIndex = Math.max(
    0,
    view.stages.findIndex((s) => s.active),
  );

  return (
    <Box
      component="nav"
      aria-label="Setup progress"
      sx={{ width: "100%", py: 0.5 }}
    >
      <Stepper
        activeStep={activeIndex}
        alternativeLabel
        sx={[
          stepperSx,
          {
            "& .MuiStepLabel-label": {
              typography: "caption",
              mt: 0.5,
            },
          },
        ]}
      >
        {view.stages.map((s, index) => (
          <Step key={s.id} completed={index < activeIndex && s.done}>
            <StepLabel>{s.label}</StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}
