// Tauri 命令模块
// 提供前端调用的本地 API

use crate::storage::{StoragePaths, ProjectMetadata, MediaFileInfo};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

/// 应用状态
pub struct AppState {
    pub storage: StoragePaths,
    /// 双击 / 命令行打开 .jzp 后待前端接管的工程目录（前端就绪后取走）
    pub pending_open: std::sync::Mutex<Option<String>>,
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

/// 打开工程：校验清单、更新注册表最近打开时间，并授权工程 media/ 目录供 asset 协议读取
#[tauri::command]
pub async fn open_project(
    app: AppHandle,
    path: String,
    state: State<'_, AppState>,
) -> Result<ProjectMetadata, String> {
    open_project_inner(&app, &state.storage, &path)
}

/// 打开已有工作态工程的内部实现（命令与双击入口共用）
fn open_project_inner(
    app: &AppHandle,
    storage: &StoragePaths,
    path: &str,
) -> Result<ProjectMetadata, String> {
    let manifest_path = crate::storage::resolve_manifest(path)?;
    let meta = crate::storage::read_manifest(&manifest_path)?;
    let project_dir = manifest_path
        .parent()
        .ok_or("Invalid manifest location")?
        .to_path_buf();
    crate::storage::upsert_registry(&storage.root, &project_dir)?;
    // 授予工程 media/ 目录（递归）读取权限，使已落地素材跨会话可渲染
    grant_media_scope(app, &project_dir.join("media"));
    Ok(meta)
}

/// 注册一个已存在的工程（文件夹或其 .jzp 文件路径）
#[tauri::command]
pub async fn register_project(
    app: AppHandle,
    path: String,
    state: State<'_, AppState>,
) -> Result<ProjectMetadata, String> {
    open_project(app, path, state).await
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

// ==================== AI 厂商代理（规避 WebView CORS） ====================

/// 转发的厂商请求（与前端 localAI.vendorFetch 的 payload 对齐）
#[derive(Debug, Deserialize)]
pub struct AiProxyRequest {
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
}

/// 厂商响应：整体返回 body 文本（不支持流式，流式由前端 WebView 直连）
#[derive(Debug, Serialize)]
pub struct AiProxyResponse {
    pub status: u16,
    pub body: String,
}

/// 用 reqwest 转发对厂商的 HTTP 调用，返回 { status, body }。
#[tauri::command]
pub async fn ai_proxy(req: AiProxyRequest) -> Result<AiProxyResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes())
        .map_err(|e| format!("无效请求方法: {}", e))?;
    let mut builder = client.request(method, &req.url);
    for (k, v) in &req.headers {
        builder = builder.header(k.as_str(), v.as_str());
    }
    if let Some(body) = &req.body {
        builder = builder.body(body.clone());
    }
    let resp = builder
        .send()
        .await
        .map_err(|e| format!("请求厂商失败: {}", e))?;
    let status = resp.status().as_u16();
    let body = resp
        .text()
        .await
        .map_err(|e| format!("读取厂商响应失败: {}", e))?;
    Ok(AiProxyResponse { status, body })
}

// ==================== 可灵 JWT（HS256，SecretKey 参与签名） ====================

/// HMAC-SHA256（用 sha2 手写，避免额外依赖）
fn hmac_sha256(key: &[u8], msg: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    const BLOCK: usize = 64;
    let mut k: Vec<u8> = if key.len() > BLOCK {
        let mut h = Sha256::new();
        h.update(key);
        h.finalize().to_vec()
    } else {
        key.to_vec()
    };
    if k.len() < BLOCK {
        k.resize(BLOCK, 0);
    }
    let mut ipad = vec![0u8; BLOCK];
    let mut opad = vec![0u8; BLOCK];
    for i in 0..BLOCK {
        ipad[i] = k[i] ^ 0x36;
        opad[i] = k[i] ^ 0x5c;
    }
    let mut inner = Sha256::new();
    inner.update(&ipad);
    inner.update(msg);
    let inner_hash = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(&opad);
    outer.update(inner_hash);
    let res = outer.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&res);
    out
}

