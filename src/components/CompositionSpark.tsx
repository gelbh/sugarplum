import Box from "@mui/material/Box";
import type { SubjectKnowledgeBuckets } from "../study/subjectKnowledge";

export type CompositionSparkProps = SubjectKnowledgeBuckets & {
  total: number;
  height?: number;
  maxWidth?: number | string;
};

const SEGMENTS: {
  key: keyof SubjectKnowledgeBuckets;
  color: string;
}[] = [
  { key: "mature", color: "success.main" },
  { key: "young", color: "info.main" },
  { key: "learning", color: "warning.main" },
  { key: "new", color: "grey.400" },
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
        width: maxWidth === "100%" ? "100%" : undefined,
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
