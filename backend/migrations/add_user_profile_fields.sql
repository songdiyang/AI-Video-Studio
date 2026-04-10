-- 用户资料增强：新增昵称、头像、签名字段
ALTER TABLE users ADD COLUMN nickname VARCHAR(50) DEFAULT NULL AFTER email;
ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL AFTER nickname;
ALTER TABLE users ADD COLUMN signature VARCHAR(200) DEFAULT NULL AFTER avatar_url;
