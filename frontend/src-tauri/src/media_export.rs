//! 原生 ffmpeg 导出（桌面端 sidecar / PATH）。
//!
//! 浏览器端 FFmpeg.wasm 是软编码，长视频撞内存与速度墙；桌面端改由原生 ffmpeg
//! 进程编码（硬件/多线程可用），前端只负责构建参数（services/nativeExportPlan.ts，
//! 纯函数可单测），Rust 负责落工作目录、spawn 进程、解析进度并回传结果。
//!
//! 参数以 argv 数组直传 Command（不经过 shell），工作文件名做穿越校验。

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager};

/// 原生导出进度事件（payload: { percent, timeSec }）
pub const NATIVE_EXPORT_PROGRESS_EVENT: &str = "native-export-progress";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkFile {
    pub name: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeExportPlan {
    /// 输出目录（工程 exports/）
    pub workdir: String,
    /// 需写入工作目录的辅助文件（filelist.txt / subtitles.srt 等）
    pub files: Vec<WorkFile>,
    /// ffmpeg argv（不含程序名），相对工作目录引用文件
    pub args: Vec<String>,
    /// 输出文件名（相对工作目录）
    pub output_name: String,
    /// 预估总时长（秒），用于把 ffmpeg time= 换算成百分比；0 表示未知
    pub duration_hint_sec: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeExportOutcome {
    pub output_path: String,
    pub bytes: u64,
    pub log_tail: Vec<String>,
}

/// 校验工作文件名：禁止路径穿越与绝对路径
fn validate_work_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.contains("..") || name.starts_with('/') || name.contains(':') {
        return Err(format!("非法的工作文件名: {}", name));
    }
    Ok(())
}

/// 解析 ffmpeg 可执行文件：优先打包 sidecar（resource_dir），回退 PATH
fn resolve_ffmpeg(app: &AppHandle) -> PathBuf {
    if let Ok(res) = app.path().resource_dir() {
        for name in ["ffmpeg.exe", "ffmpeg"] {
            let p = res.join(name);
            if p.is_file() {
                return p;
            }
        }
    }
    PathBuf::from("ffmpeg")
}

/// 探测原生 ffmpeg 是否可用，返回版本首行
#[tauri::command]
pub async fn native_ffmpeg_probe(app: AppHandle) -> Result<String, String> {
    let bin = resolve_ffmpeg(&app);
    let out = Command::new(&bin)
        .arg("-version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| format!("无法启动 ffmpeg（{:?}）: {}", bin, e))?;
    if !out.status.success() {
        return Err("ffmpeg 返回非零退出码".to_string());
    }
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(text.lines().next().unwrap_or("ffmpeg").to_string())
}

/// 解析 ffmpeg stderr 中的 time=HH:MM:SS.ms 为秒
fn parse_time_sec(line: &str) -> Option<f64> {
    let idx = line.find("time=")?;
    let rest = &line[idx + 5..];
    let token: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == ':' || *c == '.').collect();
    let parts: Vec<&str> = token.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let s: f64 = parts[2].parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

/// 执行原生导出：写工作文件 → spawn ffmpeg → 进度事件 → 移动产物 → 清理
#[tauri::command]
pub async fn native_ffmpeg_export(app: AppHandle, plan: NativeExportPlan) -> Result<NativeExportOutcome, String> {
    let bin = resolve_ffmpeg(&app);
    let workdir = PathBuf::from(&plan.workdir);
    std::fs::create_dir_all(&workdir).map_err(|e| format!("无法创建导出目录: {}", e))?;
    let stamp = chrono::Utc::now().format("%Y%m%d-%H%M%S");
    let tmp = workdir.join(format!(".native-export-{}-{}", stamp, &uuid::Uuid::new_v4().to_string()[..8]));
    std::fs::create_dir_all(&tmp).map_err(|e| format!("无法创建导出工作目录: {}", e))?;

    for f in &plan.files {
        validate_work_name(&f.name)?;
        std::fs::write(tmp.join(&f.name), &f.content).map_err(|e| format!("写入 {} 失败: {}", f.name, e))?;
    }
    validate_work_name(&plan.output_name)?;

    let mut child = Command::new(&bin)
        .args(&plan.args)
        .current_dir(&tmp)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动 ffmpeg（{:?}）: {}", bin, e))?;

    let stderr = child.stderr.take().ok_or("无法读取 ffmpeg stderr")?;
    let app_emit = app.clone();
    let hint = plan.duration_hint_sec;
    let reader = std::thread::spawn(move || {
        let mut tail: Vec<String> = Vec::new();
        for line in BufReader::new(stderr).lines().map_while(|l| l.ok()) {
            if let Some(sec) = parse_time_sec(&line) {
                let percent = if hint > 0.0 { ((sec / hint) * 100.0).min(99.0) } else { 0.0 };
                let _ = app_emit.emit(NATIVE_EXPORT_PROGRESS_EVENT, serde_json::json!({ "percent": percent, "timeSec": sec }));
            }
            tail.push(line);
            if tail.len() > 60 {
                tail.remove(0);
            }
        }
        tail
    });

    let status = child.wait().map_err(|e| format!("等待 ffmpeg 失败: {}", e))?;
    let log_tail = reader.join().unwrap_or_default();
    if !status.success() {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err(format!("ffmpeg 退出码 {:?}：{}", status.code(), log_tail.join("\n")));
    }

    let produced = tmp.join(&plan.output_name);
    if !produced.is_file() {
        let _ = std::fs::remove_dir_all(&tmp);
        return Err("ffmpeg 未生成输出文件".to_string());
    }
    let bytes = std::fs::metadata(&produced).map(|m| m.len()).unwrap_or(0);
    let final_path = workdir.join(&plan.output_name);
    std::fs::copy(&produced, &final_path).map_err(|e| format!("移动导出产物失败: {}", e))?;
    let _ = std::fs::remove_dir_all(&tmp);

    Ok(NativeExportOutcome {
        output_path: final_path.to_string_lossy().to_string(),
        bytes,
        log_tail,
    })
}

/// 把已导出的产物另存为用户选择的位置（桌面下载等价物）
#[tauri::command]
pub async fn save_export_file(app: AppHandle, path: String, default_name: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let src = PathBuf::from(&path);
    if !src.is_file() {
        return Err("导出产物不存在".to_string());
    }
    let picked = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file();
    let Some(target) = picked else { return Ok(None) };
    let target = target.into_path().map_err(|e| format!("无效保存路径: {}", e))?;
    std::fs::copy(&src, &target).map_err(|e| format!("保存失败: {}", e))?;
    Ok(Some(target.to_string_lossy().to_string()))
}

/// 把二进制素材（如 TTS 台词配音）写入工程 media/ 并授权 asset 作用域。
/// 返回绝对文件路径，前端用 convertFileSrc 转可播放 URL。
#[tauri::command]
pub async fn save_media_bytes(
    app: AppHandle,
    project_path: String,
    file_name: String,
    data: Vec<u8>,
) -> Result<String, String> {
    validate_work_name(&file_name)?;
    let manifest = crate::storage::resolve_manifest(&project_path)?;
    let project_dir = manifest.parent().ok_or("无效的工程清单位置")?;
    let media_dir = project_dir.join("media");
    std::fs::create_dir_all(&media_dir).map_err(|e| format!("无法创建 media 目录: {}", e))?;
    let target = media_dir.join(&file_name);
    std::fs::write(&target, &data).map_err(|e| format!("写入素材失败: {}", e))?;
    crate::commands::grant_project_media_scope(&app, &project_path);
    Ok(target.to_string_lossy().to_string())
}