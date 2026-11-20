import { useMemo, useState, ViewTransition } from "react";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import AtlasImage, { heroImage } from "./AtlasImage";
import NotInPackChip, { NOT_IN_PACK_DIM } from "./NotInPackChip";
import { entryTitles } from "../entry/entryTitles";
import { atlasHeroName } from "../paths";
import {
  GROUP_LABELS,
  TIER_LABELS,
  hostSummary,
  pppLabel,
  sortTable,
  termLabel,
  type SortDir,
  type TableColumn,
} from "./filter";
import type { AtlasEntryView } from "../types";

type Props = {
  entries: AtlasEntryView[];
  entryHref: (id: string) => string;
  onOpen: (id: string) => void;
  focusActive: boolean;
  /** Pack-hidden rows shown through Show hidden or search. */
  notInPackIds?: ReadonlySet<string>;
};

const BASE_COLUMNS: { id: TableColumn; label: string; wide?: boolean }[] = [
  { id: "name", label: "Name" },
  { id: "group", label: "Group" },
  { id: "host", label: "Definitive hosts" },
  { id: "site", label: "Site", wide: true },
  { id: "ppp", label: "PPP", wide: true },
];

const wideOnly = { display: { xs: "none", sm: "table-cell" } };

export default function AtlasTable({
  entries,
  entryHref,
  onOpen,
  focusActive,
  notInPackIds,
}: Props) {
  const dimFor = (id: string) =>
    notInPackIds?.has(id) ? NOT_IN_PACK_DIM : {};
  const columns = useMemo(
    () =>
      focusActive
        ? [
            BASE_COLUMNS[0],
            { id: "focus" as const, label: "Focus" },
            ...BASE_COLUMNS.slice(1),
          ]
        : BASE_COLUMNS,
    [focusActive],
  );
  const [sort, setSort] = useState<{ column: TableColumn; dir: SortDir }>({
    column: "name",
    dir: "asc",
  });
  const rows = useMemo(
    () => sortTable(entries, sort.column, sort.dir),
    [entries, sort],
  );

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table
        size="small"
        aria-label="Parasites"
        sx={{ "& .MuiTableCell-root": { px: { xs: 1, sm: 2 } } }}
      >
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: { xs: 32, sm: 40 } }} aria-hidden />
            {columns.map((c) => (
              <TableCell
                key={c.id}
                sortDirection={sort.column === c.id ? sort.dir : false}
                sx={[{ fontWeight: 600 }, c.wide ? wideOnly : {}]}
              >
                <TableSortLabel
                  active={sort.column === c.id}
                  direction={sort.column === c.id ? sort.dir : "asc"}
                  onClick={() =>
                    setSort((s) => ({
                      column: c.id,
                      dir:
                        s.column === c.id && s.dir === "asc" ? "desc" : "asc",
                    }))
                  }
                >
                  {c.label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((e) => (
            // The name cell holds the chip, so only the other cells dim.
            <TableRow
              key={e.id}
              hover
              onClick={() => onOpen(e.id)}
              sx={{ cursor: "pointer" }}
            >
              <TableCell sx={[{ py: 0.75 }, dimFor(e.id)]}>
                <ViewTransition name={atlasHeroName(e.id)} share="atlas-morph">
                  <AtlasImage
                    image={heroImage(e)}
                    ratio="1 / 1"
                    compact
                    sx={{ width: { xs: 32, sm: 40 }, borderRadius: 1 }}
                  />
                </ViewTransition>
              </TableCell>
              <TableCell>
                <Link
                  href={entryHref(e.id)}
                  underline="hover"
                  color="inherit"
                  onClick={(ev) => {
                    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) {
                      ev.stopPropagation();
                      return;
                    }
                    ev.preventDefault();
                  }}
                  sx={{ fontWeight: 600 }}
                >
                  {entryTitles(e).primary}
                </Link>
                {notInPackIds?.has(e.id) ? (
                  <>
                    {" "}
                    <NotInPackChip />
                  </>
                ) : null}
              </TableCell>
              {focusActive ? (
                <TableCell sx={dimFor(e.id)}>
                  {e.tier === null ? "-" : TIER_LABELS[e.tier]}
                </TableCell>
              ) : null}
              <TableCell sx={dimFor(e.id)}>
                {e.fields.group
                  ? GROUP_LABELS[e.fields.group].plural
                  : "Ungrouped"}
              </TableCell>
              <TableCell sx={dimFor(e.id)}>
                {hostSummary(e.fields.definitiveHosts, 3)}
              </TableCell>
              <TableCell sx={[wideOnly, dimFor(e.id)]}>
                {e.fields.majorOrgan ? termLabel(e.fields.majorOrgan) : null}
              </TableCell>
              <TableCell
                sx={[wideOnly, { whiteSpace: "nowrap" }, dimFor(e.id)]}
              >
                {pppLabel(e.fields.pppDays)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
