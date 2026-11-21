import { useEffect, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import {
  CLIMATE_BAND_TERM_KEYS,
  DISTRIBUTION_REGION_TERM_KEYS,
} from "../../../worker/atlas/datasets/vocab";
import {
  PARASITE_GROUPS,
  ZOONOTIC_VALUES,
} from "../../../worker/atlas/templates/parasite";
import {
  FIELD_LABELS,
  ZOONOTIC_LABELS,
  isFieldKey,
} from "../entry/entryFields";
import { entryTitles } from "../entry/entryTitles";
import { distributionChipLabels } from "../hub/distributionTags";
import { GROUP_LABELS } from "../hub/filter";
import { ALIAS_MAX_CHARS, ALIAS_MAX_ITEMS } from "../hub/nameMatch";
import { shouldAutoFocusText } from "../../shared/lib/autoFocusText";
import type { AtlasEntryView, FieldKey } from "../types";
import {
  EDIT_SECTION_TITLES,
  editSectionDomId,
  type EditSectionId,
  type EntryDraft,
  type EntryPatch,
  type TextDraftKey,
} from "./entryPatch";
import { useEditEntryDialog } from "./useEditEntryDialog";

type Props = {
  open: boolean;
  atlasId: string;
  entry: AtlasEntryView | null;
  onClose: () => void;
  onDone: () => void;
  /** Glance pencil target; scrolled into view when the dialog opens. */
  initialSection?: EditSectionId;
  /** Biology section link to the separate lifecycle editor. */
  onEditLifecycle?: () => void;
  /** Phase 4 seam; see EditEntryDialogArgs.afterSave. */
  afterSave?: (patch: EntryPatch) => Promise<void>;
  /** Phase 4 seam: rendered inside the form, above the dialog actions. */
  footerExtra?: ReactNode;
};

const HOST_HELP = "Comma-separated host terms";
const LIST_HELP = "Comma-separated";

const regionLabel = (r: EntryDraft["distributionRegions"][number]) =>
  distributionChipLabels({ worldwide: false, regions: [r], bands: [] })[0] ?? r;
const bandLabel = (b: EntryDraft["climateBands"][number]) =>
  distributionChipLabels({ worldwide: false, regions: [], bands: [b] })[0] ?? b;

function Section({ id, children }: { id: EditSectionId; children: ReactNode }) {
  const title = EDIT_SECTION_TITLES[id];
  return (
    <Box
      component="section"
      id={editSectionDomId(id)}
      aria-label={title}
      sx={{ scrollMarginTop: 8 }}
    >
      <Typography
        sx={{
          color: "text.secondary",
          fontSize: "0.78rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          mb: 1,
        }}
      >
        {title}
      </Typography>
      <Stack spacing={1.5}>{children}</Stack>
    </Box>
  );
}

function TermChecks<T extends string>({
  legend,
  options,
  selected,
  labelFor,
  onChange,
  disabled,
}: {
  legend: string;
  options: readonly T[];
  selected: readonly T[];
  labelFor: (term: T) => string;
  onChange: (next: T[]) => void;
  disabled: boolean;
}) {
  return (
    <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
      <Typography
        component="legend"
        variant="body2"
        sx={{ color: "text.secondary", mb: 0.5 }}
      >
        {legend}
      </Typography>
      <FormGroup row>
        {options.map((term) => (
          <FormControlLabel
            key={term}
            label={labelFor(term)}
            control={
              <Checkbox
                size="small"
                checked={selected.includes(term)}
                disabled={disabled}
                onChange={(ev) =>
                  onChange(
                    ev.target.checked
                      ? [...selected, term]
                      : selected.filter((s) => s !== term),
                  )
                }
              />
            }
          />
        ))}
      </FormGroup>
    </Box>
  );
}

export function EditEntryDialog({
  open,
  atlasId,
  entry,
  onClose,
  onDone,
  initialSection,
  onEditLifecycle,
  afterSave,
  footerExtra,
}: Props) {
  const {
    draft,
    update,
    fieldErrors,
    busy,
    error,
    editedFields,
    canReset,
    canEditCanonical,
    diagnosticOwned,
    onSubmit,
    onResetField,
    onSoftDelete,
    onReset,
  } = useEditEntryDialog({ open, atlasId, entry, onClose, onDone, afterSave });
  const ready = draft !== null;

  useEffect(() => {
    if (!open || !ready || !initialSection) return;
    // jsdom has no scrollIntoView; the optional call keeps tests and old browsers safe.
    document
      .getElementById(editSectionDomId(initialSection))
      ?.scrollIntoView?.({ block: "start" });
  }, [open, ready, initialSection]);

  /** "Edited" chip plus Reset for a field this learner overrides. */
  const edited = (field: FieldKey) =>
    editedFields.includes(field) ? (
      <Stack direction="row" sx={{ alignItems: "center", gap: 1, mt: -0.5 }}>
        <Chip size="small" variant="outlined" label="Edited" />
        <Button
          size="small"
          variant="text"
          aria-label={`Reset ${FIELD_LABELS[field]}`}
          onClick={() => void onResetField(field)}
          disabled={busy}
        >
          Reset
        </Button>
      </Stack>
    ) : null;

  const text = (
    key: TextDraftKey,
    label: string,
    opts: {
      multiline?: boolean;
      helper?: string;
      required?: boolean;
      disabled?: boolean;
      autoFocus?: boolean;
      numeric?: boolean;
    } = {},
  ) => {
    const ppp = key === "pppMin" || key === "pppMax";
    const err = fieldErrors[key === "pppMin" || key === "pppMax" ? "pppDays" : key];
    return (
      <>
        <TextField
          label={label}
          value={draft?.[key] ?? ""}
          onChange={(ev) => update(key, ev.target.value)}
          disabled={busy || opts.disabled}
          fullWidth
          required={opts.required}
          autoFocus={opts.autoFocus}
          multiline={opts.multiline}
          minRows={opts.multiline ? 2 : undefined}
          slotProps={
            opts.numeric ? { htmlInput: { inputMode: "numeric" } } : undefined
          }
          error={Boolean(err)}
          helperText={ppp ? undefined : (err ?? opts.helper)}
        />
        {isFieldKey(key) ? edited(key) : null}
      </>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            display: "flex",
            flexDirection: "column",
            maxHeight: "90vh",
            overflow: "hidden",
          },
        },
      }}
    >
      <Box
        component="form"
        onSubmit={onSubmit}
        sx={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          flex: 1,
          overflow: "hidden",
        }}
      >
        <DialogTitle>
          Edit {entry ? entryTitles(entry).primary : "entry"}
        </DialogTitle>
        <DialogContent
          dividers
          sx={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}
        >
          {draft ? (
            <Stack spacing={3}>
              <Section id="names">
                {text("commonName", "Common name", {
                  required: true,
                  autoFocus: shouldAutoFocusText() && !initialSection,
                })}
                {canEditCanonical ? (
                  text("canonicalName", "Scientific name", { required: true })
                ) : (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    Scientific name <em>{draft.canonicalName}</em> is fixed for
                    built-in parasites; add an alias instead.
                  </Typography>
                )}
                {text("aliases", "Extra aliases", {
                  multiline: true,
                  helper: `One per line, up to ${ALIAS_MAX_ITEMS}, ${ALIAS_MAX_CHARS} characters each`,
                })}
              </Section>

              <Section id="taxonomy">
                {text("phylum", FIELD_LABELS.phylum)}
                {text("order", FIELD_LABELS.order)}
                {text("family", FIELD_LABELS.family)}
                <TextField
                  select
                  label={FIELD_LABELS.group}
                  value={draft.group}
                  onChange={(ev) =>
                    update("group", ev.target.value as EntryDraft["group"])
                  }
                  disabled={busy}
                  fullWidth
                  error={Boolean(fieldErrors.group)}
                  helperText={fieldErrors.group}
                >
                  {PARASITE_GROUPS.map((g) => (
                    <MenuItem key={g} value={g}>
                      {GROUP_LABELS[g].plural}
                    </MenuItem>
                  ))}
                </TextField>
                {edited("group")}
              </Section>

              <Section id="hosts">
                {text("definitiveHosts", FIELD_LABELS.definitiveHosts, {
                  helper: HOST_HELP,
                })}
                {text("intermediateHosts", FIELD_LABELS.intermediateHosts, {
                  helper: HOST_HELP,
                })}
                {text("paratenicHosts", FIELD_LABELS.paratenicHosts, {
                  helper: HOST_HELP,
                })}
              </Section>

              <Section id="biology">
                {text("majorOrgan", FIELD_LABELS.majorOrgan)}
                {text("onHostStages", FIELD_LABELS.onHostStages, {
                  helper: LIST_HELP,
                })}
                <TextField
                  select
                  label={FIELD_LABELS.lifecycleType}
                  value={draft.lifecycleType}
                  onChange={(ev) =>
                    update(
                      "lifecycleType",
                      ev.target.value as EntryDraft["lifecycleType"],
                    )
                  }
                  disabled={busy}
                  fullWidth
                >
                  <MenuItem value="">Not set</MenuItem>
                  <MenuItem value="direct">Direct</MenuItem>
                  <MenuItem value="indirect">Indirect</MenuItem>
                </TextField>
                {edited("lifecycleType")}
                <Stack direction="row" sx={{ gap: 1.5 }}>
                  {text("pppMin", "PPP min (days)", { numeric: true })}
                  {text("pppMax", "PPP max (days)", { numeric: true })}
                </Stack>
                {fieldErrors.pppDays ? (
                  <Typography variant="caption" sx={{ color: "error.main" }}>
                    {fieldErrors.pppDays}
                  </Typography>
                ) : null}
                {edited("pppDays")}
                {onEditLifecycle ? (
                  <Button
                    variant="text"
                    size="small"
                    onClick={onEditLifecycle}
                    disabled={busy}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    Edit lifecycle stages
                  </Button>
                ) : null}
                {edited("lifecycleStages")}
              </Section>

              <Section id="distribution">
                {text("distribution", FIELD_LABELS.distribution, {
                  multiline: true,
                })}
                <FormControlLabel
                  label={FIELD_LABELS.distributionWorldwide}
                  control={
                    <Checkbox
                      checked={draft.distributionWorldwide}
                      onChange={(ev) =>
                        update("distributionWorldwide", ev.target.checked)
                      }
                      disabled={busy}
                    />
                  }
                />
                {edited("distributionWorldwide")}
                <TermChecks
                  legend={FIELD_LABELS.distributionRegions}
                  options={DISTRIBUTION_REGION_TERM_KEYS}
                  selected={draft.distributionRegions}
                  labelFor={regionLabel}
                  onChange={(next) => update("distributionRegions", next)}
                  disabled={busy}
                />
                {edited("distributionRegions")}
                <TermChecks
                  legend={FIELD_LABELS.climateBands}
                  options={CLIMATE_BAND_TERM_KEYS}
                  selected={draft.climateBands}
                  labelFor={bandLabel}
                  onChange={(next) => update("climateBands", next)}
                  disabled={busy}
                />
                {edited("climateBands")}
              </Section>

              <Section id="clinical">
                <TextField
                  select
                  label={FIELD_LABELS.zoonotic}
                  value={draft.zoonotic}
                  onChange={(ev) =>
                    update("zoonotic", ev.target.value as EntryDraft["zoonotic"])
                  }
                  disabled={busy}
                  fullWidth
                >
                  <MenuItem value="">Not set</MenuItem>
                  {ZOONOTIC_VALUES.map((z) => (
                    <MenuItem key={z} value={z}>
                      {ZOONOTIC_LABELS[z]}
                    </MenuItem>
                  ))}
                </TextField>
                {edited("zoonotic")}
                {text("significance", FIELD_LABELS.significance, {
                  multiline: true,
                })}
                {text("vectorRole", FIELD_LABELS.vectorRole)}
              </Section>

              <Section id="diagnosis">
                {text("diagnosticStage", FIELD_LABELS.diagnosticStage, {
                  disabled: diagnosticOwned,
                  helper: diagnosticOwned
                    ? "Set by the diagnostic stage in the lifecycle editor"
                    : undefined,
                })}
                {draft.diagnosticTests.map((t, i) => (
                  <Stack
                    key={i}
                    direction="row"
                    sx={{ gap: 1, alignItems: "flex-start" }}
                  >
                    <TextField
                      label="Test"
                      value={t.name}
                      error={
                        Boolean(fieldErrors.diagnosticTests) && !t.name.trim()
                      }
                      onChange={(ev) =>
                        update(
                          "diagnosticTests",
                          draft.diagnosticTests.map((x, j) =>
                            j === i ? { ...x, name: ev.target.value } : x,
                          ),
                        )
                      }
                      disabled={busy}
                      fullWidth
                    />
                    <TextField
                      label="Sample (optional)"
                      value={t.sample}
                      onChange={(ev) =>
                        update(
                          "diagnosticTests",
                          draft.diagnosticTests.map((x, j) =>
                            j === i ? { ...x, sample: ev.target.value } : x,
                          ),
                        )
                      }
                      disabled={busy}
                      fullWidth
                    />
                    <IconButton
                      aria-label={`Remove test ${i + 1}`}
                      onClick={() =>
                        update(
                          "diagnosticTests",
                          draft.diagnosticTests.filter((_, j) => j !== i),
                        )
                      }
                      disabled={busy}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
                {fieldErrors.diagnosticTests ? (
                  <Typography variant="caption" sx={{ color: "error.main" }}>
                    {fieldErrors.diagnosticTests}
                  </Typography>
                ) : null}
                <Button
                  variant="text"
                  size="small"
                  onClick={() =>
                    update("diagnosticTests", [
                      ...draft.diagnosticTests,
                      {
                        name: "",
                        sample: "",
                        windowStartWeek: null,
                        windowEndWeek: null,
                      },
                    ])
                  }
                  disabled={busy}
                  sx={{ alignSelf: "flex-start" }}
                >
                  Add test
                </Button>
                {edited("diagnosticTests")}
              </Section>
            </Stack>
          ) : null}
        </DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mx: 3, mt: 1.5, flex: "none" }}>
            {error}
          </Alert>
        ) : null}
        {footerExtra ? (
          <Box sx={{ px: 3, pt: 1.5, flex: "none" }}>{footerExtra}</Box>
        ) : null}
        <DialogActions
          sx={{
            flex: "none",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          <Stack direction="row" sx={{ gap: 1 }}>
            <Button
              color="error"
              onClick={() => void onSoftDelete()}
              disabled={busy}
            >
              Delete
            </Button>
            {canReset ? (
              <Button onClick={() => void onReset()} disabled={busy}>
                Reset to original
              </Button>
            ) : null}
          </Stack>
          <Stack direction="row" sx={{ gap: 1 }}>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={busy || !ready}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </Stack>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
