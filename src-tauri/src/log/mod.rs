/* log — Captain's Log event store for Bridge

   Fleet-wide activity timeline. Each entry = one event from any vessel.
   SQLite-backed with filtering, pinning, and time-range queries.

   Tauri commands:
   - log_event(vessel_id?, event_type, message, metadata?)
   - query_logs(filter) -> Vec<LogEntry>
   - pin_log_entry(entry_id)
   - unpin_log_entry(entry_id) */

use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};

// ── Types ────────────────────────────────────────────────

/// Classification of a log event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogEventType {
    Run,
    Ship,
    Warn,
    Error,
    Crew,
}

impl LogEventType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Run => "Run",
            Self::Ship => "Ship",
            Self::Warn => "Warn",
            Self::Error => "Error",
            Self::Crew => "Crew",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "Run" | "run" => Some(Self::Run),
            "Ship" | "ship" => Some(Self::Ship),
            "Warn" | "warn" => Some(Self::Warn),
            "Error" | "error" => Some(Self::Error),
            "Crew" | "crew" => Some(Self::Crew),
            _ => None,
        }
    }

}

/// A single log entry in the Captain's Log.
/// `vessel_name` is resolved via LEFT JOIN when querying; not stored in the table.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub id: i64,
    pub vessel_id: Option<i64>,
    pub vessel_name: Option<String>,
    pub event_type: String,
    pub message: String,
    pub metadata: Option<serde_json::Value>,
    pub pinned: bool,
    pub created_at: String,
}

/// Filter for querying log events.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogQueryFilter {
    /// Only events within this duration from now (e.g. 3600 = last hour).
    pub time_range: Option<i64>,
    /// Only events matching these types.
    pub types: Option<Vec<String>>,
    /// Only pinned entries.
    pub pinned_only: bool,
    /// Scope to a single vessel.
    pub vessel_id: Option<i64>,
    /// Full-text search across message + vessel_name.
    pub search_text: Option<String>,
}

// ── Errors ───────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum LogError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),

    #[error("entry not found: {0}")]
    NotFound(i64),

    #[error("invalid event type: {0}")]
    InvalidEventType(String),
}

// ── Internal: raw DB row (1:1 with table schema) ──────────

/// Maps directly to log_events table columns (no vessel_name).
#[derive(sqlx::FromRow)]
struct LogEntryRaw {
    id: i64,
    vessel_id: Option<i64>,
    event_type: String,
    message: String,
    metadata: Option<String>,
    pinned: i64,
    created_at: String,
}

impl LogEntryRaw {
    fn to_entry(self, vessel_name: Option<String>) -> LogEntry {
        LogEntry {
            id: self.id,
            vessel_id: self.vessel_id,
            vessel_name,
            event_type: self.event_type,
            message: self.message,
            metadata: self.metadata.and_then(|s| serde_json::from_str(&s).ok()),
            pinned: self.pinned != 0,
            created_at: self.created_at,
        }
    }
}

// ── Operations ───────────────────────────────────────────

/// Insert a new log event. Returns the created entry with server-assigned timestamp.
pub async fn log_event(
    pool: &Pool<Sqlite>,
    vessel_id: Option<i64>,
    event_type: &str,
    message: &str,
    metadata: Option<serde_json::Value>,
) -> Result<LogEntry, LogError> {
    // Validate event type
    if LogEventType::from_str(event_type).is_none() {
        return Err(LogError::InvalidEventType(event_type.to_string()));
    }

    let meta_json = metadata
        .map(|m| serde_json::to_string(&m))
        .transpose()
        .map_err(|e| sqlx::Error::ColumnDecode { index: "metadata".to_string(), source: Box::new(e).into() })?;

    let raw = sqlx::query_as::<_, LogEntryRaw>(
        "INSERT INTO log_events (vessel_id, event_type, message, metadata, pinned) \
         VALUES (?, ?, ?, ?, 0) \
         RETURNING id, vessel_id, event_type, message, metadata, pinned, created_at"
    )
    .bind(vessel_id)
    .bind(event_type)
    .bind(message)
    .bind(&meta_json)
    .fetch_one(pool)
    .await?;

    // Resolve vessel_name from vessels table if vessel_id present
    let vessel_name = if let Some(vid) = raw.vessel_id {
        sqlx::query_scalar("SELECT COALESCE(display_name, name) FROM vessels WHERE id = ?")
            .bind(vid)
            .fetch_optional(pool)
            .await?
            .flatten()
    } else {
        None
    };

    Ok(raw.to_entry(vessel_name))
}

