// 工程快照：不可逆操作前的「后悔药」
//
// 快照 = 工程 data/ 下全部 JSON 文档 + project.json 清单的副本，
// 存放于 <工程文件夹>/snapshots/<id>/，保留最近 N 份（默认 10）。
//
// 为什么只备份 data/ 就够：实体删除（分镜/角色/道具…）只移除 JSON 引用，
// media/ 下的素材文件从不被物理删除（全工程删除除外），
// 因此恢复 data/ 引用即可完整还原素材链接与全部结构化数据。
//
// 恢复前会先对当前状态自动打一份快照（trigger=restore），
// 保证「恢复」本身也是可回退的。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// 快照元数据（落盘为 snapshots/<id>/meta.json）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotMeta {
    pub id: String,
    pub created_at: String,
    /// 人类可读说明（如「智能体：删除角色」/「手动备份」）
    pub label: String,
    /// 触发来源：agent / manual / restore
    pub trigger: String,
}

/// 默认保留份数
const DEFAULT_KEEP: usize = 10;
/// 快照目录名
const SNAPSHOTS_DIR: &str = "snapshots";

/// 校验快照 id：只允许字母数字与连字符，杜绝路径穿越
fn validate_snapshot_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("非法的快照 ID".to_string());
    }
    Ok(())
}

/// 解析工程文件夹（必须存在清单文件）
fn resolve_project_dir(project_path: &str) -> Result<PathBuf, String> {
    let manifest = crate::storage::resolve_manifest(project_path)?;
    manifest
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "无效的工程清单位置".to_string())
}

/// 复制目录下全部 .json 文件（不递归）
fn copy_json_files(src: &Path, dst: &Path) -> Result<usize, String> {
    if !src.is_dir() {
        return Ok(0);
    }
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("无法创建目录 {:?}: {}", dst, e))?;
    let mut count = 0usize;
    let entries = std::fs::read_dir(src)
        .map_err(|e| format!("无法读取目录 {:?}: {}", src, e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
            let target = dst.join(entry.file_name());
            std::fs::copy(&path, &target)
                .map_err(|e| format!("无法复制 {:?}: {}", path, e))?;
            count += 1;
        }
    }
    Ok(count)
}

/// 读取全部快照元数据（按创建时间倒序；损坏的条目跳过）
fn read_all_meta(project_dir: &Path) -> Vec<SnapshotMeta> {
    let root = project_dir.join(SNAPSHOTS_DIR);
    let mut list: Vec<SnapshotMeta> = Vec::new();
    let entries = match std::fs::read_dir(&root) {
        Ok(e) => e,
        Err(_) => return list,
    };
    for entry in entries.flatten() {
        let meta_path = entry.path().join("meta.json");
        if let Ok(content) = std::fs::read_to_string(&meta_path) {
            if let Ok(meta) = serde_json::from_str::<SnapshotMeta>(&content) {
                list.push(meta);
            }
        }
    }
    list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    list
}

