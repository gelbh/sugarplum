import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CompositionSpark from "../components/CompositionSpark";
import EmptyNext from "../components/EmptyNext";
import ShelfVolume from "../components/ShelfVolume";
import type {
  Deck,
  StoredCoverRow,
  Subject,
  SubjectCompositionSummary,
} from "../api/client";
import { navigate } from "../nav/navigate";
import { effectiveSubjectDeckCount } from "../subjects/subjectDeleteGuard";
import { formatEtkTooltip } from "./formatEtkTooltip";

type Props = {
  subjects: Subject[];
  decks: Deck[];
  covers: StoredCoverRow[];
  compositionBySubject: Record<
    string,
    Omit<SubjectCompositionSummary, "subjectId">
  >;
  showCreateFlow: boolean;
  setShowCreateFlow: (value: boolean) => void;
  selectMode: boolean;
  selectedDeckIdSet: Set<string>;
  orphanDecks: Deck[];
  toggleSubjectDecks: (subjectId: string) => void;
  toggleDeckSelected: (deckId: string) => void;
  setSubjectMenu: (value: {
    anchor: HTMLElement;
    subject: Subject;
  }) => void;
};

export function LibraryShelf({
  subjects,
  decks,
  covers,
  compositionBySubject,
  showCreateFlow,
  setShowCreateFlow,
  selectMode,
  selectedDeckIdSet,
  orphanDecks,
  toggleSubjectDecks,
  toggleDeckSelected,
  setSubjectMenu,
}: Props) {
  function localDeckCountForSubject(subjectId: string) {
    return decks.filter((d) => d.subject_id === subjectId).length;
  }

  return (
    <>
      {subjects.length === 0 ? (
        showCreateFlow ? (
          <Typography variant="body2" color="text.secondary">
            No subjects yet. Add your notes below to make the first one.
          </Typography>
        ) : (
          <EmptyNext
            title="No subjects yet"
            body="Create a subject and deck by adding your notes."
            primary={{
              label: "Add material",
              onClick: () => setShowCreateFlow(true),
            }}
          />
        )
      ) : (
      <Grid
        container
        component="ul"
        spacing={2}
        sx={{ listStyle: "none", p: 0, m: 0 }}
      >
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
          return (
            <Grid key={s.id} component="li" size={{ xs: 12, md: 6 }}>
              <ShelfVolume
                title={s.title}
                href={href}
                onNavigate={(ev) => {
                  if (
                    ev.defaultPrevented ||
                    ev.button !== 0 ||
                    ev.metaKey ||
                    ev.ctrlKey ||
                    ev.shiftKey ||
                    ev.altKey
                  ) {
                    return;
                  }
                  ev.preventDefault();
                  navigate(href);
                }}
                meta={meta}
                chip={
                  composition?.graduatedPct != null
                    ? `${composition.graduatedPct}% graduated`
                    : null
                }
                recallChip={
                  composition != null &&
                  composition.total > 0 &&
                  composition.avgRetrievability != null
                    ? `${Math.round(100 * composition.avgRetrievability)}% recall`
                    : null
                }
                recallTooltip={
                  composition != null &&
                  composition.total > 0 &&
                  composition.avgRetrievability != null
                    ? formatEtkTooltip(composition.etk)
                    : null
                }
                spark={
                  composition != null && composition.total > 0 ? (
                    <CompositionSpark
                      new={composition.new}
                      learning={composition.learning}
                      young={composition.young}
                      mature={composition.mature}
                      total={composition.total}
                    />
                  ) : null
                }
                studyLabel="Study"
                onStudy={() => {
                  navigate(`/study?subjectId=${encodeURIComponent(s.id)}`);
                }}
                cover={
                  covers.find(
                    (cover) =>
                      cover.ownerKind === "subject" && cover.ownerId === s.id,
                  ) ?? null
                }
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
              >
                {selectMode && subjectDecks.length > 0 ? (
                  <Stack
                    component="ul"
                    spacing={0}
                    sx={{
                      m: 0,
                      mt: 0.5,
                      mb: 0,
                      mr: 0,
                      ml: 0,
                      pl: 5,
                      pr: 0,
                      py: 0,
                      listStyle: "none",
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
                        <Typography variant="body2" color="text.secondary">
                          {deck.title}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                ) : null}
              </ShelfVolume>
            </Grid>
          );
        })}
      </Grid>
      )}
      {selectMode && orphanDecks.length > 0 ? (
        <Box>
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
    </>
  );
}
