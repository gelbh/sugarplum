-- Dataset-origin overlays store only the fields the learner changed, so later
-- dataset fixes still reach them. NULL overrides on an origin row mean a legacy
-- full copy in fields_json (read path diffs it; the admin backfill persists it).
-- aliases_json is a JSON array of learner aliases; NULL means none.

ALTER TABLE atlas_entries ADD COLUMN field_overrides_json TEXT;
ALTER TABLE atlas_entries ADD COLUMN aliases_json TEXT;
