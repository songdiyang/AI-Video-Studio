-- 用户自定义视觉风格预设表
CREATE TABLE IF NOT EXISTS user_style_presets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  prompt TEXT NOT NULL,
  style_category ENUM('anime', 'live_action') DEFAULT 'anime',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_style_user_id (user_id)
);
