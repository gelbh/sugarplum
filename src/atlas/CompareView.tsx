import { useMemo, type ReactNode } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import AtlasImage, { heroImage } from "./AtlasImage";
import { compareRows, type CompareValue } from "./compare";
import { entryTitles } from "./entryTitles";
import { byName, matchesSearch, pppLabel, termLabel } from "./filter";
import TermList from "./TermList";
import { isPlainClick } from "../nav/navigate";
import type { AtlasEntryView } from "./types";

type Props = {
  entries: AtlasEntryView[];
  a: string;
  b: string;
  entryHref: (id: string) => string;
  onOpenEntry: (id: string) => void;
  onChange: (a: string, b: string) => void;
};

const NOT_RECORDED = "Not recorded";
const COLUMNS = {
  display: "grid",
  gridTemplateColumns: {
    xs: "repeat(2, minmax(0, 1fr))",
    md: "200px repeat(2, minmax(0, 1fr))",
  },
  columnGap: { xs: 1.25, sm: 2 },
} as const;
const PLUM = "var(--mui-palette-primary-main)";

const srOnly = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

function formatValue(v: CompareValue): ReactNode {
  switch (v.kind) {
    case "text":
      return v.value === null ? NOT_RECORDED : termLabel(v.value);
    case "range":
      return pppLabel(v.value) ?? NOT_RECORDED;
    case "list":
      return v.values.length === 0 ? (
        "None"
      ) : (
        <TermList terms={v.values} taxa={v.taxa} capitalizeFirst={false} />
      );
  }
}

const isMissing = (v: CompareValue) =>
  (v.kind === "text" || v.kind === "range") && v.value === null;

function SidePicker({
  label,
  entries,
  value,
  exclude,
  onChange,
}: {
  label: string;
  entries: AtlasEntryView[];
  value: AtlasEntryView | null;
  exclude: string;
  onChange: (id: string) => void;
}) {
  const options = useMemo(
    () =>
      entries
        // A hand-typed /compare/x/x keeps x listed so the picker value stays valid.
        .filter((e) => e.id !== exclude || e.id === value?.id)
        .sort(byName),
    [entries, exclude, value],
  );
  return (
    <Autocomplete
      size="small"
      options={options}
      value={value}
      disableClearable={value !== null}
      getOptionLabel={(e) => entryTitles(e).primary}
      isOptionEqualToValue={(x, y) => x.id === y.id}
      filterOptions={(list, { inputValue }) =>
        list.filter((e) => matchesSearch(e, inputValue))
      }
      onChange={(_, next) => {
        if (next) onChange(next.id);
      }}
      renderOption={({ key, ...props }, e) => {
        const titles = entryTitles(e);
        return (
          <li key={key} {...props}>
            <Box>
              <Box component="span" sx={{ fontWeight: 600 }}>
                {titles.primary}
              </Box>
              {titles.scientific ? (
                <Box
                  component="span"
                  sx={{
                    color: "text.secondary",
                    ml: 1,
                    fontSize: "0.85em",
                    fontStyle: "italic",
                  }}
                >
                  {titles.scientific}
                </Box>
              ) : null}
            </Box>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          sx={{
            "& .MuiInputBase-root": { bgcolor: "background.paper" },
          }}
        />
      )}
    />
  );
}

function Hero({
  entry,
  missingId,
  entryHref,
  onOpen,
}: {
  entry: AtlasEntryView | null;
  missingId: string;
  entryHref: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  if (!entry) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 600 }}>Not in the Atlas</Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mt: 0.5
          }}>
          Nothing matches “{missingId}”. Pick a parasite above.
        </Typography>
      </Paper>
    );
  }
  const titles = entryTitles(entry);
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <AtlasImage
        image={heroImage(entry)}
        sx={{ aspectRatio: { xs: "4 / 3", md: "5 / 2" } }}
      />
      <Box sx={{ px: { xs: 1.25, sm: 2 }, py: { xs: 1, sm: 1.5 } }}>
        <Typography
          component="h2"
          sx={{
            fontWeight: 600,
            fontSize: { xs: "0.95rem", sm: "1.15rem" },
            lineHeight: 1.25,
          }}
        >
          {titles.primary}
        </Typography>
        {titles.scientific ? (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              fontStyle: "italic"
            }}>
            {titles.scientific}
          </Typography>
        ) : null}
        <Link
          href={entryHref(entry.id)}
          onClick={(ev) => {
            if (!isPlainClick(ev)) return;
            ev.preventDefault();
            onOpen(entry.id);
          }}
          underline="hover"
          variant="body2"
          sx={{ display: "inline-block", mt: 0.75, fontWeight: 600 }}
        >
          Open lifecycle
        </Link>
      </Box>
    </Paper>
  );
}

