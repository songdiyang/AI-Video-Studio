// API 密钥加密模块
// 使用 AES-GCM 加密算法保护用户的 API 密钥

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose, Engine as _};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

const SALT_LENGTH: usize = 32;
const NONCE_LENGTH: usize = 12;

/// 获取或生成设备密钥
fn get_device_key() -> Result<Vec<u8>, String> {
    let key_path = get_key_file_path()?;
    
    if key_path.exists() {
        // 读取现有密钥
        fs::read(&key_path).map_err(|e| format!("Failed to read key file: {}", e))
    } else {
        // 生成新密钥
        let mut key = vec![0u8; SALT_LENGTH];
        use rand::RngCore;
        OsRng.fill_bytes(&mut key);
        
        // 确保目录存在
        if let Some(parent) = key_path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create key directory: {}", e))?;
        }
        
        // 保存密钥
        fs::write(&key_path, &key).map_err(|e| format!("Failed to write key file: {}", e))?;
        
        Ok(key)
    }
}

/// 获取密钥文件路径
fn get_key_file_path() -> Result<PathBuf, String> {
    let app_data_dir = dirs::data_local_dir()
        .ok_or("Failed to get app data directory")?;
    
    Ok(app_data_dir.join("AI-Video-Studio").join(".key"))
}

/// 派生加密密钥
fn derive_key(device_key: &[u8], salt: &[u8]) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(device_key);
    hasher.update(salt);
    hasher.finalize().to_vec()
}

/// 加密 API 密钥
pub fn encrypt_api_key(api_key: &str) -> Result<String, String> {
    let device_key = get_device_key()?;
    
    // 生成随机 salt
    let mut salt = vec![0u8; SALT_LENGTH];
    use rand::RngCore;
    OsRng.fill_bytes(&mut salt);
    
    // 派生加密密钥
    let key = derive_key(&device_key, &salt);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    
    // 生成随机 nonce
    let mut nonce_bytes = vec![0u8; NONCE_LENGTH];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    // 加密
    let ciphertext = cipher
        .encrypt(nonce, api_key.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;
    
    // 组合 salt + nonce + ciphertext
    let mut result = Vec::new();
    result.extend_from_slice(&salt);
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    
    // Base64 编码
    Ok(general_purpose::STANDARD.encode(result))
}

/// 解密 API 密钥
pub fn decrypt_api_key(encrypted: &str) -> Result<String, String> {
    let device_key = get_device_key()?;
    
    // Base64 解码
    let data = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;
    
    if data.len() < SALT_LENGTH + NONCE_LENGTH {
        return Err("Invalid encrypted data length".to_string());
    }
    
    // 分离 salt, nonce, ciphertext
    let salt = &data[..SALT_LENGTH];
    let nonce_bytes = &data[SALT_LENGTH..SALT_LENGTH + NONCE_LENGTH];
    let ciphertext = &data[SALT_LENGTH + NONCE_LENGTH..];
    
    // 派生解密密钥
    let key = derive_key(&device_key, salt);
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let nonce = Nonce::from_slice(nonce_bytes);
    
    // 解密
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;
    
    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 decode failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let original = "sk-test-api-key-12345";
        let encrypted = encrypt_api_key(original).unwrap();
        let decrypted = decrypt_api_key(&encrypted).unwrap();
        assert_eq!(original, decrypted);
    }
}
