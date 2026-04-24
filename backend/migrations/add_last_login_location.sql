-- 添加最后登录地点字段
ALTER TABLE users ADD COLUMN last_login_location VARCHAR(100) DEFAULT NULL COMMENT '最后登录地点（省份/城市）' AFTER last_login_ip;
