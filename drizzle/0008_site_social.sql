CREATE TABLE IF NOT EXISTS site_social (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  page_token TEXT NOT NULL,
  ig_id TEXT NOT NULL DEFAULT '',
  ig_username TEXT NOT NULL DEFAULT '',
  pages_json TEXT NOT NULL DEFAULT '[]',
  auto INTEGER NOT NULL DEFAULT 1,
  connected_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS site_social_posts (
  property_id TEXT NOT NULL,
  network TEXT NOT NULL,
  post_id TEXT,
  error TEXT,
  at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS site_social_posts_property ON site_social_posts (property_id);
