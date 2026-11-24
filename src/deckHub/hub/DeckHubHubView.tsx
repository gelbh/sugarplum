import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CompositionSpark } from "../../materials";
import ClaimCoverageFilmstrip, {
  type ClaimJumpTarget,
} from "./ClaimCoverageFilmstrip";
import DeckHubTitleHeader from "./DeckHubTitleHeader";
import MissionBoard, { type MissionTileId } from "./MissionBoard";
import type {
  ClaimCoverage,
  Deck,
  StoredCoverRow,
  Subject,
  SubjectKnowledge,
} from "../../api/client";

export type DeckHubHubViewProps = {
  deck: Deck | null;
  subject: Subject | null;
  cover: StoredCoverRow | null;
  guest: boolean;
  acceptedCount: number;
  draftJobCount: number;
  materialCount: number;
  composition: SubjectKnowledge | null;
  claimCoverage: ClaimCoverage | null;
  error: string | null;
  notice: string | null;
  exportWarning: string | null;
  onClearNotice: () => void;
  onClearExportWarning: () => void;
  exportBusy: boolean;
  onExportAnki: () => void;
  onRename: () => void;
  onDelete: () => void;
  onChangeCover: () => void;
  onOpenWorkshop: (id: MissionTileId) => void;
  onJumpToClaimCard: (target: ClaimJumpTarget) => void;
};

export default function DeckHubHubView({
  deck,
  subject,
  cover,
  guest,
  acceptedCount,
  draftJobCount,
  materialCount,
  composition,
  claimCoverage,
  error,
  notice,
  exportWarning,
  onClearNotice,
  onClearExportWarning,
  exportBusy,
  onExportAnki,
  onRename,
  onDelete,
  onChangeCover,
  onOpenWorkshop,
  onJumpToClaimCard,
}: DeckHubHubViewProps) {
  return (
    <>
      <Box sx={{ flexShrink: 0 }}>
        {deck ? (
          <DeckHubTitleHeader
            title={deck.title}
            cover={cover}
            coverKey={deck.id}
            guest={guest}
            crumbs={[
              { label: "Library", href: "/library" },
              ...(subject
                ? [
                    {
                      label: subject.title,
                      href: `/library/subjects/${encodeURIComponent(subject.id)}`,
                    },
                  ]
                : []),
            ]}
            metaLine={[
              acceptedCount > 0
                ? acceptedCount === 1
                  ? "1 accepted card"
                  : `${acceptedCount} accepted cards`
                : null,
              draftJobCount > 0
                ? `${draftJobCount} draft job${draftJobCount === 1 ? "" : "s"}`
                : null,
              claimCoverage != null && claimCoverage.summary.total > 0
                ? `${claimCoverage.summary.linked}/${claimCoverage.summary.total} claims`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            spark={
              (composition != null && composition.total > 0) ||
              (claimCoverage != null && claimCoverage.summary.total > 0) ? (
                <Stack spacing={0} sx={{ alignItems: "flex-start" }}>
                  {composition != null && composition.total > 0 ? (
                    <CompositionSpark
                      new={composition.new}
                      learning={composition.learning}
                      young={composition.young}
                      mature={composition.mature}
                      total={composition.total}
                    />
                  ) : null}
                  <ClaimCoverageFilmstrip
                    coverage={claimCoverage}
                    onJumpToCard={onJumpToClaimCard}
                  />
                </Stack>
              ) : null
            }
            exportBusy={exportBusy}
            exportDisabled={acceptedCount === 0}
            onExportAnki={onExportAnki}
            onRename={onRename}
            onDelete={onDelete}
            onChangeCover={onChangeCover}
            onStudy={
              acceptedCount > 0 ? () => onOpenWorkshop("study") : undefined
            }
          />
        ) : (
          <Typography
            variant="h3"
            component="h1"
            sx={{
              m: 0,
              fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
              fontWeight: 400,
              letterSpacing: "0.02em",
              lineHeight: 1.1,
            }}
          >
            Deck
          </Typography>
        )}
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {notice ? (
        <Alert severity="success" onClose={onClearNotice}>
          {notice}
        </Alert>
      ) : null}
      {exportWarning ? (
        <Alert severity="warning" onClose={onClearExportWarning}>
          {exportWarning}
        </Alert>
      ) : null}

      {deck ? (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            animation: "deckHubBoardIn 280ms cubic-bezier(0.2, 0, 0, 1)",
            "@keyframes deckHubBoardIn": {
              from: { opacity: 0, transform: "translateX(-24px)" },
              to: { opacity: 1, transform: "translateX(0)" },
            },
            "@media (prefers-reduced-motion: reduce)": {
              animation: "none",
            },
          }}
        >
          <MissionBoard
            draftCount={draftJobCount}
            cardCount={acceptedCount}
            materialCount={materialCount}
            emptyDeck={acceptedCount === 0 && draftJobCount === 0}
            onOpen={onOpenWorkshop}
          />
        </Box>
      ) : null}
    </>
  );
}
