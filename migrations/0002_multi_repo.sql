-- Multi-repo support. The existing tables only ever held 14 days of
-- all-zero placeholder data (no real clone activity yet), so nothing
-- meaningful is lost rebuilding them rather than migrating in place.
--
-- tracked_repos lists which repos to poll — same "config lives in D1, add
-- rows via wrangler d1 execute" pattern as the subnets table in pq-radar.
-- One GITHUB_TOKEN (fine-grained PAT) needs read access to every repo
-- listed here; add repos to the token's repository access list in GitHub's
-- UI when you add a row here.

DROP TABLE gh_clone_history;
DROP TABLE gh_view_history;
DROP TABLE gh_referrer_snapshots;
DROP TABLE gh_path_snapshots;
DROP TABLE gh_notify_state;

CREATE TABLE tracked_repos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  added_at TEXT NOT NULL
);

CREATE TABLE gh_clone_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  date TEXT NOT NULL,
  count INTEGER NOT NULL,
  uniques INTEGER NOT NULL,
  captured_at TEXT NOT NULL,
  UNIQUE(repo, date)
);

CREATE TABLE gh_view_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  date TEXT NOT NULL,
  count INTEGER NOT NULL,
  uniques INTEGER NOT NULL,
  captured_at TEXT NOT NULL,
  UNIQUE(repo, date)
);

-- Referrers/paths are only ever exposed by GitHub as a "top 10 over the last
-- 14 days" snapshot, not broken out by day — each poll just logs the
-- snapshot it saw, timestamped, per repo.
CREATE TABLE gh_referrer_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  referrer TEXT NOT NULL,
  count INTEGER NOT NULL,
  uniques INTEGER NOT NULL
);

CREATE TABLE gh_path_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT,
  count INTEGER NOT NULL,
  uniques INTEGER NOT NULL
);

-- One row per repo now instead of a single id=1 row — tracks the last
-- count already emailed about per repo, so a re-poll never double-sends.
CREATE TABLE gh_notify_state (
  repo TEXT PRIMARY KEY,
  last_notified_date TEXT,
  last_notified_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_clone_history_repo ON gh_clone_history(repo);
CREATE INDEX idx_view_history_repo ON gh_view_history(repo);
CREATE INDEX idx_referrer_snapshots_repo ON gh_referrer_snapshots(repo);
CREATE INDEX idx_path_snapshots_repo ON gh_path_snapshots(repo);

-- Seed with the repo already being tracked.
INSERT INTO tracked_repos (repo, enabled, added_at) VALUES ('ashishmgupta/pq-radar', 1, datetime('now'));