/// base64url（无填充），JWT 段编码
fn b64url(input: &[u8]) -> String {
    use base64::{engine::general_purpose, Engine as _};
    general_purpose::URL_SAFE_NO_PAD.encode(input)
}

/// 解析可灵密钥：支持 "accessKey:secretKey" 或 "accessKey.secretKey"
fn parse_kling_key(api_key: &str) -> Result<(String, String), String> {
    let trimmed = api_key.trim();
    let (a, s) = if let Some(pos) = trimmed.find(':') {
        (&trimmed[..pos], &trimmed[pos + 1..])
    } else if let Some(pos) = trimmed.find('.') {
        (&trimmed[..pos], &trimmed[pos + 1..])
    } else {
        return Err("可灵密钥格式应为 'AccessKey:SecretKey'".to_string());
    };
    if a.is_empty() || s.is_empty() {
        return Err("可灵 AccessKey / SecretKey 不能为空".to_string());
    }
    Ok((a.to_string(), s.to_string()))
}

/// 生成可灵 API 所需的 HS256 JWT（iss=AccessKey，exp=+30min，nbf=-5s）。
#[tauri::command]
pub async fn kling_sign_jwt(api_key: String) -> Result<String, String> {
    let (access, secret) = parse_kling_key(&api_key)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("系统时间错误: {}", e))?
        .as_secs() as i64;
    let header = serde_json::json!({ "alg": "HS256", "typ": "JWT" });
    let payload = serde_json::json!({ "iss": access, "exp": now + 1800, "nbf": now - 5 });
    let signing_input = format!(
        "{}.{}",
        b64url(header.to_string().as_bytes()),
        b64url(payload.to_string().as_bytes())
    );
    let mac = hmac_sha256(secret.as_bytes(), signing_input.as_bytes());
    Ok(format!("{}.{}", signing_input, b64url(&mac)))
}

// ==================== 生成媒体离线落地 ====================

/// 授权一个目录（递归）可经 asset 协议被 WebView 读取；失败仅告警不阻断主流程
fn grant_media_scope(app: &AppHandle, dir: &PathBuf) {
    match app.asset_protocol_scope().allow_directory(dir, true) {
        Ok(_) => log::info!("Granted asset protocol scope: {:?}", dir),
        Err(e) => log::warn!("Failed to grant asset protocol scope for {:?}: {}", dir, e),
    }
}

/// 由 MIME 猜测文件扩展名
fn ext_for_mime(mime: &str) -> Option<&'static str> {
    let m = mime.to_ascii_lowercase();
    Some(if m.contains("png") {
        ".png"
    } else if m.contains("jpeg") || m.contains("jpg") {
        ".jpg"
    } else if m.contains("webp") {
        ".webp"
    } else if m.contains("gif") {
        ".gif"
    } else if m.contains("bmp") {
        ".bmp"
    } else if m.contains("mp4") {
        ".mp4"
    } else if m.contains("webm") {
        ".webm"
    } else if m.contains("quicktime") {
        ".mov"
    } else if m.contains("avi") {
        ".avi"
    } else {
        return None;
    })
}

/// 由 URL 路径尾段猜测扩展名（忽略 query/fragment）
fn guess_ext_from_url(url: &str) -> Option<String> {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    let last = path.rsplit(['/', '\\']).next().unwrap_or("");
    let dot = last.rfind('.')?;
    let ext: String = last[dot..]
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    let ext = ext.to_ascii_lowercase();
    if ext.is_empty() || ext.len() > 5 {
        None
    } else {
        Some(format!(".{}", ext))
    }
}

