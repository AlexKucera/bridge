/* vessel — Vessel CRUD module for Bridge

   Manages the user's project registry (Fleet).
   Each vessel = a registered git repository.

   Tauri commands:
   - vessel_add(path, display_name?)
   - vessel_remove(id)
   - vessel_rename(id, name)
   - vessel_list()
   - vessel_get(id)

   Validation rules:
   - Path must exist, be a directory, contain .git subdirectory
   - Same path cannot be registered twice
   - Git metadata: branch name, dirty state detection
   - Cascade: removing a vessel cleans up configs, sessions, log events */

use sqlx::Pool;
use sqlx::Sqlite;
use serde::{Deserialize, Serialize};

/// A registered vessel (git repository) in the fleet.
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Vessel {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub display_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Git metadata for a vessel, resolved at query time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VesselGitInfo {
    pub branch: Option<String>,
    pub dirty: bool,
}

/// Enriched vessel record with git metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VesselWithGit {
    #[serde(flatten)]
    pub vessel: Vessel,
    pub git: VesselGitInfo,
}

/// Add a new vessel to the fleet.
///
/// Validates that `path` exists, is a directory, and contains a `.git` folder.
/// `display_name` defaults to the directory name if not provided.
/// Returns error if the path is already registered.
pub async fn add_vessel(
    pool: &Pool<Sqlite>,
    path: &str,
    display_name: Option<&str>,
) -> Result<Vessel, VesselError> {
    let p = std::path::Path::new(path);
    if !p.exists() {
        return Err(VesselError::PathNotFound(path.to_string()));
    }
    if !p.is_dir() {
        return Err(VesselError::NotADirectory(path.to_string()));
    }
    if !p.join(".git").exists() {
        return Err(VesselError::NotAGitRepository(path.to_string()));
    }

    let existing: Option<(i64,)> = sqlx::query_as(
        "SELECT id FROM vessels WHERE path = ?"
    )
    .bind(path)
    .fetch_optional(pool)
    .await
    .map_err(|e| VesselError::Database(e.to_string()))?;

    if existing.is_some() {
        return Err(VesselError::DuplicatePath(path.to_string()));
    }

    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let display = display_name.map(|s| s.to_string());

    let vessel = sqlx::query_as(
        "INSERT INTO vessels (name, path, display_name) VALUES (?, ?, ?) \
         RETURNING id, name, path, display_name, created_at, updated_at"
    )
    .bind(&name)
    .bind(path)
    .bind(&display)
    .fetch_one(pool)
    .await
    .map_err(|e| VesselError::Database(e.to_string()))?;

    Ok(vessel)
}

/// List all vessels sorted by name.
pub async fn list_vessels(pool: &Pool<Sqlite>) -> Result<Vec<Vessel>, VesselError> {
    let vessels = sqlx::query_as(
        "SELECT id, name, path, display_name, created_at, updated_at \
         FROM vessels ORDER BY name ASC"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| VesselError::Database(e.to_string()))?;
    Ok(vessels)
}

/// Resolve git metadata for a repository at the given path.
pub fn resolve_git_info(path: &str) -> VesselGitInfo {
    let branch = std::process::Command::new("git")
        .args(["-C", path, "branch", "--show-current"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string());

    let dirty = std::process::Command::new("git")
        .args(["-C", path, "status", "--porcelain"])
        .output()
        .ok()
        .map(|o| !o.stdout.is_empty())
        .unwrap_or(false);

    VesselGitInfo { branch, dirty }
}

/// List all vessels with git metadata.
pub async fn list_vessels_with_git(
    pool: &Pool<Sqlite>,
) -> Result<Vec<VesselWithGit>, VesselError> {
    let vessels = list_vessels(pool).await?;
    let with_git = vessels
        .into_iter()
        .map(|v| {
            let git = resolve_git_info(&v.path);
            VesselWithGit { vessel: v, git }
        })
        .collect();
    Ok(with_git)
}

/// Get a single vessel by ID.
pub async fn get_vessel(
    pool: &Pool<Sqlite>,
    id: i64,
) -> Result<Vessel, VesselError> {
    let vessel = sqlx::query_as(
        "SELECT id, name, path, display_name, created_at, updated_at \
         FROM vessels WHERE id = ?"
    )
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| VesselError::Database(e.to_string()))?
    .ok_or(VesselError::NotFound(id))?;
    Ok(vessel)
}

