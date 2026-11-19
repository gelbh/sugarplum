import { useEffect, useMemo, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Collapse from "@mui/material/Collapse";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { EasyDay } from "../study/loadBalance";
import type { StudyPrefs } from "../study/policyQueue";
import { maybeRunFsrsOptimize } from "../study/fsrsOptimizeClient";
import { ankiExportFsrsBlurb } from "./ankiExportFsrsBlurb";
import FsrsWeightsSettings from "./FsrsWeightsSettings";
import {
  STUDY_LOAD_PRESET_ORDER,
  STUDY_LOAD_PRESETS,
  applyStudyPreset,
  matchStudyPreset,
  type StudyLoadPresetId,
} from "./studyPresets";

export type StudyPacingSectionProps = {
  guest: boolean;
  studyPrefs: StudyPrefs;
  introBudgetInput: string;
  reviewBudgetInput: string;
  desiredRetentionInput: string;
  enableFuzz: boolean;
  enableLoadBalance: boolean;
  easyDays: readonly EasyDay[];
  studyError: string | null;
  studyNotice: string | null;
  studyBusy: boolean;
  heldIntroCount: number | null;
  onIntroBudgetInput: (value: string) => void;
  onReviewBudgetInput: (value: string) => void;
  onDesiredRetentionInput: (value: string) => void;
  onEnableFuzz: (value: boolean) => void;
  onEnableLoadBalance: (value: boolean) => void;
  onEasyDays: (value: EasyDay[]) => void;
  onStudyPrefsPatch: (prefs: StudyPrefs) => void;
  onSubmitStudy: (e: FormEvent) => void;
};

export default function StudyPacingSection(props: StudyPacingSectionProps) {
  const introNum = Number(props.introBudgetInput);
  const reviewNum = Number(props.reviewBudgetInput);
  const matched = useMemo(() => {
    if (!Number.isFinite(introNum) || !Number.isFinite(reviewNum)) {
      return "custom" as const;
    }
    return matchStudyPreset(introNum, reviewNum);
  }, [introNum, reviewNum]);

  const [customizeOpen, setCustomizeOpen] = useState(matched === "custom");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (matched === "custom") setCustomizeOpen(true);
  }, [matched]);

  // Retrain on Settings load even when Advanced (and FsrsWeightsSettings) stays closed.
  useEffect(() => {
    void maybeRunFsrsOptimize();
  }, []);

  function selectPreset(id: StudyLoadPresetId) {
    const next = applyStudyPreset(props.studyPrefs, id);
    props.onStudyPrefsPatch(next);
    props.onIntroBudgetInput(String(next.introBudget));
    props.onReviewBudgetInput(String(next.reviewBudget));
    setCustomizeOpen(false);
  }

  const waitingLine =
    props.heldIntroCount != null && props.heldIntroCount > 0
      ? ` About ${props.heldIntroCount} new card${props.heldIntroCount === 1 ? "" : "s"} waiting.`
      : "";

  return (
    <Paper
      id="study"
      variant="outlined"
      sx={{
        p: 2.5,
        bgcolor: "background.paper",
        borderColor: "divider",
        scrollMarginTop: 72,
      }}
    >
      <Typography
        variant="subtitle1"
        component="h2"
        sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
      >
        Study
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          mb: 2
        }}>
        Choose how many new cards to start each day. Soft caps keep a busy day
        from exploding; held new cards stay ready. Use Study more for another
        intro slice today.
        {props.guest ? " Saved on this device for guest study." : null}{" "}
        {ankiExportFsrsBlurb()}
      </Typography>

      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{
          flexWrap: "wrap",
          mb: 2
        }}>
        {STUDY_LOAD_PRESET_ORDER.map((id) => {
          const p = STUDY_LOAD_PRESETS[id];
          const selected = matched === id;
          return (
            <Box
              key={id}
              component="button"
              type="button"
              onClick={() => selectPreset(id)}
              aria-pressed={selected}
              sx={{
                textAlign: "left",
                cursor: "pointer",
                border: 1,
                borderColor: selected ? "primary.main" : "divider",
                borderLeftWidth: selected ? 3 : 1,
                borderLeftColor: selected ? "primary.main" : undefined,
                bgcolor: selected ? "action.selected" : "background.paper",
                borderRadius: 1,
                px: 1.5,
                py: 1.25,
                minWidth: 120,
                flex: "1 1 120px",
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {p.label}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block"
                }}>
                {p.blurb}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block"
                }}>
                {p.introBudget} new · {p.reviewBudget} reviews
              </Typography>
            </Box>
          );
        })}
      </Stack>

      {matched === "custom" ? (
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 1
          }}>
          Custom pace (does not match a preset).
        </Typography>
      ) : null}

      <Alert severity="info" sx={{ mb: 2 }}>
        About <strong>{Number.isFinite(introNum) ? introNum : "—"}</strong> new
        cards per day.
        {waitingLine} Soft review cap:{" "}
        <strong>{Number.isFinite(reviewNum) ? reviewNum : "—"}</strong>. Load
        balance only smooths which days cards land on; it does not reduce your
        total cards.
      </Alert>

      <Button
        type="button"
        size="small"
        onClick={() => setCustomizeOpen((o) => !o)}
        sx={{ mb: 1 }}
      >
        {customizeOpen ? "Hide custom numbers" : "Customize numbers"}
      </Button>

      <Box component="form" onSubmit={props.onSubmitStudy} noValidate>
        <Stack spacing={2}>
          {props.studyError ? (
            <Alert severity="error">{props.studyError}</Alert>
          ) : null}
          {props.studyNotice ? (
            <Alert severity="success">{props.studyNotice}</Alert>
          ) : null}

          <Collapse in={customizeOpen} unmountOnExit>
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <TextField
                label="How many new cards to start each day"
                type="number"
                name="introBudget"
                value={props.introBudgetInput}
                onChange={(ev) => props.onIntroBudgetInput(ev.target.value)}
                required
                fullWidth
                helperText="1–200. Default 20."
                slotProps={{
                  htmlInput: { min: 1, max: 200, step: 1 }
                }}
              />
              <TextField
                label="Soft cap on reviews"
                type="number"
                name="reviewBudget"
                value={props.reviewBudgetInput}
                onChange={(ev) => props.onReviewBudgetInput(ev.target.value)}
                required
                fullWidth
                helperText="1–2000. Default 200."
                slotProps={{
                  htmlInput: { min: 1, max: 2000, step: 1 }
                }}
              />
              <TextField
                label="Target recall when due"
                type="number"
                name="desiredRetention"
                value={props.desiredRetentionInput}
                onChange={(ev) =>
                  props.onDesiredRetentionInput(ev.target.value)
                }
                required
                fullWidth
                helperText="0.70–0.97. Higher means more reviews. Applies on the next grade."
                slotProps={{
                  htmlInput: { min: 0.7, max: 0.97, step: 0.01 }
                }}
              />
            </Stack>
          </Collapse>

          <Button
            type="button"
            size="small"
            onClick={() => setAdvancedOpen((o) => !o)}
          >
            {advancedOpen ? "Hide advanced scheduling" : "Advanced scheduling"}
          </Button>

          <Collapse in={advancedOpen} unmountOnExit>
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={props.enableFuzz}
                    onChange={(ev) => props.onEnableFuzz(ev.target.checked)}
                    name="enableFuzz"
                  />
                }
                label="Avoid card pile-ups (fuzz)"
              />
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                Slightly varies due dates so same-interval cards do not all land
                on one day. Existing dues are unchanged until the next grade.
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={props.enableLoadBalance}
                    onChange={(ev) =>
                      props.onEnableLoadBalance(ev.target.checked)
                    }
                    name="enableLoadBalance"
                    disabled={!props.enableFuzz}
                  />
                }
                label="Smooth busy days (load balance)"
              />
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                Within the fuzz window, prefer days with fewer cards due. This
                does not reduce your total cards. Separate from the soft review
                cap. Applies on the next grade when fuzz is on.
              </Typography>
              <Typography variant="subtitle2" sx={{ pt: 1 }}>
                Easy days (Mon–Sun)
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap sx={{
                flexWrap: "wrap"
              }}>
                {(
                  [
                    "Mon",
                    "Tue",
                    "Wed",
                    "Thu",
                    "Fri",
                    "Sat",
                    "Sun",
                  ] as const
                ).map((label, i) => (
                  <TextField
                    key={label}
                    select
                    label={label}
                    size="small"
                    value={props.easyDays[i]}
                    disabled={!props.enableLoadBalance || !props.enableFuzz}
                    onChange={(ev) => {
                      const value = ev.target.value as EasyDay;
                      const next = [...props.easyDays] as EasyDay[];
                      next[i] = value;
                      props.onEasyDays(next);
                    }}
                    sx={{ minWidth: 110 }}
                    slotProps={{
                      select: { native: true }
                    }}
                  >
                    <option value="normal">Normal</option>
                    <option value="reduced">Reduced</option>
                    <option value="minimum">Minimum</option>
                  </TextField>
                ))}
              </Stack>
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                Minimum tries to avoid that weekday when another day in the fuzz
                window is available. Reduced lowers the chance.
              </Typography>
              <FsrsWeightsSettings />
            </Stack>
          </Collapse>

          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={props.studyBusy}
          >
            {props.studyBusy ? "Saving…" : "Save study settings"}
          </Button>
        </Stack>
      </Box>
    </Paper>
  );
}
