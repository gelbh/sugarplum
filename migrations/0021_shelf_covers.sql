CREATE TABLE shelf_covers (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('subject', 'deck')),
  owner_id TEXT NOT NULL,
  photo_id TEXT NOT NULL,
  image_url TEXT NOT NULL,
  photographer_name TEXT NOT NULL,
  photographer_url TEXT NOT NULL,
  photo_html_url TEXT NOT NULL,
  PRIMARY KEY (user_id, owner_kind, owner_id)
);
