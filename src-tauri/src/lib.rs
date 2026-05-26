mod commands;
mod db;
mod vessel;

use commands::{vessel_add, vessel_get, vessel_list, vessel_list_with_git, vessel_remove, vessel_rename};
use db::open_database;
use db::migrate;
use std::path::PathBuf;
use tauri::Manager;

pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Initialize SQLite database in the Tauri app data directory
      let app_dir = app
        .path()
        .app_data_dir()
        .expect("failed to resolve app data dir");
      std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");

      let db_path: PathBuf = app_dir.join("bridge.db");
      let rt = tokio::runtime::Handle::current();

      let pool = rt
        .block_on(open_database(&db_path))
        .expect("failed to open database");
      rt.block_on(migrate(&pool))
        .expect("failed to run database migrations");

      app.manage(pool);

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      vessel_add,
      vessel_list,
      vessel_get,
      vessel_rename,
      vessel_remove,
      vessel_list_with_git,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
