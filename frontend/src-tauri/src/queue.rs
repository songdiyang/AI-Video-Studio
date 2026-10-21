// Rust 托管任务队列（queue）
//
// 离线桌面端的异步生成任务（视频/图片/提示词）在此持久化执行，独立于 WebView 生命周期：
//   提交 → 按 task_id 轮询 → 退避重试 → 成品下载落地 → 事件推送，全部在 Rust 后台 tokio worker 完成。
// Rust 侧不含任何厂商专属逻辑：前端（localAI 计划构造器 + localWorkflow）把请求编排成声明式 TaskPlan，
// 这里只做通用 HTTP 执行 + 路径取值 + 并发闸 + 持久化。可灵 JWT 通过 {{KLING_SIGN:<apiKey>}} 标记
// 复用 commands::kling_sign_jwt 在发送前注入，仍不引入厂商语义。
//
// 契约：TaskPlan/JobMeta 为 camelCase（前端 → Rust）；JobView/TaskView 对齐后端 WorkflowJob/Task
// 字段形状（snake_case 为主，displayName / workflowName 例外），使既有消费者零改动。

use crate::commands;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Semaphore;
use uuid::Uuid;

// ==================== 锁定常量 ====================
const GLOBAL_MAX_CONCURRENT: usize = 3;
const CAP_VIDEO: usize = 2;
const CAP_IMAGE: usize = 3;
const CAP_PROMPT: usize = 3;
const HTTP_RETRIES: u32 = 2; // 额外重试次数（仅网络/5xx/429）
const BACKOFF_BASE_MS: u64 = 1000;
const SAVE_THROTTLE_MS: u64 = 800;
const EVENT_NAME: &str = "workflow-update";

