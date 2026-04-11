# 版本控制与团队协作功能部署指南

## 1. 数据库迁移

运行以下 SQL 脚本创建所需的表：

```bash
# 连接到 MySQL
mysql -u root -p nanostory

# 运行迁移脚本
source backend/migrations/add_version_control_collaboration.sql
```

或者手动执行 SQL：

```sql
-- 在 nanostory 数据库中执行
source d:/Application/饺子动画/nanostory/backend/migrations/add_version_control_collaboration.sql
```

## 2. 构建与启动

当前仓库只保留 Docker Compose 作为正式启动方式。

```bash
cp docker-compose.env.example docker-compose.env
cp backend/.env.example backend/.env

npm run build:release
npm run release:bootstrap
npm run docker:up
```

协作 WebSocket 已集成到后端 HTTP 服务，通过 `/ws` 暴露，不再单独启动独立的 `ws` 进程。

## 4. 配置环境变量（可选）

在 `.env` 文件中添加：

```env
# WebSocket 服务器端口
COLLAB_PORT=4001

# JWT 密钥（用于 WebSocket 认证）
JWT_SECRET=your-secret-key
```

## 5. 功能测试

### 测试 WebSocket 连接

打开浏览器控制台，运行：

```javascript
const ws = new WebSocket('ws://localhost/ws');
ws.onopen = () => {
  console.log('WebSocket 已连接');
  // 发送认证
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'your-jwt-token'
  }));
};
ws.onmessage = (e) => {
  console.log('收到消息:', JSON.parse(e.data));
};
```

### 测试版本控制 API

```bash
# 获取版本历史
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/api/version/history/storyboard/1

# 创建新版本
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "resourceType": "storyboard",
    "resourceId": 1,
    "versionLabel": "测试版本",
    "changeSummary": "这是一个测试"
  }' \
  http://localhost:4000/api/version/create
```

### 测试团队协作 API

```bash
# 获取团队成员
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:4000/api/collaboration/team/1

# 邀请成员
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "email": "user@example.com",
    "role": "editor"
  }' \
  http://localhost:4000/api/collaboration/invite
```

### 测试审批流程 API

```bash
# 创建审批流程
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": 1,
    "storyboardId": 1,
    "approvalFlow": {
      "stages": [
        {
          "name": "初审",
          "reviewers": [2]
        },
        {
          "name": "终审",
          "reviewers": [1]
        }
      ]
    }
  }' \
  http://localhost:4000/api/approval/create
```

## 6. 前端集成

### 使用 WebSocket Hook

```typescript
import { useWebSocket } from '../hooks/useWebSocket';

function MyComponent() {
  const { isConnected, onlineUsers, broadcastCursor } = useWebSocket({
    projectId: 1,
    resourceId: 123,
    onMessage: (data) => {
      console.log('收到协作消息:', data);
    }
  });

  return (
    <div>
      {isConnected ? '已连接' : '未连接'}
      {onlineUsers.length} 人在线
    </div>
  );
}
```

### 使用自动保存 Hook

```typescript
import { useAutoSave } from '../hooks/useAutoSave';

function StoryboardEditor() {
  const [data, setData] = useState(initialData);
  
  const { manualSave, lastSaveTime } = useAutoSave({
    projectId: 1,
    resourceId: 123,
    resourceType: 'storyboard',
    getData: () => data,
    interval: 5 * 60 * 1000 // 5 分钟
  });

  return (
    <div>
      <button onClick={manualSave}>保存</button>
      <span>上次保存：{new Date(lastSaveTime).toLocaleString()}</span>
    </div>
  );
}
```

### 使用通知 Hook

```typescript
import { useNotifications } from '../hooks/useNotifications';

function NotificationBell() {
  const { notifications, unreadCount, markAsRead } = useNotifications();

  return (
    <div>
      <span>{unreadCount} 条未读</span>
      {notifications.map(n => (
        <div key={n.id} onClick={() => markAsRead(n.id)}>
          {n.title}
        </div>
      ))}
    </div>
  );
}
```

## 7. 故障排查

### WebSocket 无法连接

检查：
1. 后端服务是否启动：`curl http://localhost/api/health`
2. 防火墙是否阻止端口
3. JWT_SECRET 是否配置

### 数据库表不存在

确认已运行迁移脚本：
```sql
USE nanostory;
SHOW TABLES LIKE '%version%';
SHOW TABLES LIKE '%collaboration%';
SHOW TABLES LIKE '%approval%';
```

### API 返回 404

检查路由是否注册：
```javascript
// backend/src/index.js
app.use('/api', versionControlRoutes);
app.use('/api', collaborationRoutes);
app.use('/api', approvalsRoutes);
```

## 8. 性能优化建议

1. **WebSocket 连接池** - 为每个项目建立独立房间
2. **自动保存防抖** - 用户输入时延迟保存
3. **通知分页** - 避免一次性加载所有通知
4. **版本清理** - 定期清理旧版本（保留最近 10 个）

## 9. 安全注意事项

1. **JWT 令牌过期** - WebSocket 重连时检查令牌有效性
2. **权限验证** - 所有 API 都需要 authMiddleware
3. **SQL 注入** - 使用参数化查询
4. **CORS 配置** - 限制 WebSocket 源

## 10. 监控指标

建议添加：
- WebSocket 在线用户数
- 自动保存成功率
- 通知送达率
- 审批流程平均耗时
- 版本创建频率
