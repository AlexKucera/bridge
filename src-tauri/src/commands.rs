/* commands — Tauri command handlers

   Bridges the frontend (JS/TS invocations) to the Rust backend.
   Each command extracts params from Tauri's invoke call,
   accesses the shared DB pool via State, and returns a result. */

use crate::db::Pool;
use crate::vessel::{self, Vessel, VesselError, VesselWithGit};
use sqlx::Sqlite;
use tauri::State;

/// Add a new vessel from a filesystem path.
#[tauri::command]
pub async fn vessel_add(
    pool: State<'_, Pool<Sqlite>>,
    path: String,
    display_name: Option<String>,
) -> Result<Vessel, VesselError> {
    vessel::add_vessel(&pool, &path, display_name.as_deref()).await
}

/// List all vessels sorted by name.
#[tauri::command]
pub async fn vessel_list(
    pool: State<'_, Pool<Sqlite>>,
) -> Result<Vec<Vessel>, VesselError> {
    vessel::list_vessels(&pool).await
}

/// Get a single vessel by ID.
#[tauri::command]
pub async fn vessel_get(
    pool: State<'_, Pool<Sqlite>>,
    id: i64,
) -> Result<Vessel, VesselError> {
    vessel::get_vessel(&pool, id).await
}

/// Rename a vessel's display name.
#[tauri::command]
pub async fn vessel_rename(
    pool: State<'_, Pool<Sqlite>>,
    id: i64,
    display_name: String,
) -> Result<Vessel, VesselError> {
    vessel::rename_vessel(&pool, id, &display_name).await
}

/// Remove a vessel and cascade-delete its data.
#[tauri::command]
pub async fn vessel_remove(
    pool: State<'_, Pool<Sqlite>>,
    id: i64,
) -> Result<(), VesselError> {
    vessel::remove_vessel(&pool, id).await
}

/// List all vessels with git metadata (branch, dirty state).
#[tauri::command]
pub async fn vessel_list_with_git(
    pool: State<'_, Pool<Sqlite>>,
) -> Result<Vec<VesselWithGit>, VesselError> {
    vessel::list_vessels_with_git(&pool).await
}
