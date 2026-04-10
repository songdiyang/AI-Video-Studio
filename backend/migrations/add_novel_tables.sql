-- 小说大纲表
CREATE TABLE IF NOT EXISTS novel_outlines (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '未命名大纲',
  content TEXT,
  structure JSON,
  is_ai_generated TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 小说章节表
CREATE TABLE IF NOT EXISTS novel_chapters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  outline_id INT,
  chapter_number INT NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL DEFAULT '未命名章节',
  content LONGTEXT,
  status ENUM('draft', 'writing', 'completed', 'published') DEFAULT 'draft',
  word_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (outline_id) REFERENCES novel_outlines(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 添加索引
CREATE INDEX idx_novel_outlines_project ON novel_outlines(project_id);
CREATE INDEX idx_novel_chapters_project ON novel_chapters(project_id);
CREATE INDEX idx_novel_chapters_outline ON novel_chapters(outline_id);
CREATE INDEX idx_novel_chapters_number ON novel_chapters(project_id, chapter_number);