export default function CompareView({
  entries,
  a,
  b,
  entryHref,
  onOpenEntry,
  onChange,
}: Props) {
  const left = entries.find((e) => e.id === a) ?? null;
  const right = entries.find((e) => e.id === b) ?? null;
  const rows = useMemo(
    () => (left && right ? compareRows(left, right) : null),
    [left, right],
  );
  const differCount = rows?.filter((r) => r.differs).length ?? 0;

  return (
    <Stack spacing={2.5}>
      <Box sx={{ ...COLUMNS, rowGap: 1.5 }}>
        <Stack
          direction={{ xs: "row", md: "column" }}
          sx={{
            alignItems: { xs: "flex-end", md: "flex-start" },
            justifyContent: { xs: "space-between", md: "flex-start" },
            gap: 1.5,
            gridColumn: { xs: "1 / -1", md: "auto" },
            gridRow: { md: "span 2" }
          }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
              Compare
            </Typography>
            <Typography
              variant="body2"
              aria-live="polite"
              sx={{
                color: "text.secondary",
                mt: 0.5,
                fontVariantNumeric: "tabular-nums"
              }}>
              {rows
                ? differCount === 0
                  ? "No rows differ"
                  : `${differCount} of ${rows.length} rows differ`
                : "Pick two parasites"}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SwapHorizIcon />}
            onClick={() => onChange(b, a)}
            sx={{ bgcolor: "background.paper", flex: "none" }}
          >
            Swap sides
          </Button>
        </Stack>
        <SidePicker
          label="First parasite"
          entries={entries}
          value={left}
          exclude={b}
          onChange={(id) => onChange(id, b)}
        />
        <SidePicker
          label="Second parasite"
          entries={entries}
          value={right}
          exclude={a}
          onChange={(id) => onChange(a, id)}
        />
        <Hero
          entry={left}
          missingId={a}
          entryHref={entryHref}
          onOpen={onOpenEntry}
        />
        <Hero
          entry={right}
          missingId={b}
          entryHref={entryHref}
          onOpen={onOpenEntry}
        />
      </Box>

      {rows && left && right ? (
        <Box
          role="table"
          aria-label={`${entryTitles(left).primary} compared with ${entryTitles(right).primary}`}
          key={`${a}|${b}`}
          sx={{
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            overflow: "hidden",
            "@keyframes atlasComparePulse": {
              "0%": { opacity: 0 },
              "50%": { opacity: 1 },
              "100%": { opacity: 0.6 },
            },
          }}
        >
          <Box role="row" sx={srOnly}>
            <span role="columnheader">Field</span>
            <span role="columnheader">
              {entryTitles(left).primary}
            </span>
            <span role="columnheader">
              {entryTitles(right).primary}
            </span>
          </Box>
          {rows.map((row, i) => (
            <Box
              key={row.key}
              role="row"
              sx={{
                ...COLUMNS,
                position: "relative",
                rowGap: 0.25,
                alignItems: "baseline",
                px: { xs: 1.5, sm: 2 },
                py: 1.25,
                borderTop: i === 0 ? 0 : 1,
                borderColor: "divider",
                ...(row.differs && {
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    backgroundColor: `color-mix(in srgb, ${PLUM} 16%, transparent)`,
                    boxShadow: `inset 3px 0 0 ${PLUM}`,
                    opacity: 0.6,
                    animation: "atlasComparePulse 450ms ease-out both",
                    "@media (prefers-reduced-motion: reduce)": {
                      animation: "none",
                    },
                  },
                }),
                "& > *": { position: "relative" },
              }}
            >
              <Box
                role="rowheader"
                sx={{
                  gridColumn: { xs: "1 / -1", md: "auto" },
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  color: row.differs ? "text.primary" : "text.secondary",
                }}
              >
                {row.label}
                {row.differs ? (
                  <Box component="span" sx={srOnly}>
                    , differs
                  </Box>
                ) : null}
              </Box>
              {[row.a, row.b].map((v, side) => (
                <Box
                  key={side}
                  role="cell"
                  sx={{
                    fontSize: "0.9rem",
                    minWidth: 0,
                    overflowWrap: "anywhere",
                    color: isMissing(v) ? "text.secondary" : "text.primary",
                  }}
                >
                  {formatValue(v)}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      ) : null}
    </Stack>
  );
}
