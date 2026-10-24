//! Windows 夜间模式（Night light）状态读取与变化监听。
//!
//! Windows 未提供获取夜间模式开关的公开 API，只能读取注册表 CloudStore 中的
//! bluelightreductionstate；字节布局来自社区逆向（AutoDarkMode 等项目），跨系统版本可能变化。
//! 任何读取失败都按"关闭"处理，由前端回退到系统深色偏好兜底。

use tauri::{AppHandle, Emitter};

/// 夜间模式状态变化事件名（payload: bool）
pub const NIGHT_LIGHT_EVENT: &str = "night-light-changed";

#[cfg(target_os = "windows")]
mod probe {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
    use winreg::RegKey;

    /// 夜间模式状态键（HKCU 下 CloudStore 的私有键）
    const STATE_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\CloudStore\Store\DefaultAccount\Current\default$windows.data.bluelightreduction.bluelightreductionstate\windows.data.bluelightreduction.bluelightreductionstate";

    /// 夜间模式是否开启
    pub fn is_enabled() -> bool {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let Ok(key) = hkcu.open_subkey_with_flags(STATE_KEY, KEY_READ) else {
            return false;
        };
        let Ok(raw) = key.get_raw_value("Data") else {
            return false;
        };
        // 第 18 字节：0x15 = 开启，0x13 = 关闭
        raw.bytes.get(18).map(|v| *v == 0x15).unwrap_or(false)
    }
}

#[cfg(not(target_os = "windows"))]
mod probe {
    pub fn is_enabled() -> bool {
        false
    }
}

/// 查询夜间模式是否开启
#[tauri::command]
pub async fn get_night_light_enabled() -> Result<bool, String> {
    let enabled = probe::is_enabled();
    log::info!("Night light queried: {}", enabled);
    Ok(enabled)
}

/// 启动状态监听：每 5 秒读一次注册表，变化时向前端推送事件。
/// Windows 侧没有可靠的变更通知通道，轮询单个二进制值开销可忽略。
pub fn spawn_watcher(app: AppHandle) {
    let initial = probe::is_enabled();
    log::info!("Night light initial state: {}", initial);

    tauri::async_runtime::spawn(async move {
        let mut last = initial;
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            let current = probe::is_enabled();
            if current == last {
                continue;
            }
            last = current;
            log::info!("Night light changed: {}", current);
            if let Err(err) = app.emit(NIGHT_LIGHT_EVENT, current) {
                log::warn!("Failed to emit night light change: {}", err);
            }
        }
    });
}
