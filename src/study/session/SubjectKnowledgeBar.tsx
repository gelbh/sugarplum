import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SubjectKnowledge } from "../../api/client";

type SegmentColors = {
  mature: string;
  young: string;
  learning: string;
  new: string;
};

type Props = {
  knowledge: SubjectKnowledge;
  /** Routes compose CompositionSpark from materials. */
  spark: ReactNode;
  /** Legend swatches; usually COMPOSITION_SEGMENT_COLORS from materials. */
  segmentColors: SegmentColors;
};

function formatEtkCards(etk: number): string {
  const rounded = Math.round(etk * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export default function SubjectKnowledgeBar({
  knowledge,
  spark,
  segmentColors,
}: Props) {
  if (knowledge.total === 0) {
    return (
      <Typography variant="body2" sx={{
        color: "text.secondary"
      }}>No accepted cards yet
              </Typography>
    );
  }

  const recallPct =
    knowledge.avgRetrievability != null
      ? Math.round(100 * knowledge.avgRetrievability)
      : null;

  const legend: {
    key: keyof Pick<SubjectKnowledge, "mature" | "young" | "learning" | "new">;
    label: string;
    color: string;
  }[] = [
    { key: "mature", label: "Mature", color: segmentColors.mature },
    { key: "young", label: "Young", color: segmentColors.young },
    { key: "learning", label: "Learning", color: segmentColors.learning },
    { key: "new", label: "New", color: segmentColors.new },
  ];

  return (
    <Stack spacing={1} sx={{ maxWidth: 360 }}>
      {spark}
      <Stack
        direction="row"
        useFlexGap
        sx={{
          flexWrap: "wrap",
          gap: 1.25,
          rowGap: 0.5
        }}>
        {legend.map(({ key, label, color }) => {
          const count = knowledge[key];
          if (count <= 0) return null;
          return (
            <Stack
              key={key}
              direction="row"
              spacing={0.5}
              sx={{
                alignItems: "center",
                minWidth: 0
              }}>
              <Box
                aria-hidden
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: color,
                  flexShrink: 0,
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                }}
              >
                {count} {label.toLowerCase()}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
      <Stack
        direction="row"
        spacing={2.5}
        useFlexGap
        sx={{
          flexWrap: "wrap",
          pt: 0.25
        }}>
        <Box>
          <Typography
            component="p"
            sx={{
              m: 0,
              fontSize: "0.625rem",
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "text.secondary",
            }}
          >
            Graduated
          </Typography>
          <Typography
            variant="body2"
            sx={{
              mt: 0.25,
              fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
              letterSpacing: "0.02em",
              color: "text.primary",
            }}
          >
            {knowledge.graduatedPct ?? 0}%
            <Box
              component="span"
              sx={{
                ml: 0.75,
                color: "text.secondary",
                fontFamily: "inherit",
                fontSize: "0.8125rem",
              }}
            >
              {knowledge.graduated}/{knowledge.total}
            </Box>
          </Typography>
        </Box>
        {recallPct != null ? (
          <Box>
            <Typography
              component="p"
              sx={{
                m: 0,
                fontSize: "0.625rem",
                fontWeight: 500,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "text.secondary",
              }}
            >
              Estimated recall
            </Typography>
            <Typography
              variant="body2"
              sx={{
                mt: 0.25,
                fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
                letterSpacing: "0.02em",
                color: "text.primary",
              }}
            >
              {recallPct}%
              <Box
                component="span"
                sx={{
                  ml: 0.75,
                  color: "text.secondary",
                  fontFamily: "inherit",
                  fontSize: "0.8125rem",
                }}
              >
                ~{formatEtkCards(knowledge.etk)} cards
              </Box>
            </Typography>
          </Box>
        ) : null}
      </Stack>
    </Stack>
  );
}