/// 解析 data URL（data:<mime>;base64,<payload>）为字节
fn decode_data_url(rest: &str) -> Result<(Vec<u8>, Option<String>), String> {
    use base64::{engine::general_purpose, Engine as _};
    let (meta, payload) = rest.split_once(',').ok_or("Invalid data URL: missing comma")?;
    let mime = meta.split(';').next().unwrap_or("");
    let ext = ext_for_mime(mime).map(|s| s.to_string());
    let clean: String = payload.chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = general_purpose::STANDARD
        .decode(&clean)
        .map_err(|e| format!("Base64 解码失败: {}", e))?;
    Ok((bytes, ext))
}

/// 通过 reqwest 下载 http(s) 资源为字节
async fn download_http_bytes(url: &str) -> Result<(Vec<u8>, Option<String>), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| format!("创建下载客户端失败: {}", e))?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("下载失败: {}", e))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(format!("下载失败 HTTP {}", status.as_u16()));
    }
    let ct = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取下载内容失败: {}", e))?
        .to_vec();
    let ext = ext_for_mime(&ct)
        .map(|s| s.to_string())
        .or_else(|| guess_ext_from_url(url));
    Ok((bytes, ext))
}

/// 把厂商临时 URL 或 base64 data URL 落地到工程 media/ 目录。
/// 返回 MediaFileInfo（含绝对 file_path），并即时授权 asset 协议作用域，供 WebView 离线渲染。
#[tauri::command]
pub async fn download_media_file(
    app: AppHandle,
    project_path: String,
    url: String,
    name_hint: Option<String>,
) -> Result<MediaFileInfo, String> {
    // 校验工程有效性
    crate::storage::resolve_manifest(&project_path)?;
    let media_dir = PathBuf::from(&project_path).join("media");
    std::fs::create_dir_all(&media_dir)
        .map_err(|e| format!("Failed to create media dir: {}", e))?;

    let (bytes, ext) = if let Some(rest) = url.strip_prefix("data:") {
        decode_data_url(rest)?
    } else {
        download_http_bytes(&url).await?
    };

    // 扩展名优先级：内容类型/URL 推断 → name_hint → 兜底 .bin
    let final_ext = ext
        .or_else(|| name_hint.as_deref().and_then(guess_ext_from_url))
        .unwrap_or_else(|| ".bin".to_string());
    let file_name = format!("{}{}", Uuid::new_v4(), final_ext);
    let dest_path = media_dir.join(&file_name);
    std::fs::write(&dest_path, &bytes).map_err(|e| format!("写入媒体文件失败: {}", e))?;

    // 授权 asset 协议可读该 media 目录（递归）
    grant_media_scope(&app, &media_dir);

    let file_size = crate::storage::get_file_size(&dest_path)?;
    let mime_type = crate::storage::get_mime_type(&dest_path);
    let stored_name = dest_path
        .file_name()
        .ok_or("Invalid file name")?
        .to_string_lossy()
        .to_string();

    Ok(MediaFileInfo {
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
    })
}

/// 读取本地媒体文件并转为 data URL。
/// 供无法访问本机 asset 协议的厂商 API（如方舟图生视频的首尾帧）使用，避免 CORS/CSP 限制。
#[tauri::command]
pub async fn read_media_data_url(path: String) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};
    const MAX_BYTES: usize = 20 * 1024 * 1024;
    let file_path = PathBuf::from(&path);
    let meta = tokio::fs::metadata(&file_path)
        .await
        .map_err(|e| format!("读取本地媒体信息失败: {}", e))?;
    if meta.len() as usize > MAX_BYTES {
        return Err("本地媒体超过 20MB，无法提交给厂商 API".into());
    }
    let bytes = tokio::fs::read(&file_path)
        .await
        .map_err(|e| format!("读取本地媒体失败: {}", e))?;
    if bytes.is_empty() {
        return Err("本地媒体为空".into());
    }
    let mime = crate::storage::get_mime_type(&file_path);
    Ok(format!("data:{};base64,{}", mime, general_purpose::STANDARD.encode(bytes)))
}

