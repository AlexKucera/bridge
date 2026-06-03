mod commands;
mod pi_event;
mod pi_state;
mod config;
mod db;
mod vessel;
mod cargo;
mod pi_session;
pub mod events;

use commands::{
  config_detect_binary, config_get, config_save, config_validate,
  event_parse_line, event_parse_jsonl, state_create_session, state_apply_event,
  vessel_add, vessel_get, vessel_list, vessel_list_with_git, vessel_remove, vessel_rename,
  session_launch, session_stop, session_retry, session_list, session_get, session_finalize,
  pty_write, pty_resize,
  cargo_status, cargo_diff, cargo_commit, cargo_push, cargo_generate_message,
};

use crate::pi_session::SessionRegistry;
use db::open_database;
use db::migrate;
use std::path::PathBuf;
use tauri::Manager;

pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      // Persist window size/position across launches
      app.handle().plugin(
        tauri_plugin_window_state::Builder::default().build(),
      )?;

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
      let rt = tokio::runtime::Runtime::new().expect("failed to create tokio runtime");

      let pool = rt
        .block_on(open_database(&db_path))
        .expect("failed to open database");
      rt.block_on(migrate(&pool))
        .expect("failed to run database migrations");

      app.manage(pool);
      app.manage(SessionRegistry::new());

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      config_get,
      config_save,
      config_validate,
      config_detect_binary,
      vessel_add,
      vessel_list,
      vessel_get,
      vessel_rename,
      vessel_remove,
      vessel_list_with_git,
      event_parse_line,
      event_parse_jsonl,
      state_create_session,
      state_apply_event,
      session_launch,
      session_stop,
      session_retry,
      session_list,
      session_get,
      session_finalize,
      pty_write,
      pty_resize,
      cargo_status,
      cargo_diff,
      cargo_commit,
      cargo_push,
      cargo_generate_message,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
