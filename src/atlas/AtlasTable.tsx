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
import { atlasHeroName } from "./paths";
import {
  GROUP_LABELS,
  hostSummary,
  pppLabel,
  sortTable,
  termLabel,
  type SortDir,
  type TableColumn,
} from "./filter";
import type { AtlasEntryView } from "./types";

type Props = {
  entries: AtlasEntryView[];
  entryHref: (id: string) => string;
  onOpen: (id: string) => void;
};

const COLUMNS: { id: TableColumn; label: string; wide?: boolean }[] = [
  { id: "name", label: "Name" },
  { id: "group", label: "Group" },
  { id: "host", label: "Definitive hosts" },
  { id: "site", label: "Site", wide: true },
  { id: "ppp", label: "PPP", wide: true },
];

const wideOnly = { display: { xs: "none", sm: "table-cell" } };

export default function AtlasTable({ entries, entryHref, onOpen }: Props) {
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
            {COLUMNS.map((c) => (
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
            <TableRow
              key={e.id}
              hover
              onClick={() => onOpen(e.id)}
              sx={{ cursor: "pointer" }}
            >
              <TableCell sx={{ py: 0.75 }}>
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
                  sx={{ fontStyle: "italic", fontWeight: 600 }}
                >
                  {e.canonicalName}
                </Link>
              </TableCell>
              <TableCell>
                {e.fields.group
                  ? GROUP_LABELS[e.fields.group].plural
                  : "Ungrouped"}
              </TableCell>
              <TableCell>{hostSummary(e.fields.definitiveHosts, 3)}</TableCell>
              <TableCell sx={wideOnly}>
                {e.fields.majorOrgan ? termLabel(e.fields.majorOrgan) : null}
              </TableCell>
              <TableCell sx={[wideOnly, { whiteSpace: "nowrap" }]}>
                {pppLabel(e.fields.pppDays)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