/// 媒体文件探测结果（只读元数据：大小 / MIME / 图片尺寸），供 AI 助手资源查询使用。
#[derive(Debug, Serialize, Deserialize)]
pub struct MediaProbeResult {
    pub file_name: String,
    pub file_size: u64,
    pub mime_type: String,
    pub file_type: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    /// 文件不存在（清单里有引用但磁盘缺文件）
    pub missing: bool,
}

/// 探测本地媒体文件元数据。
/// 图片仅读头部取宽高（image::image_dimensions，不解码全图）；
/// 视频返回大小与类型，宽高由前端 <video> 元数据补充。
/// 文件缺失不报错，返回 missing=true 供调用方汇总。
#[tauri::command]
pub async fn probe_media_file(path: String) -> Result<MediaProbeResult, String> {
    let file_path = PathBuf::from(&path);
    let file_name = file_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    if !file_path.is_file() {
        return Ok(MediaProbeResult {
            file_name,
            file_size: 0,
            mime_type: String::new(),
            file_type: "missing".to_string(),
            width: None,
            height: None,
            missing: true,
        });
    }
    let file_size = crate::storage::get_file_size(&file_path)?;
    let mime_type = crate::storage::get_mime_type(&file_path);
    let mut width = None;
    let mut height = None;
    if mime_type.starts_with("image/") {
        if let Ok((w, h)) = image::image_dimensions(&file_path) {
            width = Some(w);
            height = Some(h);
        }
    }
    Ok(MediaProbeResult {
        file_name,
        file_size,
        mime_type: mime_type.clone(),
        file_type: determine_file_type(&mime_type),
        width,
        height,
        missing: false,
    })
}

// ==================== 工程归档包（.jzp）与双击打开 ====================

/// 在已注册工程中按清单 id 查找（双击同一个 .jzp 时避免重复解包）
fn find_project_by_id(app_root: &PathBuf, id: &str) -> Option<String> {
    for entry in crate::storage::read_registry(app_root) {
        if let Ok(manifest) = crate::storage::resolve_manifest(&entry.path)
            .and_then(|m| crate::storage::read_manifest(&m))
        {
            if manifest.id == id {
                return Some(entry.path);
            }
        }
    }
    None
}

/// 通知前端：工程已打开（事件 + 待处理标记，覆盖“前端未就绪”的场景）
fn announce_opened(app: &AppHandle, meta: &ProjectMetadata) {
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(mut slot) = state.pending_open.lock() {
            *slot = Some(meta.path.clone());
        }
    }
    let _ = app.emit("jzp-project-opened", meta);
}

/// 打开 .jzp：已注册（同清单 id）直接打开，否则解包到作品目录后注册并打开。
/// 供双击文件关联 / 命令行参数调用；前端通过事件或 take_pending_project 接管。
pub fn handle_open_package(app: &AppHandle, package_path: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = (|| -> Result<ProjectMetadata, String> {
            let package = PathBuf::from(&package_path);
            let meta = crate::package::read_package_manifest(&package)?;
            let state = app.state::<AppState>();
            if let Some(existing) = find_project_by_id(&state.storage.root, &meta.id) {
                return open_project_inner(&app, &state.storage, &existing);
            }
            let root = crate::storage::default_projects_root();
            let imported = crate::package::import_package(&package, &root)?;
            let project_dir = PathBuf::from(&imported.path);
            crate::storage::upsert_registry(&state.storage.root, &project_dir)?;
            grant_media_scope(&app, &project_dir.join("media"));
            Ok(imported)
        })();
        match result {
            Ok(meta) => announce_opened(&app, &meta),
            Err(err) => log::error!("打开工程包失败 {}: {}", package_path, err),
        }
    });
}

