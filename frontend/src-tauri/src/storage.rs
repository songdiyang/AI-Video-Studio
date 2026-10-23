// 本地存储管理模块
// 管理应用的所有本地数据存储

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::AppHandle;

/// 应用数据目录结构
pub struct StoragePaths {
    pub root: PathBuf,
    pub database: PathBuf,
    pub projects: PathBuf,
    pub media: PathBuf,
    pub cache: PathBuf,
    pub exports: PathBuf,
}

impl StoragePaths {
    /// 初始化存储路径
    pub fn new(_app_handle: &AppHandle) -> Result<Self, String> {
        // 使用 dirs crate 获取应用数据目录
        let app_data_dir = dirs::data_local_dir()
            .ok_or("Failed to get app data directory")?;

        let root = app_data_dir.join("AI-Video-Studio");
        
        let paths = StoragePaths {
            database: root.join("database"),
            projects: root.join("projects"),
            media: root.join("media"),
            cache: root.join("cache"),
            exports: root.join("exports"),
            root,
        };

        paths.ensure_directories()?;
        Ok(paths)
    }

    /// 确保所有目录存在
    fn ensure_directories(&self) -> Result<(), String> {
        let dirs = vec![
            &self.root,
            &self.database,
            &self.projects,
            &self.media,
            &self.cache,
            &self.exports,
        ];

        for dir in dirs {
            std::fs::create_dir_all(dir)
                .map_err(|e| format!("Failed to create directory {:?}: {}", dir, e))?;
        }

        Ok(())
    }

    /// 获取项目目录
    pub fn get_project_dir(&self, project_id: &str) -> PathBuf {
        self.projects.join(project_id)
    }

}

/// 项目元数据（持久化为工程文件夹内的 .jzp 清单文件）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetadata {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub project_type: String,
    pub created_at: String,
    pub updated_at: String,
    pub thumbnail_path: Option<String>,
    /// 工程文件夹绝对路径
    pub path: String,
}

// ==================== 本地工程：工作态文件夹 + 归档包 ====================
//
// 工作态（文件夹 = 工作区）：
//   <目录>\<工程名>\
//     ├── project.json    ← 工程清单（索引/元数据）
//     ├── data\           ← 结构化数据文档（scripts / storyboards …）
//     ├── media\          ← 素材与生成产物
//     └── exports\        ← 导出产物
//
// 归档态（.jzp = ZIP）：project.json + data/ + media/
// 注册表：<appdata>\AI-Video-Studio\recent_projects.json
//   [{ "path": "<工程文件夹>", "last_opened": "rfc3339" }]

/// 注册表条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryEntry {
    pub path: String,
    pub last_opened: String,
}

/// 工作态清单文件名
pub const MANIFEST_FILE_NAME: &str = "project.json";
/// 归档包后缀
pub const PROJECT_FILE_EXT: &str = "jzp";

/// 默认工程根目录：文档\AI-Video-Studio作品
pub fn default_projects_root() -> PathBuf {
    dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("AI-Video-Studio作品")
}

/// 清洗文件夹名：去掉 Windows/Linux 非法字符
pub fn sanitize_folder_name(name: &str) -> String {
    let illegal = ['\\', '/', '<', '>', ':', '"', '|', '?', '*'];
    let cleaned: String = name
        .chars()
        .filter(|c| !illegal.contains(c) && !c.is_control())
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "未命名作品".to_string()
    } else {
        trimmed
    }
}

/// 注册表文件路径
pub fn registry_path(app_root: &PathBuf) -> PathBuf {
    app_root.join("recent_projects.json")
}

