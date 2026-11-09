import Box from "@mui/material/Box";
import type { SubjectKnowledgeBuckets } from "../study/subjectKnowledge";

type Props = SubjectKnowledgeBuckets & {
  total: number;
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
}: Props) {
  if (total <= 0) return null;

  const counts = { new: newCount, learning, young, mature };

  return (
    <Box
      role="img"
      aria-label={`${mature} mature, ${young} young, ${learning} learning, ${newCount} new`}
      sx={{
        display: "flex",
        height: 4,
        borderRadius: 0.5,
        overflow: "hidden",
        bgcolor: "action.hover",
        mt: 0.5,
        maxWidth: 120,
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
              minWidth: count > 0 ? 2 : 0,
            }}
          />
        );
      })}
    </Box>
  );
}