/// 把 .jzp 关联到当前可执行文件（当前用户注册表，无需管理员）
pub fn ensure_jzp_association() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let exe = std::env::current_exe()
            .map_err(|e| format!("获取程序路径失败: {}", e))?
            .to_string_lossy()
            .to_string();
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        let (ext, _) = hkcu
            .create_subkey("Software\\Classes\\.jzp")
            .map_err(|e| format!("写入 .jzp 扩展名关联失败: {}", e))?;
        ext.set_value("", &"AIVideoStudio.jzp".to_string())
            .map_err(|e| format!("写入 .jzp 扩展名关联失败: {}", e))?;

        let (prog, _) = hkcu
            .create_subkey("Software\\Classes\\AIVideoStudio.jzp")
            .map_err(|e| format!("写入工程文件类型失败: {}", e))?;
        prog.set_value("", &"AI Video Studio 工程".to_string())
            .map_err(|e| format!("写入工程文件类型失败: {}", e))?;

        let (icon, _) = hkcu
            .create_subkey("Software\\Classes\\AIVideoStudio.jzp\\DefaultIcon")
            .map_err(|e| format!("写入图标关联失败: {}", e))?;
        icon.set_value("", &format!("\"{}\",0", exe))
            .map_err(|e| format!("写入图标关联失败: {}", e))?;

        let (cmd, _) = hkcu
            .create_subkey("Software\\Classes\\AIVideoStudio.jzp\\shell\\open\\command")
            .map_err(|e| format!("写入打开命令失败: {}", e))?;
        cmd.set_value("", &format!("\"{}\" \"%1\"", exe))
            .map_err(|e| format!("写入打开命令失败: {}", e))?;

        log::info!("Registered .jzp file association -> {}", exe);
        Ok(exe)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("当前平台暂不支持自动注册文件关联".to_string())
    }
}

/// 注册 .jzp 文件关联到当前可执行文件（设置页手动触发）
#[tauri::command]
pub async fn register_jzp_association() -> Result<String, String> {
    ensure_jzp_association()
}

/// 从命令行参数中提取 .jzp 工程包路径
pub fn package_arg(args: &[String]) -> Option<String> {
    args.iter().find_map(|arg| {
        let path = PathBuf::from(arg);
        let is_package = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case(crate::storage::PROJECT_FILE_EXT))
            .unwrap_or(false);
        if !is_package {
            return None;
        }
        let abs = if path.is_absolute() {
            path
        } else {
            std::env::current_dir().ok()?.join(path)
        };
        if abs.is_file() {
            Some(abs.to_string_lossy().to_string())
        } else {
            None
        }
    })
}

/// 导入 .jzp 工程包（已注册则直接打开）
#[tauri::command]
pub async fn import_project_package(
    app: AppHandle,
    path: String,
    parent_dir: Option<String>,
    state: State<'_, AppState>,
) -> Result<ProjectMetadata, String> {
    let package = PathBuf::from(&path);
    let package_meta = crate::package::read_package_manifest(&package)?;

    if let Some(existing) = find_project_by_id(&state.storage.root, &package_meta.id) {
        let meta = open_project_inner(&app, &state.storage, &existing)?;
        announce_opened(&app, &meta);
        return Ok(meta);
    }

    let root = match parent_dir {
        Some(dir) if !dir.trim().is_empty() => PathBuf::from(dir),
        _ => crate::storage::default_projects_root(),
    };
    let imported = crate::package::import_package(&package, &root)?;
    let project_dir = PathBuf::from(&imported.path);
    crate::storage::upsert_registry(&state.storage.root, &project_dir)?;
    grant_media_scope(&app, &project_dir.join("media"));
    announce_opened(&app, &imported);
    Ok(imported)
}

/// 把工程打包为 .jzp（ZIP：project.json + data/ + media/）
#[tauri::command]
pub async fn export_project_package(
    project_path: String,
    dest_path: String,
) -> Result<String, String> {
    crate::package::export_package(&project_path, &dest_path)
}

/// 前端启动时取走待打开的工程（双击 .jzp 且当时前端尚未就绪）
#[tauri::command]
pub async fn take_pending_project(state: State<'_, AppState>) -> Result<Option<String>, String> {
    Ok(state.pending_open.lock().ok().and_then(|mut slot| slot.take()))
}
