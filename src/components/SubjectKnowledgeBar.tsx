import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SubjectKnowledge } from "../api/client";

type Props = {
  knowledge: SubjectKnowledge;
};

const SEGMENTS: {
  key: keyof Pick<
    SubjectKnowledge,
    "mature" | "young" | "learning" | "new"
  >;
  color: string;
}[] = [
  { key: "mature", color: "success.main" },
  { key: "young", color: "info.main" },
  { key: "learning", color: "warning.main" },
  { key: "new", color: "grey.400" },
];

export default function SubjectKnowledgeBar({ knowledge }: Props) {
  if (knowledge.total === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No accepted cards yet
      </Typography>
    );
  }

  return (
    <Stack spacing={0.75} sx={{ mt: 1.5 }}>
      <Box
        role="img"
        aria-label={`${knowledge.mature} mature, ${knowledge.young} young, ${knowledge.learning} learning, ${knowledge.new} new`}
        sx={{
          display: "flex",
          height: 8,
          borderRadius: 1,
          overflow: "hidden",
          bgcolor: "action.hover",
        }}
      >
        {SEGMENTS.map(({ key, color }) => {
          const count = knowledge[key];
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
      <Typography variant="caption" color="text.secondary">
        {knowledge.mature} mature · {knowledge.young} young ·{" "}
        {knowledge.learning} learning · {knowledge.new} new
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {knowledge.graduated} / {knowledge.total} graduated (
        {knowledge.graduatedPct}%)
      </Typography>
    </Stack>
  );
}
