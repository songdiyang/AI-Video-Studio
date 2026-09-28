// Tauri 命令模块
// 提供前端调用的本地 API

use crate::crypto;
use crate::storage::{StoragePaths, ProjectMetadata, MediaFileInfo};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;
use uuid::Uuid;

/// 应用状态
pub struct AppState {
    pub storage: StoragePaths,
}

/// AI 模型配置
#[derive(Debug, Serialize, Deserialize)]
pub struct AIModelConfig {
    pub provider: String,
    pub model_name: String,
    pub api_key: String,
    pub api_base: Option<String>,
}

/// 项目创建参数
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectParams {
    pub name: String,
    pub description: Option<String>,
    pub project_type: String,
    /// 工程文件夹的父目录；缺省使用 文档\AI-Video-Studio作品
    pub parent_dir: Option<String>,
}

/// 保存 AI 模型密钥
#[tauri::command]
pub async fn save_ai_model_key(
    config: AIModelConfig,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 加密 API 密钥
    let encrypted_key = crypto::encrypt_api_key(&config.api_key)?;
    
    // TODO: 保存到 SQLite 数据库
    // 这里需要使用 tauri-plugin-sql 来操作数据库
    
    Ok(())
}

/// 获取 AI 模型密钥
#[tauri::command]
pub async fn get_ai_model_key(
    provider: String,
    model_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // TODO: 从 SQLite 数据库读取加密的密钥
    // 解密并返回
    
    Ok("".to_string())
}

/// 列出所有 AI 模型配置
#[tauri::command]
pub async fn list_ai_model_configs(
    state: State<'_, AppState>,
) -> Result<Vec<AIModelConfig>, String> {
    // TODO: 从 SQLite 数据库读取所有配置
    // 注意：不解密 API 密钥，只返回配置信息
    
    Ok(vec![])
}

/// 删除 AI 模型配置
#[tauri::command]
pub async fn delete_ai_model_config(
    provider: String,
    model_name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // TODO: 从 SQLite 数据库删除配置
    
    Ok(())
}

