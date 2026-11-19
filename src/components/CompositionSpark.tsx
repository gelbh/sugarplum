import Box from "@mui/material/Box";
import type { SubjectKnowledgeBuckets } from "../study/subjectKnowledge";

export type CompositionSparkProps = SubjectKnowledgeBuckets & {
  total: number;
  height?: number;
  maxWidth?: number | string;
};

/** Operate-safe stage ladder (not Anki traffic lights). */
export const COMPOSITION_SEGMENT_COLORS = {
  mature: "#5B2C6F",
  young: "rgba(91, 44, 111, 0.55)",
  learning: "#C4A574",
  new: "#bdbdbd",
} as const;

const SEGMENTS: {
  key: keyof SubjectKnowledgeBuckets;
  color: string;
}[] = [
  { key: "mature", color: COMPOSITION_SEGMENT_COLORS.mature },
  { key: "young", color: COMPOSITION_SEGMENT_COLORS.young },
  { key: "learning", color: COMPOSITION_SEGMENT_COLORS.learning },
  { key: "new", color: COMPOSITION_SEGMENT_COLORS.new },
];

export default function CompositionSpark({
  new: newCount,
  learning,
  young,
  mature,
  total,
  height = 4,
  maxWidth = 120,
}: CompositionSparkProps) {
  if (total <= 0) return null;

  const counts = { new: newCount, learning, young, mature };

  return (
    <Box
      role="img"
      aria-label={`${mature} mature, ${young} young, ${learning} learning, ${newCount} new`}
      sx={{
        display: "flex",
        height,
        borderRadius: height >= 8 ? 1 : 0.5,
        overflow: "hidden",
        bgcolor: "action.hover",
        mt: height >= 8 ? 0 : 0.5,
        maxWidth,
        // Without width, flexGrow segments collapse to minWidth (2px).
        width: maxWidth,
      }}
    >
      {SEGMENTS.map(({ key, color }) => {
        const count = counts[key];
        if (count <= 0) return null;
        return (
          <Box
            key={key}
            sx={{
              flexGrow: count,
              flexBasis: 0,
              bgcolor: color,
              minWidth: 2,
            }}
          />
        );
      })}
    </Box>
  );
}
