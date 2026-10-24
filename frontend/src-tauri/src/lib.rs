// 模块声明
mod commands;
mod package;
mod queue;
mod storage;

use commands::*;
use queue::Queue;
use storage::StoragePaths;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();
  // 单实例只在打包版启用：开发版与已安装版共用 identifier，
  // 若 dev 也注册单实例，打开已安装版本后 dev 会直接被拦下退出。
  #[cfg(not(debug_assertions))]
  let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
    if let Some(path) = commands::package_arg(&argv) {
      commands::handle_open_package(app, path);
    }
  }));

  builder
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

      // 任务队列持久化文件路径（在 storage 被移动前进出）
      let queue_path = storage.root.join("workflow_queue.json");

      // 注册应用状态
      app.manage(AppState { storage, pending_open: std::sync::Mutex::new(None) });

      // 打包版启动时自动注册 .jzp 文件关联（指向当前 exe，绿色版同样适用）
      #[cfg(all(target_os = "windows", not(debug_assertions)))]
      {
        if let Err(err) = commands::ensure_jzp_association() {
          log::warn!("自动注册 .jzp 文件关联失败: {}", err);
        }
      }

      // 注册后台任务队列（Rust 托管 worker），并恢复未完成任务
      let queue = Queue::new(app.handle().clone(), queue_path);
      app.manage(Arc::clone(&queue));
      queue.load_and_resume();

      // 注册插件
      app.handle().plugin(tauri_plugin_dialog::init())?;
      app.handle().plugin(tauri_plugin_os::init())?;
      app.handle().plugin(tauri_plugin_process::init())?;
      app.handle().plugin(tauri_plugin_notification::init())?;

      // 通过文件关联/命令行启动（双击 .jzp）：启动后直接导入/打开
      let args: Vec<String> = std::env::args().collect();
      if let Some(path) = commands::package_arg(&args) {
        commands::handle_open_package(app.handle(), path);
      }

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
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
      import_project_package,
      export_project_package,
      take_pending_project,
      register_jzp_association,
      
      // 文件操作
      show_in_explorer,
      open_file,
      import_media_file,
      download_media_file,
      read_media_data_url,
      probe_media_file,
      
      // 路径获取
      get_app_data_dir,
      get_project_dir,

      // AI 厂商代理（规避 CORS）与可灵签名
      ai_proxy,
      kling_sign_jwt,

      // Rust 托管任务队列（提交/查询/列表/取消/续跑/消费）
      queue::queue_submit,
      queue::queue_get,
      queue::queue_list,
      queue::queue_cancel,
      queue::queue_resume,
      queue::queue_consume,
      queue::queue_consume_all_failed,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
