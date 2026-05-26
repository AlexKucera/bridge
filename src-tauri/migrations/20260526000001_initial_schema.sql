-- 20260526000001_initial_schema
-- Bridge v0.1 initial schema: all domain tables

-- ── Vessels ──────────────────────────────────────────────
-- The user's project registry. Each row = a registered git repo.
CREATE TABLE vessels (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,           -- directory name (derived from path)
    path            TEXT    NOT NULL UNIQUE,    -- absolute path to the git repo root
    display_name    TEXT,                       -- user-friendly override (defaults to name)
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ── Vessel Configs ──────────────────────────────────────
-- Key-value settings scoped to a single vessel.
CREATE TABLE vessel_configs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vessel_id   INTEGER NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
    config_key  TEXT    NOT NULL,
    config_value TEXT   NOT NULL,
    UNIQUE(vessel_id, config_key)
);

-- ── Bridge Config ───────────────────────────────────────
-- App-level key-value settings (theme, defaults, etc.)
CREATE TABLE bridge_config (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    key     TEXT    NOT NULL UNIQUE,
    value   TEXT    NOT NULL
);

-- ── Sessions ────────────────────────────────────────────
-- AI session history per vessel.
CREATE TABLE sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vessel_id       INTEGER REFERENCES vessels(id) ON DELETE SET NULL,
    mode            TEXT,                               -- e.g. "chat", "agent", "code"
    status          TEXT,                               -- e.g. "running", "completed", "error"
    prompt          TEXT,
    model           TEXT,
    provider        TEXT,
    started_at      TEXT    DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    completed_at    TEXT,
    tokens_used     INTEGER DEFAULT 0,
    total_cost      REAL    DEFAULT 0.0,
    error_message   TEXT
);

-- ── Quick Prompts ───────────────────────────────────────
-- Saved prompt templates for a vessel.
CREATE TABLE quick_prompts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vessel_id       INTEGER NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
    title           TEXT    NOT NULL,
    template_text   TEXT    NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0
);

-- ── Log Events ──────────────────────────────────────────
-- Activity log with structured metadata.
CREATE TABLE log_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vessel_id   INTEGER REFERENCES vessels(id) ON DELETE SET NULL,
    event_type  TEXT    NOT NULL,
    message     TEXT    NOT NULL,
    metadata    TEXT,                           -- JSON blob
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Indexes for common log query patterns
CREATE INDEX idx_log_events_vessel_id   ON log_events(vessel_id);
CREATE INDEX idx_log_events_event_type  ON log_events(event_type);
CREATE INDEX idx_log_events_created_at  ON log_events(created_at);
CREATE INDEX idx_log_events_pinned      ON log_events(pinned);

-- ── Appearance Prefs ────────────────────────────────────
-- User theme / accent / density preferences (singleton-style, keyed).
CREATE TABLE appearance_prefs (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