/// 创建新项目：在父目录下建立工程文件夹并写入 .jzp 清单
#[tauri::command]
pub async fn create_project(
    params: CreateProjectParams,
    state: State<'_, AppState>,
) -> Result<ProjectMetadata, String> {
    let root = match params.parent_dir {
        Some(dir) if !dir.trim().is_empty() => PathBuf::from(dir),
        _ => crate::storage::default_projects_root(),
    };
    std::fs::create_dir_all(&root)
        .map_err(|e| format!("无法创建工程根目录 {:?}: {}", root, e))?;

    // 同名工程文件夹追加序号
    let base_name = crate::storage::sanitize_folder_name(&params.name);
    let mut folder_name = base_name.clone();
    let mut idx = 1;
    while root.join(&folder_name).exists() {
        folder_name = format!("{}-{}", base_name, idx);
        idx += 1;
    }
    let project_dir = root.join(&folder_name);

    std::fs::create_dir_all(project_dir.join("data"))
        .map_err(|e| format!("无法创建 data 目录: {}", e))?;
    std::fs::create_dir_all(project_dir.join("media"))
        .map_err(|e| format!("无法创建 media 目录: {}", e))?;
    std::fs::create_dir_all(project_dir.join("exports"))
        .map_err(|e| format!("无法创建 exports 目录: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();
    let metadata = ProjectMetadata {
        schema_version: 1,
        id: Uuid::new_v4().to_string(),
        name: params.name,
        description: params.description,
        project_type: params.project_type,
        created_at: now.clone(),
        updated_at: now,
        thumbnail_path: None,
        path: project_dir.to_string_lossy().to_string(),
    };

    crate::storage::write_manifest(&project_dir, &metadata)?;
    crate::storage::upsert_registry(&state.storage.root, &project_dir)?;

    log::info!("Created local project at {:?}", project_dir);
    Ok(metadata)
}

/// 列出所有本地工程（读注册表，自动清理失效条目，按最近打开排序）
#[tauri::command]
pub async fn list_projects(
    state: State<'_, AppState>,
) -> Result<Vec<ProjectMetadata>, String> {
    let mut pairs: Vec<(String, ProjectMetadata)> = Vec::new();
    for entry in crate::storage::read_registry(&state.storage.root) {
        match crate::storage::resolve_manifest(&entry.path)
            .and_then(|m| crate::storage::read_manifest(&m))
        {
            Ok(mut meta) => {
                // 清单里的 path 可能过期（文件夹被移动后重新注册），以注册表为准
                meta.path = entry.path.clone();
                pairs.push((entry.last_opened, meta));
            }
            Err(e) => log::warn!("Skip stale registry entry: {}", e),
        }
    }
    pairs.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(pairs.into_iter().map(|(_, meta)| meta).collect())
}

/// 打开工程：校验清单、更新注册表最近打开时间
#[tauri::command]
pub async fn open_project(
    path: String,
    state: State<'_, AppState>,
) -> Result<ProjectMetadata, String> {
    let manifest_path = crate::storage::resolve_manifest(&path)?;
    let meta = crate::storage::read_manifest(&manifest_path)?;
    let project_dir = manifest_path
        .parent()
        .ok_or("Invalid manifest location")?
        .to_path_buf();
    crate::storage::upsert_registry(&state.storage.root, &project_dir)?;
    Ok(meta)
}

/// 注册一个已存在的工程（文件夹或其 .jzp 文件路径）
#[tauri::command]
pub async fn register_project(
    path: String,
    state: State<'_, AppState>,
) -> Result<ProjectMetadata, String> {
    open_project(path, state).await
}

/// 从注册表移除工程（可选同时删除磁盘文件）
#[tauri::command]
pub async fn delete_project(
    path: String,
    delete_files: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    crate::storage::remove_from_registry(&state.storage.root, &path)?;
    if delete_files {
        let p = PathBuf::from(&path);
        if p.is_dir() {
            std::fs::remove_dir_all(&p)
                .map_err(|e| format!("Failed to delete project folder: {}", e))?;
        }
    }
    Ok(())
}

/// 保存工程内数据文件（data/<file_name>，仅限纯文件名）
#[tauri::command]
pub async fn save_project_data(
    project_path: String,
    file_name: String,
    content: String,
) -> Result<(), String> {
    if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
        return Err("Invalid file name".to_string());
    }
    // 必须是有效工程（存在清单文件）
    crate::storage::resolve_manifest(&project_path)?;
    let data_dir = PathBuf::from(&project_path).join("data");
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Failed to create data dir: {}", e))?;
    let target = data_dir.join(&file_name);
    let tmp = data_dir.join(format!("{}.tmp", file_name));
    std::fs::write(&tmp, content).map_err(|e| format!("Failed to write data: {}", e))?;
    std::fs::rename(&tmp, &target).map_err(|e| format!("Failed to replace data: {}", e))?;
    Ok(())
}

/// 读取工程内数据文件（不存在返回 None）
#[tauri::command]
pub async fn load_project_data(
    project_path: String,
    file_name: String,
) -> Result<Option<String>, String> {
    if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
        return Err("Invalid file name".to_string());
    }
    let target = PathBuf::from(&project_path).join("data").join(&file_name);
    match std::fs::read_to_string(&target) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Failed to read data: {}", e)),
    }
}

/// 更新工程清单的名称/描述（原地覆写清单文件，文件名保持不变）
#[tauri::command]
pub async fn update_project_manifest(
    project_path: String,
    name: Option<String>,
    description: Option<String>,
) -> Result<ProjectMetadata, String> {
    let manifest_path = crate::storage::resolve_manifest(&project_path)?;
    let mut meta = crate::storage::read_manifest(&manifest_path)?;
    if let Some(n) = name {
        let n = n.trim().to_string();
        if !n.is_empty() {
            meta.name = n;
        }
    }
    if let Some(d) = description {
        meta.description = Some(d);
    }
    meta.updated_at = chrono::Utc::now().to_rfc3339();
    let content = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    std::fs::write(&manifest_path, content)
        .map_err(|e| format!("Failed to write manifest: {}", e))?;
    Ok(meta)
}

