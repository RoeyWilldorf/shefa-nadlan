CREATE TABLE office_comparables (
  id TEXT PRIMARY KEY NOT NULL,
  property_id TEXT NOT NULL REFERENCES office_properties(id),
  deal TEXT NOT NULL CHECK(deal IN ('sale','rent')),
  deal_date TEXT NOT NULL,
  price INTEGER NOT NULL CHECK(price > 0),
  area REAL CHECK(area > 0),
  rooms REAL CHECK(rooms > 0),
  area_label TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  archived_at TEXT
);
--> statement-breakpoint
CREATE INDEX office_comparables_by_property ON office_comparables(property_id,deal,archived_at,deal_date DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX office_comparables_active_source ON office_comparables(property_id,deal,deal_date,source_url,source_ref) WHERE archived_at IS NULL;