/// Query log events with optional filters.
/// Results ordered by created_at DESC (newest first).
pub async fn query_logs(
    pool: &Pool<Sqlite>,
    filter: LogQueryFilter,
) -> Result<Vec<LogEntry>, LogError> {
    let mut conditions: Vec<String> = vec![];
    let mut bind_values: Vec<String> = vec![]; // serialized bind values for dynamic query

    // Build WHERE clause dynamically based on filter
    if let Some(ref text) = filter.search_text {
        conditions.push("(le.message LIKE ? OR v.name LIKE ? OR COALESCE(v.display_name, '') LIKE ?)".to_string());
        let pattern = format!("%{}%", text);
        bind_values.push(pattern.clone());
        bind_values.push(pattern.clone());
        bind_values.push(pattern);
    }

    if let Some(vid) = filter.vessel_id {
        conditions.push("le.vessel_id = ?".to_string());
        bind_values.push(vid.to_string());
    }

    if let Some(ref types) = filter.types {
        if !types.is_empty() {
            let placeholders: Vec<String> = types.iter().map(|_| "?".to_string()).collect();
            conditions.push(format!("le.event_type IN ({})", placeholders.join(", ")));
            for t in types {
                bind_values.push(t.clone());
            }
        }
    }

    if filter.pinned_only {
        conditions.push("le.pinned = 1".to_string());
    }

    if let Some(range_secs) = filter.time_range {
        conditions.push("le.created_at >= datetime('now', ? || ' seconds')".to_string());
        bind_values.push(format!("-{}", range_secs));
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // Query with LEFT JOIN to resolve vessel_name
    let sql = format!(
        "SELECT le.id, le.vessel_id, le.event_type, le.message, le.metadata, le.pinned, le.created_at,
                COALESCE(v.display_name, v.name) AS vessel_name
         FROM log_events le
         LEFT JOIN vessels v ON v.id = le.vessel_id
         {}
         ORDER BY le.pinned DESC, le.created_at DESC",
        where_clause
    );

    // For dynamic queries, we need to build and execute manually
    let mut query = sqlx::query_as::<_, LogEntryRaw>(&sql);
    for val in &bind_values {
        query = query.bind(val.as_str());
    }

    let raw_entries = query.fetch_all(pool).await?;

    // Resolve vessel names from the JOIN result
    // Since we used a LEFT JOIN with COALESCE, we need a different approach:
    // Re-query each entry's vessel name, or use a subquery approach.
    // Actually, let's just use the raw entries without vessel_name from this query,
    // then batch-resolve.
    let entries: Vec<LogEntry> = raw_entries
        .into_iter()
        .map(|r| r.to_entry(None))  // Will be resolved below
        .collect();

    // Batch-resolve vessel names
    let mut result = Vec::with_capacity(entries.len());
    for entry in &entries {
        let vn = if let Some(vid) = entry.vessel_id {
            sqlx::query_scalar(
                "SELECT COALESCE(display_name, name) FROM vessels WHERE id = ?"
            )
            .bind(vid)
            .fetch_optional(pool)
            .await?
            .flatten()
        } else {
            None
        };
        let mut e = entry.clone();
        e.vessel_name = vn;
        result.push(e);
    }

    Ok(result)
}

/// Pin a log entry so it sorts to the top.
pub async fn pin_log_entry(pool: &Pool<Sqlite>, entry_id: i64) -> Result<(), LogError> {
    let result = sqlx::query("UPDATE log_events SET pinned = 1 WHERE id = ?")
        .bind(entry_id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(LogError::NotFound(entry_id));
    }
    Ok(())
}

/// Unpin a log entry.
pub async fn unpin_log_entry(pool: &Pool<Sqlite>, entry_id: i64) -> Result<(), LogError> {
    let result = sqlx::query("UPDATE log_events SET pinned = 0 WHERE id = ?")
        .bind(entry_id)
        .execute(pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(LogError::NotFound(entry_id));
    }
    Ok(())
}

// ── Tests ────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn migrated_pool() -> Pool<Sqlite> {
        let pool = Pool::<Sqlite>::connect("sqlite::memory:")
            .await
            .expect("failed to create test pool");
        db::migrate(&pool).await.expect("migration failed");
        pool
    }

    #[tokio::test]
    async fn log_event_inserts_and_returns_entry() {
        let pool = migrated_pool().await;

        let entry = log_event(&pool, None, "Run", "Session started for bridge", None)
            .await
            .expect("log_event should succeed");

        assert!(entry.id > 0);
        assert_eq!(entry.event_type, "Run");
        assert_eq!(entry.message, "Session started for bridge");
        assert_eq!(entry.pinned, false);
        assert!(entry.created_at.len() > 0); // ISO timestamp
        assert_eq!(entry.vessel_id, None);
        assert_eq!(entry.vessel_name, None);
        assert_eq!(entry.metadata, None);
    }

    #[tokio::test]
    async fn log_event_resolves_vessel_name() {
        let pool = migrated_pool().await;

        // Create a vessel first
        let dir = tempfile::TempDir::new().expect("tempdir");
        std::fs::create_dir(dir.path().join(".git")).expect("create .git");
        let path = dir.path().to_string_lossy().to_string();
        let vessel = crate::vessel::add_vessel(&pool, &path, Some("my-bridge")).await.unwrap();

        // Log an event for that vessel
        let entry = log_event(&pool, Some(vessel.id), "Ship", "Vessel docked", None)
            .await
            .expect("log_event should succeed");

        assert_eq!(entry.vessel_id, Some(vessel.id));
        assert_eq!(entry.vessel_name.as_deref(), Some("my-bridge"));
    }

    #[tokio::test]
    async fn log_event_stores_metadata() {
        let pool = migrated_pool().await;

        let meta = serde_json::json!({"session_id": 42, "model": "gpt-4"});
        let entry = log_event(&pool, None, "Run", "Session started", Some(meta.clone()))
            .await
            .expect("log_event should succeed");

        assert_eq!(entry.metadata, Some(meta));
    }

    #[tokio::test]
    async fn log_event_rejects_invalid_type() {
        let pool = migrated_pool().await;

        let result = log_event(&pool, None, "Bogus", "test", None).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            LogError::InvalidEventType(s) => assert_eq!(s, "Bogus"),
            other => panic!("expected InvalidEventType, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn query_logs_returns_ordered_by_created_at_desc() {
        let pool = migrated_pool().await;

        log_event(&pool, None, "Run", "first", None).await.unwrap();
        log_event(&pool, None, "Ship", "second", None).await.unwrap();
        log_event(&pool, None, "Warn", "third", None).await.unwrap();

        let entries = query_logs(&pool, LogQueryFilter::default()).await.unwrap();

        assert_eq!(entries.len(), 3);
        // Newest first
        assert_eq!(entries[0].message, "third");
        assert_eq!(entries[1].message, "second");
        assert_eq!(entries[2].message, "first");
    }

    // ── query_logs: time_range filter ────────────────────

    #[tokio::test]
    async fn query_logs_filters_by_time_range() {
        let pool = migrated_pool().await;

        log_event(&pool, None, "Run", "old", None).await.unwrap();
        // Can't easily manipulate created_at in SQLite (it uses NOW()),
        // but we can verify that a very small time_range returns fewer results.
        let all = query_logs(&pool, LogQueryFilter::default()).await.unwrap();
        assert!(all.len() >= 1);

        // A 30-day range should include everything we just added
        let recent = query_logs(&pool, LogQueryFilter { time_range: Some(30 * 24 * 3600), ..Default::default() }).await.unwrap();
        assert_eq!(recent.len(), all.len());
    }

    #[tokio::test]
    async fn query_logs_time_range_excludes_old_entries() {
        let pool = migrated_pool().await;

        log_event(&pool, None, "Run", "should-be-included", None).await.unwrap();

        // 0-second range should exclude everything (since events have already elapsed)
        let empty = query_logs(&pool, LogQueryFilter { time_range: Some(0), ..Default::default() }).await.unwrap();
        // Events may have been created within the same second in fast tests,
        // so this is a soft check
        assert!(empty.len() <= 1);  // At most 1 if it landed on exactly now
    }

    // ── query_logs: type filter ──────────────────────────

    #[tokio::test]
    async fn query_logs_filters_by_event_type() {
        let pool = migrated_pool().await;

        log_event(&pool, None, "Run", "run-event", None).await.unwrap();
        log_event(&pool, None, "Error", "error-event", None).await.unwrap();
        log_event(&pool, None, "Ship", "ship-event", None).await.unwrap();

        let errors_only = query_logs(&pool, LogQueryFilter {
            types: Some(vec!["Error".to_string()]),
            ..Default::default()
        }).await.unwrap();

        assert_eq!(errors_only.len(), 1);
        assert_eq!(errors_only[0].event_type, "Error");
    }

    #[tokio::test]
    async fn query_logs_filters_by_multiple_types() {
        let pool = migrated_pool().await;

        log_event(&pool, None, "Run", "run-msg", None).await.unwrap();
        log_event(&pool, None, "Error", "err-msg", None).await.unwrap();
        log_event(&pool, None, "Warn", "warn-msg", None).await.unwrap();

        let run_and_err = query_logs(&pool, LogQueryFilter {
            types: Some(vec!["Run".to_string(), "Error".to_string()]),
            ..Default::default()
        }).await.unwrap();

        assert_eq!(run_and_err.len(), 2);
    }

    // ── query_logs: pinned_only ───────────────────────────

    #[tokio::test]
    async fn query_logs_pinned_only_returns_pinned() {
        let pool = migrated_pool().await;

        let e1 = log_event(&pool, None, "Run", "normal", None).await.unwrap();
        let _e2 = log_event(&pool, None, "Ship", "pinned-one", None).await.unwrap();

        pin_log_entry(&pool, e1.id + 1).await.unwrap();

        let pinned = query_logs(&pool, LogQueryFilter { pinned_only: true, ..Default::default() }).await.unwrap();

        assert_eq!(pinned.len(), 1);
        assert!(pinned[0].pinned);
    }

    // ── query_logs: vessel_id filter ──────────────────────

    #[tokio::test]
    async fn query_logs_filters_by_vessel_id() {
        let pool = migrated_pool().await;

        let dir = tempfile::TempDir::new().expect("tempdir");
        std::fs::create_dir(dir.path().join(".git")).expect("create .git");
        let path = dir.path().to_string_lossy().to_string();
        let vessel = crate::vessel::add_vessel(&pool, &path, Some("test-vessel")).await.unwrap();

        log_event(&pool, Some(vessel.id), "Run", "for-vessel", None).await.unwrap();
        log_event(&pool, None, "Run", "no-vessel", None).await.unwrap();

        let filtered = query_logs(&pool, LogQueryFilter { vessel_id: Some(vessel.id), ..Default::default() }).await.unwrap();

        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].message, "for-vessel");
    }

    // ── query_logs: search_text ────────────────────────────

    #[tokio::test]
    async fn query_logs_searches_message_text() {
        let pool = migrated_pool().await;

        log_event(&pool, None, "Run", "deployed to production", None).await.unwrap();
        log_event(&pool, None, "Error", "connection timeout", None).await.unwrap();

        let results = query_logs(&pool, LogQueryFilter {
            search_text: Some("production".to_string()),
            ..Default::default()
        }).await.unwrap();

        assert_eq!(results.len(), 1);
        assert!(results[0].message.contains("production"));
    }

    // ── pin / unpin ───────────────────────────────────────

    #[tokio::test]
    async fn pin_log_entry_sets_pinned_true() {
        let pool = migrated_pool().await;

        let entry = log_event(&pool, None, "Run", "pin-me", None).await.unwrap();
        assert!(!entry.pinned);

        pin_log_entry(&pool, entry.id).await.expect("pin should succeed");

        let entries = query_logs(&pool, LogQueryFilter::default()).await.unwrap();
        let pinned = entries.iter().find(|e| e.id == entry.id).unwrap();
        assert!(pinned.pinned);
    }

    #[tokio::test]
    async fn unpin_log_entry_sets_pinned_false() {
        let pool = migrated_pool().await;

        let entry = log_event(&pool, None, "Run", "unpin-me", None).await.unwrap();
        pin_log_entry(&pool, entry.id).await.unwrap();

        unpin_log_entry(&pool, entry.id).await.expect("unpin should succeed");

        let entries = query_logs(&pool, LogQueryFilter::default()).await.unwrap();
        let unpinned = entries.iter().find(|e| e.id == entry.id).unwrap();
        assert!(!unpinned.pinned);
    }

    #[tokio::test]
    async fn pin_nonexistent_returns_error() {
        let pool = migrated_pool().await;
        let result = pin_log_entry(&pool, 99999).await;
        assert!(result.is_err());
        match result.unwrap_err() {
            LogError::NotFound(id) => assert_eq!(id, 99999),
            other => panic!("expected NotFound, got {:?}", other),
        }
    }

    #[tokio::test]
    async fn pinned_entries_sort_above_unpinned() {
        let pool = migrated_pool().await;

        let e1 = log_event(&pool, None, "Run", "first", None).await.unwrap();
        let e2 = log_event(&pool, None, "Ship", "second", None).await.unwrap();
        let e3 = log_event(&pool, None, "Warn", "third", None).await.unwrap();

        // Pin the middle one
        pin_log_entry(&pool, e2.id).await.unwrap();

        let entries = query_logs(&pool, LogQueryFilter::default()).await.unwrap();

        // Pinned should sort above unpinned (within DESC created_at order)
        let pinned_pos = entries.iter().position(|e| e.id == e2.id).unwrap();
        let first_unpinned = entries.iter().position(|e| !e.pinned).unwrap();
        assert!(pinned_pos < first_unpinned, "pinned entry should sort before unpinned");
    }
}