/// 默认工程根目录（供前端"新建工程"对话框预填）
#[tauri::command]
pub async fn get_default_projects_root() -> Result<String, String> {
    Ok(crate::storage::default_projects_root().to_string_lossy().to_string())
}

/// 选择文件对话框
#[tauri::command]
pub async fn select_file(
    _title: String,
    _filters: Vec<(String, Vec<String>)>,
) -> Result<Option<String>, String> {
    // TODO: 使用 tauri-plugin-dialog 实现文件选择
    // 暂时返回 None，前端会使用自己的文件选择器
    Ok(None)
}

/// 选择目录对话框
#[tauri::command]
pub async fn select_directory(
    _title: String,
) -> Result<Option<String>, String> {
    // TODO: 使用 tauri-plugin-dialog 实现目录选择
    // 暂时返回 None，前端会使用自己的目录选择器
    Ok(None)
}

/// 在资源管理器中显示文件
#[tauri::command]
pub async fn show_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to open finder: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }
    
    Ok(())
}

/// 打开文件
#[tauri::command]
pub async fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("cmd")
            .args(["/c", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }
    
    Ok(())
}

/// 导入媒体文件到工程（project_path 为工程文件夹路径）
#[tauri::command]
pub async fn import_media_file(
    project_path: String,
    source_path: String,
) -> Result<MediaFileInfo, String> {
    // 校验工程有效性
    crate::storage::resolve_manifest(&project_path)?;
    let source = PathBuf::from(&source_path);
    let media_dir = PathBuf::from(&project_path).join("media");
    std::fs::create_dir_all(&media_dir)
        .map_err(|e| format!("Failed to create media dir: {}", e))?;

    let file_name = source
        .file_name()
        .ok_or("Invalid file name")?
        .to_string_lossy()
        .to_string();
    let dest_path = {
        let mut candidate = media_dir.join(&file_name);
        let stem = PathBuf::from(&file_name)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".into());
        let ext = PathBuf::from(&file_name)
            .extension()
            .map(|s| format!(".{}", s.to_string_lossy()))
            .unwrap_or_default();
        let mut idx = 1;
        while candidate.exists() {
            candidate = media_dir.join(format!("{}-{}{}", stem, idx, ext));
            idx += 1;
        }
        candidate
    };

    std::fs::copy(&source, &dest_path)
        .map_err(|e| format!("Failed to copy file: {}", e))?;

    // 获取文件信息
    let file_size = crate::storage::get_file_size(&dest_path)?;
    let mime_type = crate::storage::get_mime_type(&dest_path);
    let stored_name = dest_path
        .file_name()
        .ok_or("Invalid file name")?
        .to_string_lossy()
        .to_string();

    let media_info = MediaFileInfo {
        id: Uuid::new_v4().to_string(),
        file_name: stored_name,
        file_path: dest_path.to_string_lossy().to_string(),
        file_type: determine_file_type(&mime_type),
        file_size,
        mime_type,
        duration: None,
        width: None,
        height: None,
        thumbnail_path: None,
    };

    Ok(media_info)
}

/// 根据 MIME 类型判断文件类型
fn determine_file_type(mime_type: &str) -> String {
    if mime_type.starts_with("image/") {
        "image".to_string()
    } else if mime_type.starts_with("video/") {
        "video".to_string()
    } else if mime_type.starts_with("audio/") {
        "audio".to_string()
    } else {
        "other".to_string()
    }
}

/// 获取应用数据目录
#[tauri::command]
pub async fn get_app_data_dir(
    state: State<'_, AppState>,
) -> Result<String, String> {
    Ok(state.storage.root.to_string_lossy().to_string())
}

/// 获取项目目录
#[tauri::command]
pub async fn get_project_dir(
    project_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let project_dir = state.storage.get_project_dir(&project_id);
    Ok(project_dir.to_string_lossy().to_string())
}
