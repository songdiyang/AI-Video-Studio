// 工程归档包（.jzp = ZIP）
//
// 归档内容（根目录）：
//   project.json
//   data/<文档>.json
//   media/<素材与产物>
//
// 工作态仍是普通文件夹，归档包只用于分发/备份/双击打开；
// 导入时整包解到工程根目录，不产生任何额外格式。

use crate::storage::{self, ProjectMetadata};
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const MANIFEST: &str = "project.json";
const PACKAGE_EXT: &str = "jzp";
const MAX_UNPACK_BYTES: u64 = 20 * 1024 * 1024 * 1024;

fn normalize_rel(name: &str) -> Option<PathBuf> {
    let normalized = name.replace('\\', "/");
    if normalized.starts_with('/') || normalized.contains(':') {
        return None;
    }
    let mut rel = PathBuf::new();
    for part in normalized.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return None;
        }
        rel.push(part);
    }
    if rel.as_os_str().is_empty() {
        None
    } else {
        Some(rel)
    }
}

fn collect_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries =
        std::fs::read_dir(dir).map_err(|e| format!("读取目录失败 {:?}: {}", dir, e))?;
    for entry in entries.flatten() {
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            collect_files(&path, out)?;
        } else if file_type.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

fn add_entry(
    zip: &mut ZipWriter<File>,
    project_dir: &Path,
    rel: &Path,
) -> Result<(), String> {
    let full = project_dir.join(rel);
    let name = rel.to_string_lossy().replace('\\', "/");
    let size = std::fs::metadata(&full)
        .map(|m| m.len())
        .map_err(|e| format!("读取文件信息失败 {:?}: {}", full, e))?;
    let method = if name.ends_with(".json") {
        CompressionMethod::Deflated
    } else {
        CompressionMethod::Stored
    };
    let options = FileOptions::default()
        .compression_method(method)
        .large_file(size > u32::MAX as u64);
    zip.start_file(name, options)
        .map_err(|e| format!("写入归档条目失败: {}", e))?;
    let mut file =
        File::open(&full).map_err(|e| format!("读取文件失败 {:?}: {}", full, e))?;
    std::io::copy(&mut file, zip).map_err(|e| format!("写入归档内容失败: {}", e))?;
    Ok(())
}

/// 读取归档包内的清单（不会解包）
pub fn read_package_manifest(package: &Path) -> Result<ProjectMetadata, String> {
    let file = File::open(package).map_err(|e| format!("无法打开工程包: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|_| "不是有效的 .jzp 工程包".to_string())?;
    let mut entry = archive
        .by_name(MANIFEST)
        .map_err(|_| "工程包缺少 project.json".to_string())?;
    let mut text = String::new();
    entry
        .read_to_string(&mut text)
        .map_err(|e| format!("读取工程包清单失败: {}", e))?;
    serde_json::from_str(&text).map_err(|e| format!("工程包清单无效: {}", e))
}

/// 把工作态工程打包为 .jzp（原子写：先落临时文件再替换）
pub fn export_package(project_path: &str, dest: &str) -> Result<String, String> {
    let manifest_path = storage::resolve_manifest(project_path)?;
    let project_dir = manifest_path
        .parent()
        .ok_or("Invalid manifest location")?
        .to_path_buf();
    let meta = storage::read_manifest(&manifest_path)?;

    let mut dest_path = PathBuf::from(dest);
    if dest_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case(PACKAGE_EXT))
        .unwrap_or(false)
        == false
    {
        dest_path.set_extension(PACKAGE_EXT);
    }
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建导出目录 {:?}: {}", parent, e))?;
    }
    let tmp = dest_path.with_extension("jzp.tmp");

    {
        let file = File::create(&tmp).map_err(|e| format!("无法创建归档文件: {}", e))?;
        let mut zip = ZipWriter::new(file);

        let manifest_json = serde_json::to_string_pretty(&meta)
            .map_err(|e| format!("序列化工程清单失败: {}", e))?;
        zip.start_file(
            MANIFEST,
            FileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|e| format!("写入归档清单失败: {}", e))?;
        zip.write_all(manifest_json.as_bytes())
            .map_err(|e| format!("写入归档清单失败: {}", e))?;

        // 归档只包含数据与素材；exports/ 属于产物，不随工程分发
        for sub in ["data", "media"] {
            let dir = project_dir.join(sub);
            if !dir.is_dir() {
                continue;
            }
            let mut files = Vec::new();
            collect_files(&dir, &mut files)?;
            for full in files {
                let rel = full
                    .strip_prefix(&project_dir)
                    .map_err(|_| "归档路径解析失败".to_string())?;
                add_entry(&mut zip, &project_dir, rel)?;
            }
        }

        zip.finish().map_err(|e| format!("完成归档失败: {}", e))?;
    }

    std::fs::rename(&tmp, &dest_path)
        .map_err(|e| format!("替换归档文件失败: {}", e))?;
    Ok(dest_path.to_string_lossy().to_string())
}

