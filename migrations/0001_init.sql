-- GitHub only retains 14 days of traffic data and exposes it as daily
-- aggregates only (no per-clone identity exists to capture — cloning a
-- public repo is anonymous). These tables are the permanent record; each
-- daily poll appends to them so nothing is lost once GitHub's own window
-- rolls past it.

CREATE TABLE gh_clone_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  uniques INTEGER NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE gh_view_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  uniques INTEGER NOT NULL,
  captured_at TEXT NOT NULL
);

-- Referrers/paths are only ever exposed by GitHub as a "top 10 over the last
-- 14 days" snapshot, not broken out by day — so each poll just logs the
-- snapshot it saw, timestamped, rather than one row per day.
CREATE TABLE gh_referrer_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL,
  referrer TEXT NOT NULL,
  count INTEGER NOT NULL,
  uniques INTEGER NOT NULL
);

CREATE TABLE gh_path_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  count INTEGER NOT NULL,
  uniques INTEGER NOT NULL
);

-- Single row (id=1), tracks the last clone count we already emailed about so
-- a re-poll on the same day (or a retried cron) never sends a duplicate email.
CREATE TABLE gh_notify_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_notified_date TEXT,
  last_notified_count INTEGER
);
INSERT INTO gh_notify_state (id, last_notified_date, last_notified_count) VALUES (1, NULL, 0);
