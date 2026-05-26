/* db — SQLite data layer for Bridge

   Manages schema migrations, connection pooling, and provides
   accessors for each domain table. Uses sqlx with SQLite.

   Migration files live in src-tauri/migrations/ and are run
   via sqlx::migrate::Migrator at startup (and in tests). */

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
pub use sqlx::{Pool, Sqlite};
use std::path::Path;

/// Run all pending migrations against the given pool.
pub async fn migrate(pool: &Pool<Sqlite>) -> Result<(), sqlx::migrate::MigrateError> {
    let migrator = sqlx::migrate::Migrator::new(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("migrations"),
    )
    .await?;
    migrator.run(pool).await
}

/// Open (or create) the SQLite database at the given file path.
pub async fn open_database(db_path: &Path) -> Result<Pool<Sqlite>, sqlx::Error> {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true);

    SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create an in-memory SQLite pool for testing.
    async fn test_pool() -> Pool<Sqlite> {
        SqlitePoolOptions::new()
            .max_connections(5)
            .connect("sqlite::memory:")
            .await
            .expect("failed to create in-memory test DB")
    }

    #[tokio::test]
    async fn migration_creates_all_tables() {
        let pool = test_pool().await;
        migrate(&pool).await.expect("migration should succeed");

        // Verify every expected table exists
        let expected_tables = [
            "vessels", "vessel_configs", "bridge_config",
            "sessions", "quick_prompts", "log_events", "appearance_prefs",
        ];

        for table in &expected_tables {
            let exists: bool = sqlx::query_scalar(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name=?",
            )
            .bind(*table)
            .fetch_one(&pool)
            .await
            .unwrap_or(false);

            assert!(exists, "table '{}' should exist after migration", table);
        }
    }

    #[tokio::test]
    async fn migration_is_idempotent() {
        let pool = test_pool().await;

        // First run succeeds
        migrate(&pool).await.expect("first migration should succeed");
        // Second run should also succeed (no duplicate table errors)
        migrate(&pool).await.expect("second migration should be idempotent");

        // Tables still exist and are not duplicated
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM vessels",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 0, "no rows yet, just schema verification");
    }

    #[tokio::test]
    async fn open_database_creates_file_and_migrates() {
        let dir = tempfile::TempDir::new().expect("tempdir");
        let db_path = dir.path().join("test_bridge.db");

        let pool = open_database(&db_path)
            .await
            .expect("should create db file");

        assert!(db_path.exists(), "database file should exist on disk");

        migrate(&pool).await.expect("migration should run on file-backed db");

        // Verify we can query the schema
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='vessels'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(count, 1, "vessels table should exist");
    }
}
