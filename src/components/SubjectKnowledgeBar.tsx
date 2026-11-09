import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SubjectKnowledge } from "../api/client";
import CompositionSpark from "./CompositionSpark";

type Props = {
  knowledge: SubjectKnowledge;
};

function formatEtkCards(etk: number): string {
  const rounded = Math.round(etk * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export default function SubjectKnowledgeBar({ knowledge }: Props) {
  if (knowledge.total === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No accepted cards yet
      </Typography>
    );
  }

  const showReviewedClause = knowledge.recallCardCount < knowledge.total;

  return (
    <Stack spacing={0.75} sx={{ mt: 1.5 }}>
      <CompositionSpark
        new={knowledge.new}
        learning={knowledge.learning}
        young={knowledge.young}
        mature={knowledge.mature}
        total={knowledge.total}
        height={8}
        maxWidth="100%"
      />
      <Typography variant="caption" color="text.secondary">
        {knowledge.mature} mature · {knowledge.young} young ·{" "}
        {knowledge.learning} learning · {knowledge.new} new
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {knowledge.graduated} / {knowledge.total} graduated (
        {knowledge.graduatedPct}%)
      </Typography>
      {knowledge.avgRetrievability != null ? (
        <Typography variant="caption" color="text.secondary">
          Estimated recall now:{" "}
          {Math.round(100 * knowledge.avgRetrievability)}%
          {showReviewedClause
            ? ` of ${knowledge.recallCardCount} reviewed`
            : ""}{" "}
          · ~{formatEtkCards(knowledge.etk)} cards
        </Typography>
      ) : null}
    </Stack>
  );
}
