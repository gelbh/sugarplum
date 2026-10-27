-- Backfill decks.subject_id from subject_hint (account/D1).
-- Mirrors guest migrateStore (hint → subject title / Unfiled).
-- Group: user_id + trim(hint) or 'Unfiled'; reuse existing subject title when
-- present; otherwise insert. Clear subject_hint after attach.
-- After this, production rows should all have subject_id. Enforcing NOT NULL
-- needs a decks table rebuild in a follow-up migration (SQLite/D1 limit).

INSERT INTO subjects (id, user_id, title, created_at)
SELECT
  lower(hex(randomblob(16))),
  groups.user_id,
  groups.subject_title,
  groups.min_created_at
FROM (
  SELECT
    user_id,
    CASE
      WHEN subject_hint IS NULL OR trim(subject_hint) = '' THEN 'Unfiled'
      ELSE trim(subject_hint)
    END AS subject_title,
    MIN(created_at) AS min_created_at
  FROM decks
  WHERE subject_id IS NULL
  GROUP BY
    user_id,
    CASE
      WHEN subject_hint IS NULL OR trim(subject_hint) = '' THEN 'Unfiled'
      ELSE trim(subject_hint)
    END
) AS groups
WHERE NOT EXISTS (
  SELECT 1
  FROM subjects s
  WHERE s.user_id = groups.user_id
    AND s.title = groups.subject_title
);

UPDATE decks
SET
  subject_id = (
    SELECT s.id
    FROM subjects s
    WHERE s.user_id = decks.user_id
      AND s.title = CASE
        WHEN decks.subject_hint IS NULL OR trim(decks.subject_hint) = ''
          THEN 'Unfiled'
        ELSE trim(decks.subject_hint)
      END
    ORDER BY s.created_at ASC, s.id ASC
    LIMIT 1
  ),
  subject_hint = NULL
WHERE subject_id IS NULL;
