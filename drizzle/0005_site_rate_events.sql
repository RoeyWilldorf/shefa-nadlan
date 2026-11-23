CREATE TABLE IF NOT EXISTS site_rate_events (
  kind TEXT NOT NULL,
  ip TEXT NOT NULL,
  at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS site_rate_events_lookup ON site_rate_events (kind, ip, at);
