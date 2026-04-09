-- 角色状态变更历史记录表
CREATE TABLE IF NOT EXISTS character_state_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  character_id INT NOT NULL,
  state_id INT NOT NULL,
  action ENUM('created','updated','activated','deactivated','deleted','duplicated') NOT NULL,
  changes JSON,
  snapshot JSON,
  performed_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
  INDEX idx_history_character (character_id),
  INDEX idx_history_state (state_id),
  INDEX idx_history_action (action),
  INDEX idx_history_created (created_at)
);
