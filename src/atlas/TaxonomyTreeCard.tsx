import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import { type EntryRefs } from "./entryFields";
import type { TaxonomyNode } from "./entryGlance";
import { glanceIconFor } from "./glanceIcons";
import { type TaxonomyFilter } from "./filter";
import { CiteSup, type FieldKey } from "./GlanceFact";

export function TaxonomyTreeCard({
  nodes,
  groupCue,
  refs,
  onCite,
  onTaxonomyBrowse,
  taxonomyActive,
}: {
  nodes: TaxonomyNode[];
  groupCue: string | null | undefined;
  refs: EntryRefs;
  onCite: (field: FieldKey) => void;
  onTaxonomyBrowse?: (filter: TaxonomyFilter) => void;
  taxonomyActive?: TaxonomyFilter | null;
}) {
  const Icon = glanceIconFor({
    key: "taxonomy",
    label: "Taxonomy",
    citeField: nodes[0]?.field ?? null,
    kind: "text",
    iconCue: groupCue ?? null,
  });
  const groupLabel = groupCue
    ? groupCue.charAt(0).toUpperCase() + groupCue.slice(1)
    : null;
  return (
    <Paper
      variant="outlined"
      sx={{
        display: "flex",
        alignItems: "stretch",
        gap: 1.5,
        px: 1.35,
        py: 1.15,
        borderRadius: 1.5,
        bgcolor: "background.paper",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0.35,
          alignSelf: "center",
          minWidth: 52,
        }}
      >
        <Box
          sx={{
            display: "grid",
            placeItems: "center",
            width: 44,
            height: 44,
            borderRadius: 1.25,
            bgcolor: (t) =>
              t.palette.mode === "dark"
                ? "rgba(183, 148, 204, 0.14)"
                : "rgba(91, 44, 111, 0.08)",
          }}
        >
          <Icon
            sx={{ fontSize: 26, color: "primary.main", opacity: 0.95 }}
            aria-hidden
          />
        </Box>
        {groupLabel ? (
          <Typography
            sx={{
              color: "text.secondary",
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.02em"
            }}>
            {groupLabel}
          </Typography>
        ) : null}
      </Box>
      <Box
        component="ol"
        sx={{
          m: 0,
          p: 0,
          listStyle: "none",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          flex: "1 1 auto",
          minWidth: 0,
          rowGap: 0.75,
        }}
      >
        {nodes.map((node, i) => (
          <Box
            key={node.field}
            component="li"
            sx={{
              flex: "1 1 0",
              minWidth: 108,
              display: "flex",
              alignItems: "center",
            }}
          >
            {i > 0 ? (
              <Box
                aria-hidden
                sx={{
                  px: 0.85,
                  color: "primary.main",
                  opacity: 0.45,
                  fontSize: "1.15rem",
                  fontWeight: 300,
                  userSelect: "none",
                  lineHeight: 1,
                }}
              >
                →
              </Box>
            ) : null}
            <Box sx={{ minWidth: 0, py: 0.1, flex: "1 1 auto" }}>
              <Typography
                sx={{
                  color: "text.secondary",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  lineHeight: 1.3
                }}>
                {node.label}
                <CiteSup
                  field={node.field}
                  label={node.label}
                  refs={refs}
                  onCite={onCite}
                />
              </Typography>
              {onTaxonomyBrowse ? (
                <Link
                  component="button"
                  type="button"
                  underline="hover"
                  onClick={() =>
                    onTaxonomyBrowse({
                      rank: node.field,
                      value: node.value,
                    })
                  }
                  aria-label={
                    taxonomyActive?.rank === node.field &&
                    taxonomyActive.value === node.value
                      ? `Clear ${node.label} filter ${node.value}`
                      : `Show other parasites in ${node.label} ${node.value}`
                  }
                  aria-pressed={
                    taxonomyActive?.rank === node.field &&
                    taxonomyActive.value === node.value
                  }
                  sx={{
                    display: "inline",
                    fontSize: "1.08rem",
                    lineHeight: 1.35,
                    mt: 0.15,
                    fontStyle: "italic",
                    fontWeight: 600,
                    textAlign: "left",
                    color:
                      taxonomyActive?.rank === node.field &&
                      taxonomyActive.value === node.value
                        ? "primary.main"
                        : "text.primary",
                  }}
                >
                  {node.value}
                </Link>
              ) : (
                <Typography
                  sx={{
                    fontSize: "1.08rem",
                    lineHeight: 1.35,
                    mt: 0.15,
                    fontStyle: "italic",
                    fontWeight: 600,
                  }}
                >
                  {node.value}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
