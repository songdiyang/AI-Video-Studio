//! 夜间模式（Night light / Night Shift）状态读取与变化监听。
//!
//! 三端均无公开 API，按平台各自策略探测，任何失败都按"关闭"处理，
//! 由前端回退到系统深色偏好兜底：
//!  - Windows：注册表 CloudStore bluelightreductionstate（社区逆向字节布局，跨版本可能变化）；
//!  - macOS：Night Shift 无公开接口，尝试 CoreBrightness 偏好键（不可用则关闭）；
//!  - Linux：GNOME 夜间模式 gsettings（其它桌面环境不可用则关闭）。

use tauri::{AppHandle, Emitter};

/// 夜间模式状态变化事件名（payload: bool）
pub const NIGHT_LIGHT_EVENT: &str = "night-light-changed";

#[cfg(target_os = "windows")]
mod platform {
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

#[cfg(target_os = "macos")]
mod platform {
    /// Night Shift 无公开 API；尝试读 CoreBrightness 偏好（历史系统可用）。
    /// 读不到或键不存在一律按关闭处理，由前端用系统深色偏好兜底。
    pub fn is_enabled() -> bool {
        let out = std::process::Command::new("defaults")
            .args(["read", "com.apple.CoreBrightness", "CBBlueLightReductionEnabled"])
            .output();
        match out {
            Ok(o) if o.status.success() => {
                String::from_utf8_lossy(&o.stdout).trim() == "1"
            }
            _ => false,
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod platform {
    /// GNOME 夜间模式（gsettings）；其它桌面环境/未安装时按关闭处理。
    pub fn is_enabled() -> bool {
        let out = std::process::Command::new("gsettings")
            .args(["get", "org.gnome.settings-daemon.plugins.color", "night-light-enabled"])
            .output();
        match out {
            Ok(o) if o.status.success() => {
                String::from_utf8_lossy(&o.stdout).trim() == "true"
            }
            _ => false,
        }
    }
}

/// 查询夜间模式是否开启
#[tauri::command]
pub async fn get_night_light_enabled() -> Result<bool, String> {
    let enabled = platform::is_enabled();
    log::info!("Night light queried: {}", enabled);
    Ok(enabled)
}

/// 启动状态监听：每 5 秒探测一次，变化时向前端推送事件。
/// 三端都没有可靠的变更通知通道，轮询单个布尔值开销可忽略。
pub fn spawn_watcher(app: AppHandle) {
    let initial = platform::is_enabled();
    log::info!("Night light initial state: {}", initial);

    tauri::async_runtime::spawn(async move {
        let mut last = initial;
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            let current = platform::is_enabled();
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
