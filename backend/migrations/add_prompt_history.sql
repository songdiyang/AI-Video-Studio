-- 分镜提示词版本历史表
-- 幂等设计：使用 CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS storyboard_prompt_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  storyboard_id INT NOT NULL,
  prompt_text TEXT NOT NULL,
  version_number INT NOT NULL DEFAULT 1,
  is_current BOOLEAN DEFAULT FALSE,
  source ENUM('manual','ai') DEFAULT 'manual',
  created_by INT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (storyboard_id) REFERENCES storyboards(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_storyboard_version (storyboard_id, version_number DESC)
);
