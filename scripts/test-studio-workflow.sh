#!/bin/bash
# 测试剧本→影棚完整工作流
# 用法: ./test-studio-workflow.sh PROJECT_ID SCRIPT_ID TOKEN

PROJECT_ID=${1:-108}
SCRIPT_ID=${2:-120}
MYSQL_CMD="mysql -u root -p'Hm[666o<]540,.md-*/6' -h 39.105.158.61 -P 3306 nanostory"
BASE_URL="http://localhost:4000"

TOKEN=$(cd /var/www/nanostory/backend && node -e "const jwt = require('jsonwebtoken'); const secret = require('fs').readFileSync('.env','utf8').match(/JWT_SECRET=(.+)/)[1]; console.log(jwt.sign({userId: 52, email: '495615583@qq.com', role: 'user'}, secret, {expiresIn: '1h'}));")

echo "=== 阶段1: 从剧本拆解环境与建筑 ==="
RESP1=$(curl -s -X POST "$BASE_URL/api/studios/extract-components" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": $PROJECT_ID, \"scriptId\": $SCRIPT_ID, \"textModel\": \"DeepSeek Chat\"}")
echo "$RESP1" | jq .

JOB_ID1=$(echo "$RESP1" | jq -r '.jobId // empty')
if [ -z "$JOB_ID1" ]; then
  echo "❌ 阶段1启动失败"
  exit 1
fi

echo ""
echo "等待 30 秒让 AI 完成拆解..."
sleep 30

echo ""
echo "=== 验证 environments ==="
mysql -u root -p'Hm[666o<]540,.md-*/6' -h 39.105.158.61 nanostory -e "
SELECT id, name, weather, time_of_day FROM environments WHERE project_id = $PROJECT_ID ORDER BY sort_order;
"

echo ""
echo "=== 验证 buildings ==="
mysql -u root -p'Hm[666o<]540,.md-*/6' -h 39.105.158.61 nanostory -e "
SELECT id, name, interior_exterior FROM buildings WHERE project_id = $PROJECT_ID ORDER BY sort_order;
"

echo ""
echo "=== 阶段2: 从剧本组装影棚 ==="
RESP2=$(curl -s -X POST "$BASE_URL/api/studios/compose-from-script" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"projectId\": $PROJECT_ID, \"scriptId\": $SCRIPT_ID, \"textModel\": \"DeepSeek Chat\"}")
echo "$RESP2" | jq .

JOB_ID2=$(echo "$RESP2" | jq -r '.jobId // empty')
if [ -z "$JOB_ID2" ]; then
  echo "❌ 阶段2启动失败"
  exit 1
fi

echo ""
echo "等待 30 秒让 AI 完成组装..."
sleep 30

echo ""
echo "=== 验证 studios ==="
mysql -u root -p'Hm[666o<]540,.md-*/6' -h 39.105.158.61 nanostory -e "
SELECT id, name, environment_id FROM studios WHERE project_id = $PROJECT_ID ORDER BY sort_order;
"

echo ""
echo "=== 验证 studio_building_links ==="
mysql -u root -p'Hm[666o<]540,.md-*/6' -h 39.105.158.61 nanostory -e "
SELECT s.name AS studio, b.name AS building
FROM studio_building_links l
JOIN studios s ON s.id = l.studio_id
JOIN buildings b ON b.id = l.building_id
WHERE s.project_id = $PROJECT_ID;
"

echo ""
echo "=== 工作流执行状态 ==="
mysql -u root -p'Hm[666o<]540,.md-*/6' -h 39.105.158.61 nanostory -e "
SELECT w.id, w.workflow_type, w.status, w.current_step_index, w.total_steps
FROM workflow_jobs w
WHERE w.workflow_type LIKE 'studio_%'
ORDER BY w.created_at DESC
LIMIT 5;
"

echo ""
echo "✅ 测试完成"
