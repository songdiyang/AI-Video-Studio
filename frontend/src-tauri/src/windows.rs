//! 多窗口支持：在同一应用进程内为新工程开独立窗口（VS Code 式多窗口）。
//!
//! 每个窗口通过 URL 参数 `windowProject` 绑定自己的工程目录，前端据此加载对应工程，
//! 且独立窗口不回写 localStorage 的「上次工程」，因此主窗口与各工程窗口互不干扰。
//!
//! 同一工程只允许一个窗口打开：`claim_project_window` 维护 label → 工程目录的占用表，
//! 后到的窗口得到「已被占用」的结果，由前端聚焦原窗口并关闭自己。

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// 前端 URL 参数名（与 services/windowProject.ts 保持一致）
pub const WINDOW_PROJECT_PARAM: &str = "windowProject";
/// 独立窗口标记参数：无工程的新窗口也用它，避免继承主窗口的「上次工程」
pub const WINDOW_MODE_PARAM: &str = "window";
pub const WINDOW_MODE_DETACHED: &str = "detached";

/// 窗口级工程占用表（窗口 label → 归一化工程目录）
pub struct WindowProjectRegistry {
    projects: Mutex<HashMap<String, String>>,
}

impl Default for WindowProjectRegistry {
    fn default() -> Self {
        Self {
            projects: Mutex::new(HashMap::new()),
        }
    }
}

/// 工程目录归一化：Windows 大小写不敏感，且允许用户传入带尾部分隔符的路径
fn normalize_project_key(path: &str) -> String {
    path.trim().trim_end_matches(['\\', '/']).to_lowercase()
}

/// 把已有窗口唤到前台
fn focus_window(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 注册窗口级工程占用表
pub fn init(app: &tauri::App) {
    app.manage(WindowProjectRegistry::default());
}

/// 窗口销毁时释放它占用的工程（由 Builder::on_window_event 调用）
pub fn release_window(app: &AppHandle, label: &str) {
    if let Some(registry) = app.try_state::<WindowProjectRegistry>() {
        if let Ok(mut map) = registry.projects.lock() {
            map.remove(label);
        }
    }
}

/// 声明本窗口要打开某个工程。
/// 返回 `Some(label)` 表示该工程已被其它窗口占用（已聚焦那个窗口），调用方应放弃打开。
#[tauri::command]
pub async fn claim_project_window(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, WindowProjectRegistry>,
    path: String,
) -> Result<Option<String>, String> {
    let key = normalize_project_key(&path);
    if key.is_empty() {
        return Ok(None);
    }
    let label = window.label().to_string();
    let mut map = state.projects.lock().map_err(|_| "窗口状态锁异常".to_string())?;

    if let Some(existing) = map
        .iter()
        .find(|(owner, project)| owner.as_str() != label.as_str() && **project == key)
        .map(|(owner, _)| owner.clone())
    {
        focus_window(&app, &existing);
        return Ok(Some(existing));
    }

    // 本窗口改换工程时直接覆盖旧登记
    map.insert(label, key);
    Ok(None)
}

/// 仅保留 RFC 3986 unreserved 字符，其余按 UTF-8 百分号编码（路径含中文时必需）
fn encode_uri_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            _ => out.push_str(&format!("%{:02X}", byte)),
        }
    }
    out
}

/// 在新窗口中打开工程；path 为空时创建空白独立窗口（文件 › 新建窗口）
#[tauri::command]
pub async fn open_project_window(
    app: AppHandle,
    state: State<'_, WindowProjectRegistry>,
    path: Option<String>,
    title: Option<String>,
) -> Result<(), String> {
    let mut query = format!("{}={}", WINDOW_MODE_PARAM, WINDOW_MODE_DETACHED);
    let mut bound_key: Option<String> = None;

    if let Some(raw_path) = path.filter(|p| !p.trim().is_empty()) {
        let manifest = crate::storage::resolve_manifest(&raw_path)?;
        let project_dir = manifest
            .parent()
            .ok_or("Invalid manifest location")?
            .to_path_buf();
        let dir_str = project_dir.to_string_lossy().to_string();
        let key = normalize_project_key(&dir_str);

        // 该工程已在别的窗口打开：以原窗口为准，直接唤到前台，不再新建
        {
            let map = state.projects.lock().map_err(|_| "窗口状态锁异常".to_string())?;
            if let Some(existing) = map
                .iter()
                .find(|(_, project)| **project == key)
                .map(|(owner, _)| owner.clone())
            {
                focus_window(&app, &existing);
                return Ok(());
            }
        }

        // 新窗口同样是独立 WebView，需要授权工程 media/ 目录才能渲染素材
        crate::commands::grant_project_media_scope(&app, &dir_str);
        query.push_str(&format!(
            "&{}={}",
            WINDOW_PROJECT_PARAM,
            encode_uri_component(&dir_str)
        ));
        bound_key = Some(key);
    }

    let label = format!("project-{}", uuid::Uuid::new_v4().simple());
    let url = WebviewUrl::App(format!("index.html?{}", query).into());
    let window_title = title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| "AI视频编辑器".to_string());

    WebviewWindowBuilder::new(&app, label.clone(), url)
        .title(window_title)
        .inner_size(1400.0, 900.0)
        .min_inner_size(1200.0, 700.0)
        // 与主窗口一致：无系统装饰，使用应用内自绘标题栏
        .decorations(false)
        .center()
        .build()
        .map_err(|e| format!("创建窗口失败: {}", e))?;

    if let Some(key) = bound_key {
        if let Ok(mut map) = state.projects.lock() {
            map.insert(label, key);
        }
    }

    Ok(())
}