// ==================== 入站类型（前端 → Rust，camelCase） ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpStep {
  pub url: String,
  pub method: String,
  #[serde(default)]
  pub headers: HashMap<String, String>,
  #[serde(default)]
  pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollSpec {
  pub url_template: String,
  #[serde(default)]
  pub method: String,
  #[serde(default)]
  pub headers: HashMap<String, String>,
  pub status_paths: Vec<String>,
  pub success_values: Vec<String>,
  pub fail_values: Vec<String>,
  #[serde(default)]
  pub error_paths: Vec<String>,
  #[serde(default)]
  pub progress_mid: Option<u32>,
  pub interval_ms: u64,
  pub max_interval_ms: u64,
  pub timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum StepExtract {
  #[serde(rename_all = "camelCase")]
  Media {
    url_paths: Vec<String>,
    #[serde(default)]
    b64_paths: Vec<String>,
    #[serde(default)]
    name_hint: Option<String>,
    aliases: Vec<String>,
  },
  #[serde(rename_all = "camelCase")]
  Text { value_paths: Vec<String>, aliases: Vec<String> },
  #[serde(rename_all = "camelCase")]
  Json {
    value_paths: Vec<String>,
    fields: Vec<JsonField>,
  },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonField {
  pub alias: String,
  pub paths: Vec<String>,
  #[serde(default)]
  pub default: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStep {
  pub submit: HttpStep,
  #[serde(default)]
  pub extract_task_id_paths: Option<Vec<String>>,
  #[serde(default)]
  pub poll: Option<PollSpec>,
  pub extract: StepExtract,
  #[serde(default)]
  pub optional: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlanKind {
  Video,
  Image,
  Prompt,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPlan {
  pub kind: PlanKind,
  pub model_name: String,
  pub steps: Vec<TaskStep>,
  #[serde(default)]
  pub static_result: Option<Map<String, Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobMeta {
  pub workflow_type: String,
  pub workflow_name: String,
  pub project_id: i64,
  pub project_path: String,
  #[serde(default)]
  pub params: Value,
  #[serde(default)]
  pub target_type: String,
  #[serde(default)]
  pub target_id: Option<i64>,
}

// ==================== 出站视图（Rust → 前端，对齐 WorkflowJob/Task） ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskView {
  pub id: String,
  pub job_id: String,
  pub step_index: i64,
  pub task_type: String,
  pub target_type: String,
  pub target_id: Option<i64>,
  pub model_name: Option<String>,
  pub input_params: Value,
  pub status: String,
  pub progress: u32,
  pub result_data: Value,
  pub error_message: Option<String>,
  pub started_at: Option<String>,
  pub completed_at: Option<String>,
  #[serde(rename = "displayName", default)]
  pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobView {
  pub id: String,
  pub user_id: i64,
  pub project_id: i64,
  pub workflow_type: String,
  #[serde(rename = "workflowName")]
  pub workflow_name: String,
  pub status: String,
  pub current_step_index: i64,
  pub total_steps: i64,
  pub params: Value,
  pub input_params: Value,
  pub error_message: Option<String>,
  pub started_at: Option<String>,
  pub completed_at: Option<String>,
  pub created_at: String,
  pub tasks: Vec<TaskView>,
  #[serde(default)]
  pub consumed: bool,
  #[serde(default)]
  pub media_result_keys: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobRecord {
  pub view: JobView,
  pub plan: TaskPlan,
  pub project_path: String,
  pub step_task_ids: Vec<String>,
  pub step_done: Vec<bool>,
  pub media_keys: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFilter {
  #[serde(default)]
  pub project_id: Option<i64>,
  #[serde(default)]
  pub workflow_type: Option<String>,
  #[serde(default)]
  pub status: Option<String>,
  #[serde(default)]
  pub active_only: Option<bool>,
}

// ==================== 工具函数 ====================

fn now_iso() -> String {
  chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn gen_id(prefix: &str) -> String {
  format!("{}_{}", prefix, Uuid::new_v4().simple())
}

fn jitter_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| (d.subsec_nanos() % 300) as u64)
    .unwrap_or(0)
}

/// 依点分路径从 JSON 取值，支持数组数字下标（如 "videos.0.url"）
fn json_path<'a>(v: &'a Value, path: &str) -> Option<&'a Value> {
  let mut cur = v;
  for seg in path.split('.') {
    if seg.is_empty() {
      continue;
    }
    match cur {
      Value::Object(map) => cur = map.get(seg)?,
      Value::Array(arr) => {
        let idx: usize = seg.parse().ok()?;
        cur = arr.get(idx)?;
      }
      _ => return None,
    }
  }
  Some(cur)
}

/// 依序尝试多个路径，返回第一个非空字符串（数字/布尔转字符串）
fn first_str(v: &Value, paths: &[String]) -> Option<String> {
  for p in paths {
    if let Some(val) = json_path(v, p) {
      match val {
        Value::String(s) if !s.is_empty() => return Some(s.clone()),
        Value::Number(n) => return Some(n.to_string()),
        _ => {}
      }
    }
  }
  None
}

/// 解析可灵标记：{{KLING_SIGN:<apiKey>}} → Bearer <jwt>
async fn resolve_kling_header(value: &str) -> Result<String, String> {
  if let Some(rest) = value.strip_prefix("{{KLING_SIGN:") {
    if let Some(api_key) = rest.strip_suffix("}}") {
      let token = commands::kling_sign_jwt(api_key.to_string()).await?;
      return Ok(format!("Bearer {}", token));
    }
  }
  Ok(value.to_string())
}

async fn resolve_headers(headers: &HashMap<String, String>) -> Result<HashMap<String, String>, String> {
  let mut out = HashMap::with_capacity(headers.len());
  for (k, v) in headers {
    out.insert(k.clone(), resolve_kling_header(v).await?);
  }
  Ok(out)
}

/// 剥离 ``` 围栏并截取第一个 {...} 解析为 JSON；失败返回原值包成对象 None 情形由调用处理
fn parse_fenced_json(text: &str) -> Option<Value> {
  let fenced = regex_fenced(text);
  let cand = fenced.unwrap_or_else(|| text.to_string());
  let start = cand.find('{')?;
  let end = cand.rfind('}')?;
  if end <= start {
    return None;
  }
  serde_json::from_str::<Value>(&cand[start..=end]).ok()
}

/// 提取 ```json ... ``` 内部内容（手写，避免 regex 依赖）
fn regex_fenced(text: &str) -> Option<String> {
  let lower = text.to_lowercase();
  let idx = lower.find("```")?;
  let after = &text[idx + 3..];
  // 跳过可选语言标记行
  let body_start = after.find('\n').map(|n| &after[n + 1..]).unwrap_or(after);
  let end = body_start.find("```")?;
  Some(body_start[..end].to_string())
}

fn cap_for(kind: PlanKind) -> usize {
  match kind {
    PlanKind::Video => CAP_VIDEO,
    PlanKind::Image => CAP_IMAGE,
    PlanKind::Prompt => CAP_PROMPT,
  }
}

fn classify_status(status: u16) -> bool {
  // true = 可重试
  status >= 500 || status == 429 || status == 0
}

// ==================== 队列核心 ====================

pub struct Queue {
  app: AppHandle,
  client: reqwest::Client,
  store_path: PathBuf,
  jobs: Mutex<HashMap<String, JobRecord>>,
  cancel: Mutex<HashMap<String, Arc<AtomicBool>>>,
  model_sems: Mutex<HashMap<String, Arc<Semaphore>>>,
  global: Arc<Semaphore>,
  last_save: Mutex<Instant>,
}

impl Queue {
  pub fn new(app: AppHandle, store_path: PathBuf) -> Arc<Self> {
    let client = reqwest::Client::builder()
      .timeout(Duration::from_secs(180))
      .build()
      .expect("build reqwest client");
    Arc::new(Queue {
      app,
      client,
      store_path,
      jobs: Mutex::new(HashMap::new()),
      cancel: Mutex::new(HashMap::new()),
      model_sems: Mutex::new(HashMap::new()),
      global: Arc::new(Semaphore::new(GLOBAL_MAX_CONCURRENT)),
      last_save: Mutex::new(Instant::now()),
    })
  }

  // ---------- 状态读写 ----------

  fn get_record(&self, id: &str) -> Option<JobRecord> {
    self.jobs.lock().ok().and_then(|m| m.get(id).cloned())
  }

  fn get_view(&self, id: &str) -> Option<JobView> {
    self.jobs.lock().ok().and_then(|m| m.get(id).map(|r| r.view.clone()))
  }

  fn mutate<F: FnOnce(&mut JobRecord)>(&self, id: &str, f: F) {
    if let Ok(mut m) = self.jobs.lock() {
      if let Some(r) = m.get_mut(id) {
        f(r);
      }
    }
  }

  fn emit(&self, id: &str) {
    if let Some(v) = self.get_view(id) {
      if let Err(e) = self.app.emit(EVENT_NAME, &v) {
        log::warn!("[queue] emit 失败: {}", e);
      }
    }
  }

  fn cancel_flag(&self, id: &str) -> Arc<AtomicBool> {
    if let Ok(mut m) = self.cancel.lock() {
      if let Some(f) = m.get(id) {
        return f.clone();
      }
      let f = Arc::new(AtomicBool::new(false));
      m.insert(id.to_string(), f.clone());
      return f;
    }
    Arc::new(AtomicBool::new(false))
  }

  fn is_cancelled(&self, id: &str) -> bool {
    self
      .cancel
      .lock()
      .ok()
      .and_then(|m| m.get(id).map(|f| f.load(Ordering::SeqCst)))
      .unwrap_or(false)
  }

  fn model_sem(&self, model: &str, cap: usize) -> Arc<Semaphore> {
    if let Ok(mut m) = self.model_sems.lock() {
      if let Some(s) = m.get(model) {
        return s.clone();
      }
      let s = Arc::new(Semaphore::new(cap.max(1)));
      m.insert(model.to_string(), s.clone());
      return s;
    }
    Arc::new(Semaphore::new(1))
  }

  // ---------- 持久化 ----------

  fn save(&self, force: bool) {
    if !force {
      if let Ok(l) = self.last_save.lock() {
        if l.elapsed() < Duration::from_millis(SAVE_THROTTLE_MS) {
          return;
        }
      }
    }
    let snapshot: Vec<JobRecord> = match self.jobs.lock() {
      Ok(m) => m.values().filter(|r| !r.view.consumed).cloned().collect(),
      Err(_) => return,
    };
    let json = match serde_json::to_string_pretty(&snapshot) {
      Ok(j) => j,
      Err(e) => {
        log::warn!("[queue] 序列化失败: {}", e);
        return;
      }
    };
    if let Some(parent) = self.store_path.parent() {
      let _ = std::fs::create_dir_all(parent);
    }
    let tmp = self.store_path.with_extension("json.tmp");
    if let Err(e) = std::fs::write(&tmp, json.as_bytes()).and_then(|_| {
      if self.store_path.exists() {
        std::fs::remove_file(&self.store_path)?;
      }
      std::fs::rename(&tmp, &self.store_path)
    }) {
      log::warn!("[queue] 写入持久化文件失败: {}", e);
    }
    if let Ok(mut l) = self.last_save.lock() {
      *l = Instant::now();
    }
  }

  pub fn load_and_resume(self: &Arc<Self>) {
    let txt = match std::fs::read_to_string(&self.store_path) {
      Ok(t) => t,
      Err(_) => return,
    };
    let records: Vec<JobRecord> = match serde_json::from_str(&txt) {
      Ok(r) => r,
      Err(e) => {
        log::warn!("[queue] 解析持久化文件失败: {}", e);
        return;
      }
    };
    let mut resume_ids: Vec<String> = Vec::new();
    if let Ok(mut m) = self.jobs.lock() {
      for r in records {
        let id = r.view.id.clone();
        let st = r.view.status.clone();
        m.insert(id.clone(), r);
        if st == "running" || st == "pending" {
          resume_ids.push(id);
        }
      }
    }
    for id in resume_ids {
      log::info!("[queue] 重启续跑任务 {}", id);
      let q = self.clone();
      tauri::async_runtime::spawn(async move { q.run_job(id).await });
    }
  }

  // ---------- HTTP 执行 ----------

  async fn http_once(&self, step: &HttpStep) -> Result<(u16, String), String> {
    let headers = resolve_headers(&step.headers).await?;
    let method = reqwest::Method::from_bytes(step.method.as_bytes())
      .map_err(|e| format!("无效请求方法: {}", e))?;
    let mut builder = self.client.request(method, &step.url);
    for (k, v) in &headers {
      builder = builder.header(k.as_str(), v.as_str());
    }
    if let Some(body) = &step.body {
      builder = builder.body(body.clone());
    }
    let resp = builder.send().await.map_err(|e| format!("请求厂商失败: {}", e))?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| format!("读取厂商响应失败: {}", e))?;
    Ok((status, body))
  }

  /// 提交/查询：带退避重试（仅网络错误/5xx/429 重试；4xx 立即失败）。成功返回解析后的 JSON。
  async fn send_json(&self, step: &HttpStep) -> Result<Value, String> {
    let mut attempt = 0u32;
    loop {
      let (status, body) = match self.http_once(step).await {
        Ok(v) => v,
        Err(e) => {
          if attempt < HTTP_RETRIES {
            let backoff = BACKOFF_BASE_MS * (1u64 << attempt) + jitter_ms();
            log::warn!("[queue] 网络错误({})，{}ms 后重试", e, backoff);
            tokio::time::sleep(Duration::from_millis(backoff)).await;
            attempt += 1;
            continue;
          }
          return Err(e);
        }
      };
      let parsed: Value = serde_json::from_str(&body).unwrap_or_else(|_| Value::String(body.clone()));
      if (200..300).contains(&status) {
        return Ok(parsed);
      }
      let msg = first_str(
        &parsed,
        &["error.message".to_string(), "message".to_string(), "msg".to_string(), "error".to_string()],
      )
      .unwrap_or_else(|| format!("HTTP {}", status));
      if classify_status(status) && attempt < HTTP_RETRIES {
        let backoff = BACKOFF_BASE_MS * (1u64 << attempt) + jitter_ms();
        log::warn!("[queue] 厂商返回 {}，{}ms 后重试", status, backoff);
        tokio::time::sleep(Duration::from_millis(backoff)).await;
        attempt += 1;
        continue;
      }
      return Err(format!("{}: {}", status, msg));
    }
  }

  // ---------- 作业执行 ----------

  async fn run_job(self: Arc<Self>, id: String) {
    let rec = match self.get_record(&id) {
      Some(r) => r,
      None => return,
    };
    let cap = cap_for(rec.plan.kind);
    let model = rec.plan.model_name.clone();
    let global = self.global.clone().acquire_owned().await.unwrap();
    let model_sem = self.model_sem(&model, cap).acquire_owned().await.unwrap();

    let total = rec.plan.steps.len();
    self.mutate(&id, |r| {
      r.view.status = "running".into();
      if let Some(t) = r.view.tasks.get_mut(0) {
        if t.started_at.is_none() {
          t.started_at = Some(now_iso());
        }
        t.status = "processing".into();
        t.model_name = Some(model.clone());
      }
    });
    self.emit(&id);

    let mut i = 0;
    while i < total {
      if self.is_cancelled(&id) {
        self.mark_cancelled(&id);
        drop(global);
        drop(model_sem);
        return;
      }
      let done = self.get_record(&id).map(|r| r.step_done.get(i).copied().unwrap_or(false)).unwrap_or(true);
      if done {
        i += 1;
        continue;
      }
      match self.run_step(&id, i).await {
        StepResult::Done => {
          self.mutate(&id, |r| {
            if let Some(d) = r.step_done.get_mut(i) {
              *d = true;
            }
            r.view.current_step_index = (i + 1) as i64;
            let pct = (((i + 1) as f64 / total as f64) * 90.0).round() as u32;
            if let Some(t) = r.view.tasks.get_mut(0) {
              t.progress = pct.min(90);
            }
          });
          self.emit(&id);
          self.save(true);
          i += 1;
        }
        StepResult::Cancelled => {
          self.mark_cancelled(&id);
          drop(global);
          drop(model_sem);
          return;
        }
        StepResult::Failed(msg) => {
          let optional = self
            .get_record(&id)
            .and_then(|r| r.plan.steps.get(i).map(|s| s.optional))
            .unwrap_or(false);
          if optional {
            log::info!("[queue] 可选步骤 {} 失败已忽略: {}", i, msg);
            self.mutate(&id, |r| {
              if let Some(d) = r.step_done.get_mut(i) {
                *d = true;
              }
            });
            i += 1;
          } else {
            self.finalize(&id, false, Some(msg));
            self.save(true);
            drop(global);
            drop(model_sem);
            return;
          }
        }
      }
    }
    self.finalize(&id, true, None);
    self.save(true);
    drop(global);
    drop(model_sem);
  }

  fn mark_cancelled(&self, id: &str) {
    self.mutate(id, |r| {
      r.view.status = "cancelled".into();
      r.view.completed_at = Some(now_iso());
      if let Some(t) = r.view.tasks.get_mut(0) {
        if t.status == "processing" {
          t.status = "failed".into();
        }
      }
    });
    self.emit(id);
    self.save(true);
  }

  async fn run_step(&self, id: &str, idx: usize) -> StepResult {
    let rec = match self.get_record(id) {
      Some(r) => r,
      None => return StepResult::Failed("任务不存在".into()),
    };
    let step = match rec.plan.steps.get(idx) {
      Some(s) => s.clone(),
      None => return StepResult::Failed("步骤越界".into()),
    };

    // 1) 获取远端最终响应 JSON
    let final_resp: Value;
    if let Some(task_id) = rec.step_task_ids.get(idx).cloned().filter(|s| !s.is_empty()) {
      // 重启续跑：已有 task_id，直接进入轮询
      match self.poll_until_done(id, &step, &task_id).await {
        Ok(v) => final_resp = v,
        Err(e) => return e,
      }
    } else {
      // 提交
      let submit_resp = match self.send_json(&step.submit).await {
        Ok(v) => v,
        Err(e) => return StepResult::Failed(e),
      };
      if self.is_cancelled(id) {
        return StepResult::Cancelled;
      }
      match (&step.poll, &step.extract_task_id_paths) {
        (Some(_), Some(paths)) => {
          let task_id = match first_str(&submit_resp, paths) {
            Some(t) => t,
            None => return StepResult::Failed("任务提交失败：未返回任务 ID".into()),
          };
          self.mutate(id, |r| {
            if let Some(slot) = r.step_task_ids.get_mut(idx) {
              *slot = task_id.clone();
            }
          });
          self.save(true);
          match self.poll_until_done(id, &step, &task_id).await {
            Ok(v) => final_resp = v,
            Err(e) => return e,
          }
        }
        _ => final_resp = submit_resp,
      }
    }

    // 2) 提取产出并写入 result_data
    if self.is_cancelled(id) {
      return StepResult::Cancelled;
    }
    match self.apply_extract(id, &final_resp, &step.extract).await {
      Ok(()) => StepResult::Done,
      Err(e) => StepResult::Failed(e),
    }
  }

  async fn poll_until_done(&self, id: &str, step: &TaskStep, task_id: &str) -> Result<Value, StepResult> {
    let poll = step.poll.as_ref().expect("poll spec");
    let start = Instant::now();
    let mut interval = poll.interval_ms;
    let mut fail_count = 0u32;
    loop {
      if self.is_cancelled(id) {
        return Err(StepResult::Cancelled);
      }
      if start.elapsed() > Duration::from_millis(poll.timeout_ms) {
        return Err(StepResult::Failed("视频生成超时".into()));
      }
      let poll_step = HttpStep {
        url: poll.url_template.replace("{task_id}", task_id),
        method: if poll.method.is_empty() { "GET".into() } else { poll.method.clone() },
        headers: poll.headers.clone(),
        body: None,
      };
      let resp = match self.send_json(&poll_step).await {
        Ok(v) => {
          fail_count = 0;
          v
        }
        Err(e) => {
          fail_count += 1;
          if fail_count > HTTP_RETRIES {
            return Err(StepResult::Failed(format!("轮询失败: {}", e)));
          }
          tokio::time::sleep(Duration::from_millis(interval + jitter_ms())).await;
          interval = (interval + 1000).min(poll.max_interval_ms);
          continue;
        }
      };
      let status = first_str(&resp, &poll.status_paths).map(|s| s.to_lowercase()).unwrap_or_default();
      if poll.success_values.iter().any(|v| v.to_lowercase() == status) {
        return Ok(resp);
      }
      if poll.fail_values.iter().any(|v| v.to_lowercase() == status) {
        let msg = first_str(&resp, &poll.error_paths).unwrap_or_else(|| "视频生成失败".into());
        return Err(StepResult::Failed(msg));
      }
      // 进行中
      let mid = poll.progress_mid.unwrap_or(55);
      self.mutate(id, |r| {
        if let Some(t) = r.view.tasks.get_mut(0) {
          t.progress = mid.min(90);
        }
      });
      self.emit(id);
      self.save(false);
      tokio::time::sleep(Duration::from_millis(interval + jitter_ms())).await;
      interval = (interval + 1000).min(poll.max_interval_ms);
    }
  }

  async fn apply_extract(&self, id: &str, resp: &Value, extract: &StepExtract) -> Result<(), String> {
    match extract {
      StepExtract::Media { url_paths, b64_paths, name_hint, aliases } => {
        let src = match first_str(resp, url_paths) {
          Some(u) => u,
          None => match first_str(resp, b64_paths) {
            Some(b) => format!("data:image/png;base64,{}", b),
            None => return Err("生成成功但未返回地址".into()),
          },
        };
        let project_path = self.get_record(id).map(|r| r.project_path.clone()).unwrap_or_default();
        let info = commands::download_media_file(
          self.app.clone(),
          project_path,
          src,
          Some(name_hint.clone().unwrap_or_else(|| "media".into())),
        )
        .await
        .map_err(|e| format!("成品落地失败: {}", e))?;
        if info.file_size == 0 {
          return Err("下载内容为空文件".into());
        }
        let path = info.file_path;
        self.mutate(id, |r| {
          for alias in aliases {
            put_result(r, alias, &path);
            if !r.media_keys.contains(alias) {
              r.media_keys.push(alias.clone());
            }
          }
        });
        Ok(())
      }
      StepExtract::Text { value_paths, aliases } => {
        let text = first_str(resp, value_paths).ok_or_else(|| "生成成功但未返回内容".to_string())?;
        self.mutate(id, |r| {
          for alias in aliases {
            put_result(r, alias, &text);
          }
        });
        Ok(())
      }
      StepExtract::Json { value_paths, fields } => {
        let raw = first_str(resp, value_paths).ok_or_else(|| "生成成功但未返回内容".to_string())?;
        let parsed = parse_fenced_json(&raw).unwrap_or_else(|| Value::Object(Map::new()));
        let mut wrote_any = false;
        let mut assigns: Vec<(String, String)> = Vec::new();
        for f in fields {
          let val = first_str(&parsed, &f.paths)
            .or_else(|| f.default.clone())
            .unwrap_or_default();
          if !val.is_empty() {
            assigns.push((f.alias.clone(), val));
            wrote_any = true;
          } else if f.default.is_some() {
            assigns.push((f.alias.clone(), String::new()));
          }
        }
        if !wrote_any {
          return Err("内容解析失败，未获得有效字段".into());
        }
        self.mutate(id, |r| {
          for (k, v) in &assigns {
            put_result(r, k, v);
          }
        });
        Ok(())
      }
    }
  }

  fn finalize(&self, id: &str, ok: bool, error: Option<String>) {
    let statics: Option<Map<String, Value>> = self
      .get_record(id)
      .and_then(|r| r.plan.static_result.clone());
    self.mutate(id, |r| {
      let now = now_iso();
      if ok {
        // 并入静态结果
        if let Some(map) = &statics {
          for (k, v) in map {
            set_result_json(r, k, v.clone());
          }
        }
        r.view.status = "completed".into();
        r.view.completed_at = Some(now.clone());
        if let Some(t) = r.view.tasks.get_mut(0) {
          t.status = "completed".into();
          t.progress = 100;
          t.completed_at = Some(now.clone());
        }
      } else {
        r.view.status = "failed".into();
        r.view.error_message = error.clone();
        r.view.completed_at = Some(now.clone());
        if let Some(t) = r.view.tasks.get_mut(0) {
          t.status = "failed".into();
          t.error_message = error.clone();
          t.completed_at = Some(now.clone());
        }
      }
      // 回填 media_keys
      r.view.media_result_keys = r.media_keys.clone();
    });
    self.emit(id);
  }
}

/// 把字符串值写入 tasks[0].result_data[alias]
fn put_result(r: &mut JobRecord, alias: &str, value: &str) {
  set_result_json(r, alias, Value::String(value.to_string()));
}

fn set_result_json(r: &mut JobRecord, key: &str, value: Value) {
  if let Some(t) = r.view.tasks.get_mut(0) {
    if !t.result_data.is_object() {
      t.result_data = Value::Object(Map::new());
    }
    if let Value::Object(map) = &mut t.result_data {
      map.insert(key.to_string(), value);
    }
  }
}

enum StepResult {
  Done,
  Cancelled,
  Failed(String),
}

// ==================== 构建 JobView ====================

fn build_view(meta: &JobMeta, _plan: &TaskPlan) -> JobView {
  let job_id = gen_id("wf");
  let task_id = gen_id("t");
  let now = now_iso();
  let task = TaskView {
    id: task_id,
    job_id: job_id.clone(),
    step_index: 0,
    task_type: meta.workflow_type.clone(),
    target_type: meta.target_type.clone(),
    target_id: meta.target_id,
    model_name: None,
    input_params: meta.params.clone(),
    status: "pending".into(),
    progress: 0,
    result_data: Value::Null,
    error_message: None,
    started_at: None,
    completed_at: None,
    display_name: Some(meta.workflow_name.clone()),
  };
  JobView {
    id: job_id,
    user_id: 1,
    project_id: meta.project_id,
    workflow_type: meta.workflow_type.clone(),
    workflow_name: meta.workflow_name.clone(),
    status: "running".into(),
    current_step_index: 0,
    total_steps: 1,
    params: meta.params.clone(),
    input_params: meta.params.clone(),
    error_message: None,
    started_at: Some(now.clone()),
    completed_at: None,
    created_at: now,
    tasks: vec![task],
    consumed: false,
    media_result_keys: vec![],
  }
}

// ==================== Tauri 命令 ====================

#[tauri::command]
pub async fn queue_submit(state: State<'_, Arc<Queue>>, meta: JobMeta, plan: TaskPlan) -> Result<JobView, String> {
  let view = build_view(&meta, &plan);
  let id = view.id.clone();
  let steps_len = plan.steps.len();
  let rec = JobRecord {
    view: view.clone(),
    plan,
    project_path: meta.project_path.clone(),
    step_task_ids: vec![String::new(); steps_len],
    step_done: vec![false; steps_len],
    media_keys: Vec::new(),
  };

  if let Ok(mut m) = state.jobs.lock() {
    m.insert(id.clone(), rec);
  }
  state.cancel_flag(&id);
  state.save(true);
  state.emit(&id);
  let q = state.inner().clone();
  tokio::spawn(async move { q.run_job(id).await });
  Ok(view)
}

#[tauri::command]
pub async fn queue_get(state: State<'_, Arc<Queue>>, job_id: String) -> Result<Option<JobView>, String> {
  Ok(state.get_view(&job_id))
}

#[tauri::command]
pub async fn queue_list(state: State<'_, Arc<Queue>>, filter: QueueFilter) -> Result<Vec<JobView>, String> {
  let mut arr: Vec<JobView> = {
    let m = match state.jobs.lock() {
      Ok(m) => m,
      Err(_) => return Ok(vec![]),
    };
    m.values()
      .map(|r| r.view.clone())
      .filter(|v| filter.project_id.map(|p| v.project_id == p).unwrap_or(true))
      .filter(|v| filter.workflow_type.as_ref().map(|w| &v.workflow_type == w).unwrap_or(true))
      .filter(|v| filter.status.as_ref().map(|s| &v.status == s).unwrap_or(true))
      .filter(|v| {
        filter.active_only.unwrap_or(false)
          == false
          || (!v.consumed && matches!(v.status.as_str(), "running" | "pending" | "completed" | "failed"))
      })
      .collect()
  };
  arr.sort_by(|a, b| b.created_at.cmp(&a.created_at));
  Ok(arr)
}

#[tauri::command]
pub async fn queue_cancel(state: State<'_, Arc<Queue>>, job_id: String) -> Result<bool, String> {
  let exists = state.get_record(&job_id).is_some();
  if !exists {
    return Ok(false);
  }
  if let Some(flag) = state.cancel.lock().ok().and_then(|m| m.get(&job_id).cloned()) {
    flag.store(true, Ordering::SeqCst);
  }
  state.mutate(&job_id, |r| {
    if r.view.status == "running" || r.view.status == "pending" {
      r.view.status = "cancelled".into();
      r.view.completed_at = Some(now_iso());
      if let Some(t) = r.view.tasks.get_mut(0) {
        if t.status == "processing" {
          t.status = "failed".into();
        }
      }
    }
  });
  state.emit(&job_id);
  state.save(true);
  Ok(true)
}

#[tauri::command]
pub async fn queue_resume(state: State<'_, Arc<Queue>>, job_id: String) -> Result<bool, String> {
  let rec = match state.get_record(&job_id) {
    Some(r) => r,
    None => return Ok(false),
  };
  let st = rec.view.status.as_str();
  if st != "cancelled" && st != "failed" {
    return Ok(false);
  }
  if let Some(flag) = state.cancel.lock().ok().and_then(|m| m.get(&job_id).cloned()) {
    flag.store(false, Ordering::SeqCst);
  }
  state.mutate(&job_id, |r| {
    r.view.status = "running".into();
    r.view.error_message = None;
    r.view.completed_at = None;
    if let Some(t) = r.view.tasks.get_mut(0) {
      t.status = "processing".into();
      t.error_message = None;
    }
  });
  state.emit(&job_id);
  state.save(true);
  let q = state.inner().clone();
  tokio::spawn(async move { q.run_job(job_id).await });
  Ok(true)
}

#[tauri::command]
pub async fn queue_consume(state: State<'_, Arc<Queue>>, job_id: String) -> Result<bool, String> {
  if state.get_record(&job_id).is_none() {
    return Ok(false);
  }
  state.mutate(&job_id, |r| r.view.consumed = true);
  state.save(true);
  Ok(true)
}

#[tauri::command]
pub async fn queue_consume_all_failed(state: State<'_, Arc<Queue>>) -> Result<u32, String> {
  let mut n = 0u32;
  if let Ok(mut m) = state.jobs.lock() {
    for r in m.values_mut() {
      if (r.view.status == "failed" || r.view.status == "cancelled") && !r.view.consumed {
        r.view.consumed = true;
        n += 1;
      }
    }
  }
  state.save(true);
  Ok(n)
}
