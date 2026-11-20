// API 密钥保险箱：Windows DPAPI 按用户加密
//
// 模型配置里的 api_key 不再明文落 localStorage：
// 前端把密钥交给 secret_set，Rust 用 CryptProtectData（当前 Windows 用户绑定）
// 加密后存为 app_docs/secrets/<name>.bin；配置文档里只留 key_stored 标记。
// 读取时 secret_get 解密水合回配置对象，下游请求代码无感知。
//
// 非 Windows 平台命令返回 Err，前端沿用旧的 localStorage 明文路径（浏览器降级形态）。

use crate::commands::AppState;
use std::path::PathBuf;
use tauri::State;

/// 应用级熵：把密文绑定到本应用（DPAPI 本身已绑定当前用户）
const ENTROPY: &[u8] = b"com.aivideostudio.app/secrets/v1";

/// 校验密钥名：前端以 provider_model 生成，只允许字母数字与 -_
fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 200
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("非法的密钥名".to_string());
    }
    Ok(())
}

fn secret_path(name: &str, state: &State<'_, AppState>) -> Result<PathBuf, String> {
    validate_name(name)?;
    Ok(state
        .storage
        .root
        .join("app_docs")
        .join("secrets")
        .join(format!("{}.bin", name)))
}

#[cfg(windows)]
mod dpapi {
    use windows::Win32::Foundation::{HLOCAL, LocalFree};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    /// DPAPI 加密（当前用户 + 应用熵）
    pub fn protect(plain: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let input = CRYPT_INTEGER_BLOB {
                cbData: plain.len() as u32,
                pbData: plain.as_ptr() as *mut u8,
            };
            let ent = CRYPT_INTEGER_BLOB {
                cbData: entropy.len() as u32,
                pbData: entropy.as_ptr() as *mut u8,
            };
            let mut out = CRYPT_INTEGER_BLOB::default();
            CryptProtectData(
                &input,
                windows::core::PCWSTR::null(),
                Some(&ent),
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
            .map_err(|e| format!("DPAPI 加密失败: {}", e))?;
            let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(out.pbData as *mut std::ffi::c_void)));
            Ok(bytes)
        }
    }

    /// DPAPI 解密
    pub fn unprotect(cipher: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let input = CRYPT_INTEGER_BLOB {
                cbData: cipher.len() as u32,
                pbData: cipher.as_ptr() as *mut u8,
            };
            let ent = CRYPT_INTEGER_BLOB {
                cbData: entropy.len() as u32,
                pbData: entropy.as_ptr() as *mut u8,
            };
            let mut out = CRYPT_INTEGER_BLOB::default();
            CryptUnprotectData(
                &input,
                None,
                Some(&ent),
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut out,
            )
            .map_err(|e| format!("DPAPI 解密失败: {}", e))?;
            let bytes = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(out.pbData as *mut std::ffi::c_void)));
            Ok(bytes)
        }
    }
}

/// 存入密钥（加密后原子写盘）
#[tauri::command]
pub async fn secret_set(
    name: String,
    value: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = secret_path(&name, &state)?;
    #[cfg(windows)]
    {
        let cipher = dpapi::protect(value.as_bytes(), ENTROPY)?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("无法创建密钥目录: {}", e))?;
        }
        let tmp = path.with_extension("bin.tmp");
        std::fs::write(&tmp, &cipher).map_err(|e| format!("无法写入密钥: {}", e))?;
        std::fs::rename(&tmp, &path).map_err(|e| format!("无法替换密钥: {}", e))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (path, value);
        Err("当前平台不支持安全凭据存储".to_string())
    }
}

/// 读取密钥（不存在返回 None）
#[tauri::command]
pub async fn secret_get(
    name: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let path = secret_path(&name, &state)?;
    #[cfg(windows)]
    {
        let cipher = match std::fs::read(&path) {
            Ok(c) => c,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(format!("无法读取密钥: {}", e)),
        };
        let plain = dpapi::unprotect(&cipher, ENTROPY)?;
        String::from_utf8(plain)
            .map(Some)
            .map_err(|_| "密钥内容损坏（非 UTF-8）".to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("当前平台不支持安全凭据存储".to_string())
    }
}

/// 删除密钥（不存在时静默成功）
#[tauri::command]
pub async fn secret_delete(
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = secret_path(&name, &state)?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("无法删除密钥: {}", e)),
    }
}