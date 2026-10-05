// Tauri 命令模块
// 提供前端调用的本地 API

use crate::crypto;
use crate::storage::{StoragePaths, ProjectMetadata, MediaFileInfo};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
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

/// 打开工程：校验清单、更新注册表最近打开时间，并授权工程 media/ 目录供 asset 协议读取
#[tauri::command]
pub async fn open_project(
    app: AppHandle,
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
    // 授予工程 media/ 目录（递归）读取权限，使已落地素材跨会话可渲染
    grant_media_scope(&app, &project_dir.join("media"));
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