/// 解包 .jzp 到目标目录（重名自动追加序号），并写回指向新路径的清单
pub fn import_package(package: &Path, dest_root: &Path) -> Result<ProjectMetadata, String> {
    let meta_template = read_package_manifest(package)?;
    std::fs::create_dir_all(dest_root)
        .map_err(|e| format!("无法创建工程根目录 {:?}: {}", dest_root, e))?;

    let base_name = storage::sanitize_folder_name(&meta_template.name);
    let mut folder = base_name.clone();
    let mut idx = 1;
    while dest_root.join(&folder).exists() {
        folder = format!("{}-{}", base_name, idx);
        idx += 1;
    }
    let project_dir = dest_root.join(&folder);
    std::fs::create_dir_all(&project_dir)
        .map_err(|e| format!("无法创建工程目录 {:?}: {}", project_dir, e))?;

    let result = (|| -> Result<(), String> {
        let file = File::open(package).map_err(|e| format!("无法打开工程包: {}", e))?;
        let mut archive =
            ZipArchive::new(file).map_err(|_| "不是有效的 .jzp 工程包".to_string())?;
        let mut total: u64 = 0;
        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("读取归档条目失败: {}", e))?;
            if entry.is_dir() {
                continue;
            }
            let name = entry.name().to_string();
            let Some(rel) = normalize_rel(&name) else {
                continue;
            };
            if rel == Path::new(MANIFEST) {
                continue; // 清单在最后统一写入（path 需指向新位置）
            }
            let first = rel.components().next().and_then(|c| match c {
                Component::Normal(seg) => seg.to_str(),
                _ => None,
            });
            if first != Some("data") && first != Some("media") {
                continue;
            }
            total = total.saturating_add(entry.size());
            if total > MAX_UNPACK_BYTES {
                return Err("工程包解压后体积超出限制（20GB）".to_string());
            }
            let out = project_dir.join(&rel);
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("创建目录失败 {:?}: {}", parent, e))?;
            }
            let mut target =
                File::create(&out).map_err(|e| format!("写出文件失败 {:?}: {}", out, e))?;
            std::io::copy(&mut entry, &mut target)
                .map_err(|e| format!("解包文件失败 {:?}: {}", out, e))?;
        }
        Ok(())
    })();

    if let Err(err) = result {
        let _ = std::fs::remove_dir_all(&project_dir);
        return Err(err);
    }

    let mut meta = meta_template;
    meta.path = project_dir.to_string_lossy().to_string();
    meta.updated_at = chrono::Utc::now().to_rfc3339();
    storage::write_manifest(&project_dir, &meta)?;
    Ok(meta)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("jzp-test-{}-{}", tag, uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn export_import_roundtrip() {
        let root = temp_dir("src");
        let project_dir = root.join("示例工程");
        std::fs::create_dir_all(project_dir.join("data")).unwrap();
        std::fs::create_dir_all(project_dir.join("media")).unwrap();
        std::fs::write(project_dir.join("data").join("scripts.json"), "{\"scripts\":[]}").unwrap();
        std::fs::write(project_dir.join("media").join("a.txt"), b"hello").unwrap();

        let meta = crate::storage::ProjectMetadata {
            schema_version: 1,
            id: "test-id".into(),
            name: "示例工程".into(),
            description: None,
            project_type: "comic_drama".into(),
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
            thumbnail_path: None,
            path: project_dir.to_string_lossy().to_string(),
        };
        crate::storage::write_manifest(&project_dir, &meta).unwrap();

        let dest = root.join("out.jzp");
        export_package(&project_dir.to_string_lossy(), &dest.to_string_lossy()).unwrap();

        let dest_root = temp_dir("dst");
        let imported = import_package(&dest, &dest_root).unwrap();
        assert_eq!(imported.id, "test-id");
        assert_eq!(imported.name, "示例工程");
        let imported_dir = PathBuf::from(&imported.path);
        assert!(imported_dir.join("project.json").is_file());
        assert_eq!(
            std::fs::read_to_string(imported_dir.join("data").join("scripts.json")).unwrap(),
            "{\"scripts\":[]}"
        );
        assert_eq!(
            std::fs::read_to_string(imported_dir.join("media").join("a.txt")).unwrap(),
            "hello"
        );

        let _ = std::fs::remove_dir_all(&root);
        let _ = std::fs::remove_dir_all(&dest_root);
    }
}