/// 读取注册表（不存在/损坏时返回空表）
pub fn read_registry(app_root: &PathBuf) -> Vec<RegistryEntry> {
    match std::fs::read_to_string(registry_path(app_root)) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// 写入注册表（原子写：tmp + rename）
pub fn write_registry(app_root: &PathBuf, entries: &[RegistryEntry]) -> Result<(), String> {
    let target = registry_path(app_root);
    let tmp = target.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(entries)
        .map_err(|e| format!("Failed to serialize registry: {}", e))?;
    std::fs::write(&tmp, content).map_err(|e| format!("Failed to write registry: {}", e))?;
    std::fs::rename(&tmp, &target).map_err(|e| format!("Failed to replace registry: {}", e))?;
    Ok(())
}

/// 查找工程文件夹内的清单文件（project.json）
/// 兼容旧版 <工程名>.jzp（JSON 清单）：首次读取时就地迁移为 project.json。
pub fn find_manifest(project_dir: &PathBuf) -> Option<PathBuf> {
    if !project_dir.is_dir() {
        return None;
    }
    let canonical = project_dir.join(MANIFEST_FILE_NAME);
    if canonical.is_file() {
        return Some(canonical);
    }

    // 归档包是 ZIP（PK 开头），不会被误迁移
    let entries = std::fs::read_dir(project_dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some(PROJECT_FILE_EXT) && path.is_file() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if content.trim_start().starts_with('{') {
                    let _ = std::fs::rename(&path, &canonical);
                    return Some(canonical);
                }
            }
        }
    }
    None
}

/// 解析工程路径 → 清单文件路径。
/// 支持工程文件夹或 project.json；.jzp 是归档包，需通过导入流程解包。
pub fn resolve_manifest(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path);
    if p.is_file() {
        if p.file_name().and_then(|n| n.to_str()) == Some(MANIFEST_FILE_NAME) {
            return Ok(p);
        }
        if p.extension().and_then(|e| e.to_str()) == Some(PROJECT_FILE_EXT) {
            return Err("这是 .jzp 工程归档包，请使用「导入 .jzp 工程包」打开".to_string());
        }
    }
    if p.is_dir() {
        if let Some(m) = find_manifest(&p) {
            return Ok(m);
        }
    }
    Err(format!("未找到工程清单文件: {}", path))
}

/// 读取并解析清单文件
pub fn read_manifest(manifest_path: &PathBuf) -> Result<ProjectMetadata, String> {
    let content = std::fs::read_to_string(manifest_path)
        .map_err(|e| format!("Failed to read manifest: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Invalid manifest {:?}: {}", manifest_path, e))
}

/// 写入清单文件（原子写；固定为 project.json，改名工程不重命名文件）
pub fn write_manifest(project_dir: &PathBuf, meta: &ProjectMetadata) -> Result<PathBuf, String> {
    let manifest_path = project_dir.join(MANIFEST_FILE_NAME);
    let tmp = project_dir.join("project.json.tmp");
    let content = serde_json::to_string_pretty(meta)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    std::fs::write(&tmp, content).map_err(|e| format!("Failed to write manifest: {}", e))?;
    std::fs::rename(&tmp, &manifest_path).map_err(|e| format!("Failed to replace manifest: {}", e))?;
    Ok(manifest_path)
}

/// 注册/更新一个工程路径到注册表，并顺带清理失效条目
pub fn upsert_registry(app_root: &PathBuf, project_dir: &PathBuf) -> Result<(), String> {
    let path_str = project_dir.to_string_lossy().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let mut entries = read_registry(app_root);
    // 清理：清单已不存在的条目
    entries.retain(|e| resolve_manifest(&e.path).is_ok());
    match entries.iter_mut().find(|e| e.path == path_str) {
        Some(entry) => entry.last_opened = now,
        None => entries.push(RegistryEntry { path: path_str, last_opened: now }),
    }
    write_registry(app_root, &entries)
}

/// 从注册表移除一个工程路径
pub fn remove_from_registry(app_root: &PathBuf, path: &str) -> Result<(), String> {
    let mut entries = read_registry(app_root);
    entries.retain(|e| e.path != path);
    write_registry(app_root, &entries)
}

/// 媒体文件信息
#[derive(Debug, Serialize, Deserialize)]
pub struct MediaFileInfo {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub file_type: String,
    pub file_size: u64,
    pub mime_type: String,
    pub duration: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub thumbnail_path: Option<String>,
}

/// 获取文件 MIME 类型
pub fn get_mime_type(path: &PathBuf) -> String {
    mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string()
}

/// 获取文件大小
pub fn get_file_size(path: &PathBuf) -> Result<u64, String> {
    std::fs::metadata(path)
        .map(|m| m.len())
        .map_err(|e| format!("Failed to get file size: {}", e))
}
