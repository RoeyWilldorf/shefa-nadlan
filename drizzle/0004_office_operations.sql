CREATE TABLE office_lead_events (
  id TEXT PRIMARY KEY NOT NULL,
  lead_id TEXT NOT NULL REFERENCES office_leads(id),
  kind TEXT NOT NULL CHECK(kind IN ('routing','update','note')),
  summary TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX lead_events_by_lead ON office_lead_events(lead_id,at DESC);
--> statement-breakpoint
CREATE TABLE office_property_changes (
  property_id TEXT NOT NULL REFERENCES office_properties(id),
  version INTEGER NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  old_price INTEGER,
  new_price INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY(property_id,version)
);
--> statement-breakpoint
CREATE TABLE office_deals (
  id TEXT PRIMARY KEY NOT NULL,
  property_id TEXT NOT NULL REFERENCES office_properties(id),
  lead_id TEXT REFERENCES office_leads(id),
  stage TEXT NOT NULL CHECK(stage IN ('offer','negotiation','closed','cancelled')),
  price_cents INTEGER NOT NULL CHECK(price_cents>=0),
  commission_cents INTEGER NOT NULL CHECK(commission_cents>=0),
  paid_cents INTEGER NOT NULL CHECK(paid_cents BETWEEN 0 AND commission_cents),
  expenses_cents INTEGER NOT NULL CHECK(expenses_cents>=0),
  allocations TEXT NOT NULL,
  notes TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX deals_by_property ON office_deals(property_id,updated_at DESC);
--> statement-breakpoint
CREATE TABLE office_document_refs (
  serial INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id TEXT UNIQUE REFERENCES office_visit_forms(id),
  property_id TEXT REFERENCES office_properties(id),
  draft_body TEXT,
  at TEXT NOT NULL,
  CHECK((visit_id IS NOT NULL AND draft_body IS NULL) OR (property_id IS NOT NULL AND draft_body IS NOT NULL AND visit_id IS NULL))
);
--> statement-breakpoint
CREATE INDEX document_refs_property ON office_document_refs(property_id,serial DESC);