/// 超出保留份数的旧快照整目录移除
fn prune(project_dir: &Path, keep: usize) {
    let list = read_all_meta(project_dir);
    for meta in list.iter().skip(keep) {
        let dir = project_dir.join(SNAPSHOTS_DIR).join(&meta.id);
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// 内部创建实现（命令与「恢复前自动备份」共用）
fn create_inner(
    project_dir: &Path,
    label: &str,
    trigger: &str,
    keep: usize,
) -> Result<SnapshotMeta, String> {
    let now = chrono::Utc::now();
    // 时间戳 + 短 uuid：同一秒内多次备份也不冲突
    let id = format!(
        "{}-{}",
        now.format("%Y%m%d-%H%M%S"),
        &Uuid::new_v4().to_string()[..8]
    );
    let snap_dir = project_dir.join(SNAPSHOTS_DIR).join(&id);
    std::fs::create_dir_all(&snap_dir)
        .map_err(|e| format!("无法创建快照目录: {}", e))?;

    let doc_count = copy_json_files(&project_dir.join("data"), &snap_dir.join("data"))?;
    let manifest = project_dir.join(crate::storage::MANIFEST_FILE_NAME);
    if manifest.is_file() {
        std::fs::copy(&manifest, snap_dir.join(crate::storage::MANIFEST_FILE_NAME))
            .map_err(|e| format!("无法备份工程清单: {}", e))?;
    }

    let meta = SnapshotMeta {
        id: id.clone(),
        created_at: now.to_rfc3339(),
        label: label.to_string(),
        trigger: trigger.to_string(),
    };
    let meta_json = serde_json::to_string_pretty(&meta)
        .map_err(|e| format!("无法序列化快照元数据: {}", e))?;
    std::fs::write(snap_dir.join("meta.json"), meta_json)
        .map_err(|e| format!("无法写入快照元数据: {}", e))?;

    log::info!(
        "[snapshot] 已创建工程快照 {}（{} 个文档，trigger={}）",
        id,
        doc_count,
        trigger
    );
    prune(project_dir, keep.max(1));
    Ok(meta)
}

/// 创建工程快照（不可逆动作执行前 / 用户手动备份）
#[tauri::command]
pub async fn create_project_snapshot(
    project_path: String,
    label: String,
    trigger: String,
    keep: Option<usize>,
) -> Result<SnapshotMeta, String> {
    let project_dir = resolve_project_dir(&project_path)?;
    create_inner(
        &project_dir,
        &label,
        &trigger,
        keep.unwrap_or(DEFAULT_KEEP),
    )
}

/// 列出工程快照（按创建时间倒序）
#[tauri::command]
pub async fn list_project_snapshots(
    project_path: String,
) -> Result<Vec<SnapshotMeta>, String> {
    let project_dir = resolve_project_dir(&project_path)?;
    Ok(read_all_meta(&project_dir))
}

/// 恢复工程快照：
/// 1) 先对当前状态自动备份（trigger=restore），恢复本身可回退；
/// 2) 用快照的 data/ 整体替换当前 data/（快照后新增的文档一并移除，才是真还原）；
/// 3) 还原 project.json 清单。
/// 前端恢复后需失效本地缓存并重载窗口。
#[tauri::command]
pub async fn restore_project_snapshot(
    project_path: String,
    snapshot_id: String,
) -> Result<SnapshotMeta, String> {
    validate_snapshot_id(&snapshot_id)?;
    let project_dir = resolve_project_dir(&project_path)?;
    let snap_dir = project_dir.join(SNAPSHOTS_DIR).join(&snapshot_id);
    if !snap_dir.join("meta.json").is_file() {
        return Err(format!("快照不存在: {}", snapshot_id));
    }

    // 恢复前先给当前状态留一份后悔药
    let pre = create_inner(&project_dir, "恢复前自动备份", "restore", DEFAULT_KEEP)?;

    // 整体替换 data/：先移除现有 JSON 文档，再复制快照文档
    let data_dir = project_dir.join("data");
    if data_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&data_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
                    std::fs::remove_file(&path)
                        .map_err(|e| format!("无法清理当前文档 {:?}: {}", path, e))?;
                }
            }
        }
    }
    copy_json_files(&snap_dir.join("data"), &data_dir)?;

    // 还原清单（工程路径不变，直接覆盖）
    let snap_manifest = snap_dir.join(crate::storage::MANIFEST_FILE_NAME);
    if snap_manifest.is_file() {
        let target = project_dir.join(crate::storage::MANIFEST_FILE_NAME);
        let tmp = project_dir.join("project.json.tmp");
        std::fs::copy(&snap_manifest, &tmp)
            .map_err(|e| format!("无法还原工程清单: {}", e))?;
        std::fs::rename(&tmp, &target)
            .map_err(|e| format!("无法替换工程清单: {}", e))?;
    }

    log::info!("[snapshot] 已恢复工程快照 {}（恢复前备份 {}）", snapshot_id, pre.id);
    Ok(pre)
}

/// 删除指定快照
#[tauri::command]
pub async fn delete_project_snapshot(
    project_path: String,
    snapshot_id: String,
) -> Result<(), String> {
    validate_snapshot_id(&snapshot_id)?;
    let project_dir = resolve_project_dir(&project_path)?;
    let dir = project_dir.join(SNAPSHOTS_DIR).join(&snapshot_id);
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir)
            .map_err(|e| format!("无法删除快照: {}", e))?;
    }
    Ok(())
}