// 模块声明
mod commands;
mod crypto;
mod storage;
mod db;

use commands::*;
use storage::StoragePaths;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      // 初始化日志
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 初始化存储路径
      let storage = StoragePaths::new(&app.handle())
        .expect("Failed to initialize storage paths");

      // 初始化数据库
      let db_path = storage.get_database_path();
      log::info!("Database path: {:?}", db_path);

      // 注册应用状态
      app.manage(AppState { storage });

      // 注册插件
      app.handle().plugin(tauri_plugin_sql::Builder::default().build())?;
      app.handle().plugin(tauri_plugin_fs::init())?;
      app.handle().plugin(tauri_plugin_dialog::init())?;
      app.handle().plugin(tauri_plugin_shell::init())?;
      app.handle().plugin(tauri_plugin_os::init())?;
      app.handle().plugin(tauri_plugin_process::init())?;
      app.handle().plugin(tauri_plugin_notification::init())?;

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      // AI 模型配置
      save_ai_model_key,
      get_ai_model_key,
      list_ai_model_configs,
      delete_ai_model_config,
      
      // 项目管理（本地 .jzp 工程）
      create_project,
      list_projects,
      open_project,
      register_project,
      delete_project,
      update_project_manifest,
      save_project_data,
      load_project_data,
      get_default_projects_root,
      
      // 文件操作
      select_file,
      select_directory,
      show_in_explorer,
      open_file,
      import_media_file,
      
      // 路径获取
      get_app_data_dir,
      get_project_dir,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