/// Rename a vessel's display name.
pub async fn rename_vessel(
    pool: &Pool<Sqlite>,
    id: i64,
    display_name: &str,
) -> Result<Vessel, VesselError> {
    let vessel = sqlx::query_as(
        "UPDATE vessels SET display_name = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE id = ? \
         RETURNING id, name, path, display_name, created_at, updated_at"
    )
    .bind(display_name)
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(|e| VesselError::Database(e.to_string()))?
    .ok_or(VesselError::NotFound(id))?;
    Ok(vessel)
}

/// Remove a vessel and cascade-delete its dependent data.
pub async fn remove_vessel(
    pool: &Pool<Sqlite>,
    id: i64,
) -> Result<(), VesselError> {
    sqlx::query("DELETE FROM vessel_configs WHERE vessel_id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| VesselError::Database(e.to_string()))?;

    sqlx::query("DELETE FROM quick_prompts WHERE vessel_id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| VesselError::Database(e.to_string()))?;

    sqlx::query("DELETE FROM log_events WHERE vessel_id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| VesselError::Database(e.to_string()))?;

    sqlx::query("UPDATE sessions SET vessel_id = NULL WHERE vessel_id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| VesselError::Database(e.to_string()))?;

    let result = sqlx::query("DELETE FROM vessels WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e| VesselError::Database(e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err(VesselError::NotFound(id));
    }

    Ok(())
}

/// Errors from vessel operations.
#[derive(Debug, thiserror::Error, serde::Serialize)]
pub enum VesselError {
    #[error("path not found: {0}")]
    PathNotFound(String),

    #[error("not a directory: {0}")]
    NotADirectory(String),

    #[error("not a git repository: {0}")]
    NotAGitRepository(String),

    #[error("path already registered: {0}")]
    DuplicatePath(String),

    #[error("vessel not found: {0}")]
    NotFound(i64),

    #[error("database error: {0}")]
    Database(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    async fn migrated_pool() -> Pool<Sqlite> {
        let pool = crate::db::Pool::<Sqlite>::connect("sqlite::memory:")
            .await
            .expect("failed to create test pool");
        db::migrate(&pool).await.expect("migration failed");
        pool
    }

    /// Helper: create a temp dir with .git (simulates a git repo)
    fn fake_repo() -> (tempfile::TempDir, String) {
        let dir = tempfile::TempDir::new().expect("tempdir");
        std::fs::create_dir(dir.path().join(".git")).expect("create .git");
        let path = dir.path().to_string_lossy().to_string();
        (dir, path)
    }

    #[tokio::test]
    async fn add_vessel_stores_record() {
        let pool = migrated_pool().await;
        let (_dir, path) = fake_repo();

        let vessel = add_vessel(&pool, &path, None)
            .await
            .expect("add_vessel should succeed");

        assert!(vessel.id > 0, "vessel should have an id");
        assert_eq!(vessel.path, path);
        assert_eq!(vessel.display_name, None);

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM vessels")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1, "should have exactly one vessel");
    }

    #[tokio::test]
    async fn add_vessel_rejects_non_directory() {
        let pool = migrated_pool().await;

        let file = tempfile::NamedTempFile::new().expect("tempfile");
        let path = file.path().to_string_lossy().to_string();

        let result = add_vessel(&pool, &path, None).await;
        assert!(result.is_err(), "should reject file paths");
        matches!(result.unwrap_err(), VesselError::NotADirectory(_));
    }

    #[tokio::test]
    async fn add_vessel_rejects_non_git_directory() {
        let pool = migrated_pool().await;

        let dir = tempfile::TempDir::new().expect("tempdir");
        let path = dir.path().to_string_lossy().to_string();

        let result = add_vessel(&pool, &path, None).await;
        assert!(result.is_err(), "should reject non-git dirs");
        matches!(result.unwrap_err(), VesselError::NotAGitRepository(_));
    }

    #[tokio::test]
    async fn add_vessel_rejects_duplicate_path() {
        let pool = migrated_pool().await;
        let (_dir, path) = fake_repo();

        add_vessel(&pool, &path, None).await.expect("first add should succeed");

        let result = add_vessel(&pool, &path, None).await;
        assert!(result.is_err(), "should reject duplicate paths");
        matches!(result.unwrap_err(), VesselError::DuplicatePath(_));
    }

    #[tokio::test]
    async fn list_vessels_returns_all_sorted_by_name() {
        let pool = migrated_pool().await;

        let (_dir_a, path_a) = fake_repo();
        let (_dir_b, path_b) = fake_repo();
        add_vessel(&pool, &path_a, None).await.ok();
        add_vessel(&pool, &path_b, None).await.ok();

        let vessels = list_vessels(&pool).await.expect("list should succeed");
        assert_eq!(vessels.len(), 2, "should have 2 vessels");

        // Verify sorted by name
        let names: Vec<&str> = vessels.iter().map(|v| v.name.as_str()).collect();
        let mut sorted_names = names.clone();
        sorted_names.sort();
        assert_eq!(names, sorted_names, "vessels should be sorted by name");
    }

    #[tokio::test]
    async fn get_vessel_returns_one_by_id() {
        let pool = migrated_pool().await;
        let (_dir, path) = fake_repo();

        let added = add_vessel(&pool, &path, None).await.unwrap();
        let found = get_vessel(&pool, added.id).await.unwrap();

        assert_eq!(found.id, added.id);
        assert_eq!(found.path, path);
    }

    #[tokio::test]
    async fn get_vessel_returns_error_for_missing_id() {
        let pool = migrated_pool().await;

        let result = get_vessel(&pool, 999).await;
        assert!(result.is_err());
        matches!(result.unwrap_err(), VesselError::NotFound(999));
    }

    #[tokio::test]
    async fn rename_vessel_updates_display_name() {
        let pool = migrated_pool().await;
        let (_dir, path) = fake_repo();

        let added = add_vessel(&pool, &path, None).await.unwrap();
        assert_eq!(added.display_name, None);

        let renamed = rename_vessel(&pool, added.id, "New Display Name").await.unwrap();
        assert_eq!(renamed.display_name.as_deref(), Some("New Display Name"));
    }

    #[tokio::test]
    async fn remove_vessel_deletes_and_cascades() {
        let pool = migrated_pool().await;
        let (_dir, path) = fake_repo();

        let added = add_vessel(&pool, &path, Some("Test Vessel")).await.unwrap();

        // Add some dependent data
        sqlx::query("INSERT INTO vessel_configs (vessel_id, config_key, config_value) VALUES (?, 'key', 'val')")
            .bind(added.id)
            .execute(&pool)
            .await
            .unwrap();

        remove_vessel(&pool, added.id).await.expect("remove should succeed");

        // Vessel is gone
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM vessels")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0, "vessel should be deleted");

        // Cascaded data is gone
        let cfg_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM vessel_configs")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(cfg_count, 0, "cascaded configs should be deleted");
    }

    #[tokio::test]
    async fn remove_vessel_returns_error_for_missing_id() {
        let pool = migrated_pool().await;

        let result = remove_vessel(&pool, 999).await;
        assert!(result.is_err());
        matches!(result.unwrap_err(), VesselError::NotFound(999));
    }

    #[tokio::test]
    async fn resolve_git_info_returns_branch_and_dirty() {
        let info = resolve_git_info(".");
        assert!(info.branch.is_some(), "should detect a branch name");
        let _dirty = info.dirty;
    }

    #[tokio::test]
    async fn list_vessels_with_git_includes_metadata() {
        let pool = migrated_pool().await;
        let (_dir, path) = fake_repo();
        add_vessel(&pool, &path, None).await.ok();

        let vessels = list_vessels_with_git(&pool).await.expect("list_with_git should succeed");
        assert_eq!(vessels.len(), 1);
    }
}
