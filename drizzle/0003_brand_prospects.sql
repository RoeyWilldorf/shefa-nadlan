ALTER TABLE office_media ADD COLUMN already_branded INTEGER NOT NULL DEFAULT 0 CHECK (already_branded IN (0,1));
--> statement-breakpoint
CREATE TABLE office_prospects (
  id TEXT PRIMARY KEY NOT NULL,
  match_key TEXT UNIQUE,
  town TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  deal TEXT NOT NULL CHECK(deal IN ('sale','rent')),
  kind TEXT NOT NULL,
  price INTEGER,
  rooms REAL,
  area REAL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  classification TEXT NOT NULL CHECK(classification IN ('unknown','likely','verified','broker')),
  evidence TEXT NOT NULL DEFAULT '',
  permission TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','followup','contacted','responded','closed','optout')),
  assigned_to TEXT NOT NULL DEFAULT '',
  followup TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE office_prospect_sources (
  url TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL REFERENCES office_prospects(id),
  source_name TEXT NOT NULL,
  posted_on TEXT,
  added_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX office_prospect_window ON office_prospects(classification,created_at);
