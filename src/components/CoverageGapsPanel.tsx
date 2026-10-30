import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { MAX_TOPIC_HINTS } from "../api/client";

type Props = {
  gaps: string[];
  selected: string[];
  onSelectedChange: (update: (prev: string[]) => string[]) => void;
  disabled: boolean;
  onRegenerate: () => void;
};

/** Collapsed list of uncovered material lines; picks feed a one-run regen. */
export default function CoverageGapsPanel({
  gaps,
  selected,
  onSelectedChange,
  disabled,
  onRegenerate,
}: Props) {
  return (
    <Accordion disableGutters variant="outlined">
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        aria-controls="coverage-gaps-content"
        id="coverage-gaps-header"
      >
        <Typography variant="body2">Not covered ({gaps.length})</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="caption" color="text.secondary">
          Lines no draft covered when this job was generated. Pick up to{" "}
          {MAX_TOPIC_HINTS} to steer a regeneration.
        </Typography>
        <Stack
          component="ul"
          spacing={0.5}
          sx={{ listStyle: "none", m: 0, mt: 1, p: 0 }}
        >
          {gaps.map((gap) => {
            const checked = selected.includes(gap);
            return (
              <li key={gap}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={checked}
                      disabled={
                        disabled ||
                        (!checked && selected.length >= MAX_TOPIC_HINTS)
                      }
                      onChange={() =>
                        onSelectedChange((prev) =>
                          prev.includes(gap)
                            ? prev.filter((g) => g !== gap)
                            : [...prev, gap],
                        )
                      }
                    />
                  }
                  label={
                    <Typography
                      variant="body2"
                      title={gap}
                      sx={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {gap}
                    </Typography>
                  }
                />
              </li>
            );
          })}
        </Stack>
        <Button
          variant="outlined"
          size="small"
          sx={{ mt: 1 }}
          disabled={selected.length === 0 || disabled}
          onClick={onRegenerate}
        >
          Regenerate covering selected ({selected.length})
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}
