CREATE TABLE office_properties (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  town TEXT NOT NULL,
  neighborhood TEXT NOT NULL DEFAULT '',
  deal TEXT NOT NULL CHECK (deal IN ('sale','rent')),
  property_type TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  rooms REAL,
  area REAL,
  description TEXT NOT NULL DEFAULT '',
  specs_json TEXT NOT NULL DEFAULT '{}',
  internal_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','pending','negotiation','sold','rented','archived')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX office_property_catalog ON office_properties (status, published_at);
--> statement-breakpoint
CREATE TABLE property_prices (
  property_id TEXT NOT NULL REFERENCES office_properties(id),
  version INTEGER NOT NULL,
  price INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (property_id, version)
);
--> statement-breakpoint
CREATE TABLE office_media (
  id TEXT PRIMARY KEY NOT NULL,
  property_id TEXT NOT NULL REFERENCES office_properties(id),
  object_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  mime TEXT NOT NULL,
  public_photo INTEGER NOT NULL DEFAULT 0 CHECK (public_photo IN (0,1)),
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX office_media_property ON office_media (property_id, public_photo, created_at);
--> statement-breakpoint
CREATE TABLE office_contacts (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE office_leads (
  id TEXT PRIMARY KEY NOT NULL,
  contact_id TEXT NOT NULL REFERENCES office_contacts(id),
  property_id TEXT,
  intent TEXT NOT NULL,
  source TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','matched','tour','negotiation','closed','lost')),
  profile_json TEXT NOT NULL DEFAULT '{}',
  assigned_to TEXT NOT NULL DEFAULT '',
  consent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE INDEX office_lead_activity ON office_leads (stage, updated_at);
--> statement-breakpoint
CREATE TABLE office_work (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('task','tour')),
  status TEXT NOT NULL CHECK (status IN ('open','done','cancelled')),
  property_id TEXT REFERENCES office_properties(id),
  lead_id TEXT REFERENCES office_leads(id),
  assigned_to TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  ends_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX office_work_schedule ON office_work (kind,status,starts_at);
--> statement-breakpoint
CREATE TRIGGER office_work_conflict_insert BEFORE INSERT ON office_work WHEN NEW.kind='tour' AND NEW.status='open'
BEGIN
  SELECT RAISE(ABORT,'schedule_conflict') WHERE EXISTS (
    SELECT 1 FROM office_work WHERE kind='tour' AND status='open' AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at
      AND (assigned_to=NEW.assigned_to OR property_id=NEW.property_id)
  );
END;
--> statement-breakpoint
CREATE TRIGGER office_work_conflict_update BEFORE UPDATE ON office_work WHEN NEW.kind='tour' AND NEW.status='open'
BEGIN
  SELECT RAISE(ABORT,'schedule_conflict') WHERE EXISTS (
    SELECT 1 FROM office_work WHERE id<>NEW.id AND kind='tour' AND status='open'
      AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at AND (assigned_to=NEW.assigned_to OR property_id=NEW.property_id)
  );
END;
--> statement-breakpoint
CREATE TABLE office_marketing (
  property_id TEXT NOT NULL REFERENCES office_properties(id),
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (property_id, channel)
);
--> statement-breakpoint
CREATE TABLE office_audit (
  id TEXT PRIMARY KEY NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX office_audit_date ON office_audit (at);
