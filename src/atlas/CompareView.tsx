import { Fragment, useMemo, type MouseEvent, type ReactNode } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import AtlasImage, { heroImage } from "./AtlasImage";
import { compareRows, type CompareValue } from "./compare";
import { isTaxonTerm, matchesSearch, pppLabel, termLabel } from "./filter";
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
      if (v.values.length === 0) return "None";
      return v.values.map((term, i) => (
        <Fragment key={term}>
          {i > 0 ? ", " : null}
          {isTaxonTerm(term) ? <i>{term}</i> : i === 0 ? termLabel(term) : term}
        </Fragment>
      ));
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
        .filter((e) => e.id !== exclude)
        .sort((x, y) => x.canonicalName.localeCompare(y.canonicalName)),
    [entries, exclude],
  );
  return (
    <Autocomplete
      size="small"
      options={options}
      value={value}
      disableClearable={value !== null}
      getOptionLabel={(e) => e.canonicalName}
      isOptionEqualToValue={(x, y) => x.id === y.id}
      filterOptions={(list, { inputValue }) =>
        list.filter((e) => matchesSearch(e, inputValue))
      }
      onChange={(_, next) => {
        if (next) onChange(next.id);
      }}
      renderOption={({ key, ...props }, e) => (
        <li key={key} {...props}>
          <Box>
            <Box component="span" sx={{ fontStyle: "italic" }}>
              {e.canonicalName}
            </Box>
            {e.commonName ? (
              <Box
                component="span"
                sx={{ color: "text.secondary", ml: 1, fontSize: "0.85em" }}
              >
                {e.commonName}
              </Box>
            ) : null}
          </Box>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          sx={{
            "& .MuiInputBase-root": { bgcolor: "background.paper" },
            "& input": { fontStyle: value ? "italic" : undefined },
          }}
        />
      )}
    />
  );
}

function Hero({
  entry,
  missingId,
  href,
  onOpen,
}: {
  entry: AtlasEntryView | null;
  missingId: string;
  href: string | null;
  onOpen: () => void;
}) {
  if (!entry) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 600 }}>Not in the Atlas</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Nothing matches “{missingId}”. Pick a parasite above.
        </Typography>
      </Paper>
    );
  }
  const onClick = (ev: MouseEvent<HTMLAnchorElement>) => {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)
      return;
    ev.preventDefault();
    onOpen();
  };
  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <AtlasImage image={heroImage(entry)} ratio="16 / 10" />
      <Box sx={{ px: { xs: 1.25, sm: 2 }, py: { xs: 1, sm: 1.5 } }}>
        <Typography
          component="h2"
          sx={{
            fontStyle: "italic",
            fontWeight: 600,
            fontSize: { xs: "0.95rem", sm: "1.15rem" },
            lineHeight: 1.25,
          }}
        >
          {entry.canonicalName}
        </Typography>
        {entry.commonName ? (
          <Typography variant="body2" color="text.secondary">
            {entry.commonName}
          </Typography>
        ) : null}
        {href ? (
          <Link
            href={href}
            onClick={onClick}
            underline="hover"
            variant="body2"
            sx={{ display: "inline-block", mt: 0.75, fontWeight: 600 }}
          >
            Open lifecycle
          </Link>
        ) : null}
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
      <Stack
        direction="row"
        alignItems="flex-end"
        justifyContent="space-between"
        gap={2}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
            Compare
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            aria-live="polite"
            sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}
          >
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
          Swap
        </Button>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            md: "200px repeat(2, minmax(0, 1fr))",
          },
          columnGap: { xs: 1.25, sm: 2 },
          rowGap: 1.5,
        }}
      >
        <Box sx={{ display: { xs: "none", md: "block" } }} />
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
        <Box sx={{ display: { xs: "none", md: "block" } }} />
        <Hero
          entry={left}
          missingId={a}
          href={left ? entryHref(left.id) : null}
          onOpen={() => onOpenEntry(a)}
        />
        <Hero
          entry={right}
          missingId={b}
          href={right ? entryHref(right.id) : null}
          onOpen={() => onOpenEntry(b)}
        />
      </Box>

      {rows && left && right ? (
        <Box
          role="table"
          aria-label={`${left.canonicalName} compared with ${right.canonicalName}`}
          // Remount on a new pair so the differing rows pulse again.
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
            <span role="columnheader">{left.canonicalName}</span>
            <span role="columnheader">{right.canonicalName}</span>
          </Box>
          {rows.map((row, i) => (
            <Box
              key={row.key}
              role="row"
              sx={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: {
                  xs: "repeat(2, minmax(0, 1fr))",
                  md: "200px repeat(2, minmax(0, 1fr))",
                },
                columnGap: { xs: 1.25, sm: 2 },
                rowGap: 0.25,
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
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
                    boxShadow: (t) => `inset 3px 0 0 ${t.palette.primary.main}`,
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
