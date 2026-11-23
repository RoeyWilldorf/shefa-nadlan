CREATE TABLE IF NOT EXISTS site_page_views (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS site_sources (
  day TEXT NOT NULL,
  source TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, source)
);
