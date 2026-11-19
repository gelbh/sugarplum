import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { type EntryRefs } from "./entryFields";
import type { GlanceRow } from "./entryGlance";
import { glanceIconFor } from "./glanceIcons";
import {
  CiteSup,
  GlanceValue,
  PPP_KEY,
  SITE_KEY,
  STAGE_KEY,
  type FieldKey,
} from "./GlanceFact";

/** Full-width sheet; bands share the row and tiles grow to fill. */
export function BandSheetPanel({
  rows,
  refs,
  onCite,
}: {
  rows: GlanceRow[];
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
}) {
  return (
    <Paper
      component="div"
      variant="outlined"
      sx={{
        borderRadius: 1.5,
        bgcolor: "background.paper",
        overflow: "hidden",
        width: "100%",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "stretch",
          gap: 1.25,
          px: 1.35,
          py: 1.2,
        }}
      >
        {rows.map((row) => (
          <BodyCourseSlot
            key={row.key}
            row={row}
            refs={refs}
            onCite={onCite}
            dense
            fill
            flexGrow={Math.max(
              row.kind === "terms" ? (row.terms?.length ?? 1) : 1,
              1,
            )}
          />
        ))}
      </Box>
    </Paper>
  );
}

/** One outlined sheet: Site | Stages, then full-width PPP. */
export function BodyCoursePanel({
  rows,
  refs,
  onCite,
}: {
  rows: GlanceRow[];
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
}) {
  const site = rows.find((r) => r.key === SITE_KEY);
  const stages = rows.find((r) => r.key === STAGE_KEY);
  const ppp = rows.find((r) => r.key === PPP_KEY);
  const PppIcon = glanceIconFor(
    ppp ?? { key: "pppDays", label: "Prepatent period", citeField: null, kind: "text" },
  );

  return (
    <Paper
      component="div"
      variant="outlined"
      sx={{
        borderRadius: 1.5,
        bgcolor: "background.paper",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {site || stages ? (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "stretch",
            gap: 1.25,
            px: 1.35,
            pt: 1.2,
            pb: ppp ? 0.15 : 1.2,
          }}
        >
          {site ? (
            <BodyCourseSlot
              row={site}
              refs={refs}
              onCite={onCite}
              dense
              fill
              flexGrow={1}
            />
          ) : null}
          {stages ? (
            <BodyCourseSlot
              row={stages}
              refs={refs}
              onCite={onCite}
              dense
              fill
              flexGrow={Math.max(stages.terms?.length ?? 1, 1)}
            />
          ) : null}
        </Box>
      ) : null}
      {ppp ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "28px minmax(0, 1fr)",
            gap: 1.25,
            alignItems: "start",
            px: 1.35,
            pt: 0.85,
            pb: 1.2,
          }}
        >
          <PppIcon
            sx={{
              fontSize: 22,
              mt: "3px",
              color: "primary.main",
              opacity: 0.88,
            }}
            aria-hidden
          />
          <div>
            <Typography
              component="dt"
              sx={{
                color: "text.secondary",
                fontSize: "0.88rem",
                fontWeight: 600,
                lineHeight: 1.3
              }}>
              {ppp.label}
              {ppp.citeField ? (
                <CiteSup
                  field={ppp.citeField}
                  label={ppp.label}
                  refs={refs}
                  onCite={onCite}
                />
              ) : null}
            </Typography>
            <Box component="dd" sx={{ m: 0, mt: 0.35 }}>
              <GlanceValue row={ppp} />
            </Box>
          </div>
        </Box>
      ) : null}
    </Paper>
  );
}

function BodyCourseSlot({
  row,
  refs,
  onCite,
  siteTileMax,
  dense,
  fill,
  flexGrow = 1,
}: {
  row: GlanceRow;
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
  siteTileMax?: number;
  /** Parent already padded. */
  dense?: boolean;
  /** Band grows; portraits fill the band. */
  fill?: boolean;
  /** Flex grow weight (e.g. portrait count for equal tile sizes). */
  flexGrow?: number;
}) {
  return (
    <Box
      sx={{
        px: dense ? 0 : 1.5,
        py: dense ? 0 : 1.35,
        minWidth: 0,
        flex: fill ? `${flexGrow} 1 0` : "0 1 auto",
      }}
    >
      <Typography
        component="dt"
        sx={{
          color: "text.secondary",
          fontSize: "0.88rem",
          fontWeight: 600,
          lineHeight: 1.3
        }}>
        {row.label}
        {row.citeField ? (
          <CiteSup
            field={row.citeField}
            label={row.label}
            refs={refs}
            onCite={onCite}
          />
        ) : null}
      </Typography>
      <Box component="dd" sx={{ m: 0, mt: 0.15 }}>
        <GlanceValue
          row={row}
          siteTileMax={siteTileMax}
          fillPortraits={fill}
        />
      </Box>
    </Box>
  );
}
