CREATE TABLE IF NOT EXISTS reporting_users (
  id text PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS reporting_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES reporting_users(id),
  canonical_remote text NOT NULL,
  repo_root_path text NOT NULL,
  created_at bigint NOT NULL,
  cwd text NOT NULL,
  parent_session text,
  seed_length integer,
  header jsonb NOT NULL,
  last_seq integer NOT NULL DEFAULT -1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reporting_session_events (
  session_id text NOT NULL REFERENCES reporting_sessions(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  type text NOT NULL,
  event_time bigint NOT NULL,
  event text NOT NULL,
  PRIMARY KEY (session_id, seq)
);
