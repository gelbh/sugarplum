import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type {
  Deck,
  JobListItem,
  StoredCoverRow,
  Subject,
  SubjectCompositionSummary,
} from "../api/client";
import { effectiveSubjectDeckCount } from "../subjects/subjectDeleteGuard";
import BoardTile from "./board/BoardTile";
import LibraryBoard from "./board/LibraryBoard";
import { coverPlaceholderColor } from "./board/coverPlaceholder";
import MagazineEmptyStage from "./MagazineEmptyStage";

type Props = {
  subjects: Subject[];
  decks: Deck[];
  covers: StoredCoverRow[];
  compositionBySubject: Record<
    string,
    Omit<SubjectCompositionSummary, "subjectId">
  >;
  draftJobs?: JobListItem[];
  selectMode: boolean;
  selectedDeckIdSet: Set<string>;
  orphanDecks: Deck[];
  toggleSubjectDecks: (subjectId: string) => void;
  toggleDeckSelected: (deckId: string) => void;
  setSubjectMenu: (value: { anchor: HTMLElement; subject: Subject }) => void;
  onCreateSubject?: () => void;
};

export function LibraryShelf({
  subjects,
  decks,
  covers,
  compositionBySubject,
  draftJobs = [],
  selectMode,
  selectedDeckIdSet,
  orphanDecks,
  toggleSubjectDecks,
  toggleDeckSelected,
  setSubjectMenu,
  onCreateSubject,
}: Props) {
  function localDeckCountForSubject(subjectId: string) {
    return decks.filter((d) => d.subject_id === subjectId).length;
  }

  const draftCountBySubject = new Map<string, number>();
  for (const job of draftJobs) {
    const subjectId = decks.find((d) => d.id === job.deck_id)?.subject_id;
    if (!subjectId) continue;
    draftCountBySubject.set(
      subjectId,
      (draftCountBySubject.get(subjectId) ?? 0) + job.draft_count,
    );
  }

  const emptyShelf = subjects.length === 0;

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        ...(emptyShelf && !selectMode
          ? {
              justifyContent: "center",
              alignItems: "center",
            }
          : {}),
      }}
    >
      {emptyShelf && !selectMode ? (
        <MagazineEmptyStage
          title="Start with a subject"
          description="Subjects group your decks, like Anatomy or Pharmacology. Add one, then open it to create decks and study material."
          boardAriaLabel="Subjects"
          {...(onCreateSubject
            ? {
                create: {
                  title: "New subject",
                  meta: "Name it, then add decks inside",
                  openLabel: "New subject",
                  onCreate: onCreateSubject,
                },
              }
            : {})}
        />
      ) : (
        <LibraryBoard aria-label="Subjects">
          {subjects.map((s) => {
            const localCount = localDeckCountForSubject(s.id);
            const deckCount = effectiveSubjectDeckCount(s, localCount);
            const subjectDecks = decks.filter((d) => d.subject_id === s.id);
            const selectedChildCount = subjectDecks.filter((d) =>
              selectedDeckIdSet.has(d.id),
            ).length;
            const subjectFullySelected =
              subjectDecks.length > 0 &&
              selectedChildCount === subjectDecks.length;
            const subjectPartiallySelected =
              selectedChildCount > 0 && !subjectFullySelected;
            const meta =
              deckCount === 0
                ? "No decks yet"
                : deckCount === 1
                  ? "1 deck"
                  : `${deckCount} decks`;
            const href = `/library/subjects/${encodeURIComponent(s.id)}`;
            const composition = compositionBySubject[s.id];
            const cover = covers.find(
              (c) => c.ownerKind === "subject" && c.ownerId === s.id,
            );
            const recall =
              composition != null &&
              composition.total > 0 &&
              composition.avgRetrievability != null
                ? `${Math.round(100 * composition.avgRetrievability)}% recall`
                : null;
            const draftCount = draftCountBySubject.get(s.id) ?? 0;
            const reviewNotice =
              draftCount <= 0
                ? null
                : draftCount === 1
                  ? "1 to check"
                  : `${draftCount} to check`;
            return (
              <Box
                key={s.id}
                component="li"
                sx={{ listStyle: "none", m: 0, p: 0, minHeight: 0 }}
              >
                <BoardTile
                  title={s.title}
                  meta={[meta, recall].filter(Boolean).join(" · ") || meta}
                  index={subjects.indexOf(s)}
                  imageSrc={cover?.imageUrl}
                  placeholderColor={coverPlaceholderColor(s.id)}
                  href={href}
                  openLabel={
                    reviewNotice
                      ? `Open subject ${s.title}, ${reviewNotice}`
                      : `Open subject ${s.title}`
                  }
                  notice={reviewNotice}
                  moreLabel={`More actions for ${s.title}`}
                  onMore={(ev) => {
                    setSubjectMenu({
                      anchor: ev.currentTarget,
                      subject: s,
                    });
                  }}
                  select={
                    selectMode
                      ? {
                          checked: subjectFullySelected,
                          indeterminate: subjectPartiallySelected,
                          disabled: subjectDecks.length === 0,
                          onChange: () => toggleSubjectDecks(s.id),
                          inputLabel: `Select all decks in ${s.title}`,
                        }
                      : undefined
                  }
                  footer={
                    selectMode && subjectDecks.length > 0 ? (
                      <Stack
                        component="ul"
                        spacing={0}
                        sx={{
                          m: 0,
                          mt: 0.5,
                          width: "100%",
                          listStyle: "none",
                          maxHeight: 96,
                          overflow: "auto",
                        }}
                      >
                        {subjectDecks.map((deck) => (
                          <Box
                            component="li"
                            key={deck.id}
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                              py: 0.25,
                            }}
                          >
                            <Checkbox
                              size="small"
                              checked={selectedDeckIdSet.has(deck.id)}
                              onChange={() => toggleDeckSelected(deck.id)}
                              inputProps={{
                                "aria-label": `Select deck ${deck.title}`,
                              }}
                            />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {deck.title}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    ) : null
                  }
                />
              </Box>
            );
          })}
          {!selectMode && onCreateSubject ? (
            <Box
              component="li"
              sx={{ listStyle: "none", m: 0, p: 0, minHeight: 0 }}
            >
              <BoardTile
                index={subjects.length}
                title="New subject"
                create
                onCreate={onCreateSubject}
                openLabel="New subject"
              />
            </Box>
          ) : null}
        </LibraryBoard>
      )}
      {selectMode && orphanDecks.length > 0 ? (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 0.5 }}
          >
            Decks without a subject
          </Typography>
          <Stack
            component="ul"
            spacing={0}
            sx={{ m: 0, p: 0, listStyle: "none" }}
          >
            {orphanDecks.map((deck) => (
              <Box
                component="li"
                key={deck.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  py: 0.25,
                }}
              >
                <Checkbox
                  size="small"
                  checked={selectedDeckIdSet.has(deck.id)}
                  onChange={() => toggleDeckSelected(deck.id)}
                  inputProps={{
                    "aria-label": `Select deck ${deck.title}`,
                  }}
                />
                <Typography variant="body2">{deck.title}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Box>
  );
}
