CREATE TABLE office_visit_settings (
  id INTEGER PRIMARY KEY CHECK (id=1),
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE office_visit_forms (
  id TEXT PRIMARY KEY NOT NULL,
  lead_id TEXT NOT NULL REFERENCES office_leads(id),
  visitor_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('signed','pending','withdrawn')),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  signed_at TEXT,
  UNIQUE (lead_id, version)
);
--> statement-breakpoint
CREATE UNIQUE INDEX office_visit_single_proposal ON office_visit_forms (lead_id) WHERE status='pending';
