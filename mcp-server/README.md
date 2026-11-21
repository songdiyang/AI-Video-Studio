# aivs-mcp · AI Video Studio 的 MCP 服务

把本地工程（剧本 / 分镜 / 角色 / 道具 / 影棚 / 快照）以
[Model Context Protocol](https://modelcontextprotocol.io) 开放给**任意外部智能体**：
Claude Desktop、Cursor、Cline、自研 Agent 等只需接一个 stdio MCP 服务，
即可读写 AI Video Studio 的工程数据。

- 直接读写工程目录里的 `project.json` 与 `data/*.json`（与桌面应用同一份数据，无需应用在线）；
- 删除类操作强制 `confirm=true`，执行前**自动打工程快照**（保留最近 10 份，
  与应用内「设置 › 工程设置 › 快照与恢复」完全兼容，可直接还原）；
- 字段白名单 + 路径越界校验；`media/` 素材不会被改写；
- 原子写（tmp + rename），不会产生半截 JSON。

## 安装

需要 Node.js 18+。

```bash
# 本仓库内使用
cd mcp-server
npm install

# 或打包后全局安装（给其它机器/其它软件用）
npm pack                       # 产出 aivs-mcp-1.0.0.tgz
npm install -g ./aivs-mcp-1.0.0.tgz
# 之后命令为 aivs-mcp（等价于 node server.mjs）
```

工程根目录默认是 `文档/AI-Video-Studio作品`（macOS/Linux 为 `~/Documents/AI-Video-Studio作品`），
可用环境变量 `AIVS_PROJECTS_ROOT` 覆盖；每个工具也接受显式 `projectPath`。

## 接入外部软件

通用配置（JSON）——把 `command` 指到本目录的 `server.mjs`：

```json
{
  "mcpServers": {
    "aivs": {
      "command": "node",
      "args": ["D:/path/to/AI-Video-Studio/mcp-server/server.mjs"],
      "env": { "AIVS_PROJECTS_ROOT": "C:/Users/<you>/Documents/AI-Video-Studio作品" }
    }
  }
}
```

- **Claude Desktop**：`claude_desktop_config.json` → `mcpServers`
- **Cursor**：项目根 `.cursor/mcp.json` → `mcpServers`
- **Cline / Roo 等**：MCP Servers → Configure → 同上 JSON
- 全局安装后也可用：`"command": "aivs-mcp"`

## 工具一览

| 工具 | 说明 | 破坏性 |
| --- | --- | --- |
| `list_projects` | 列出本地工程（可传 root） | 否 |
| `project_summary` | 清单 + 剧本/分镜/角色/道具/影棚/快照数量 | 否 |
| `update_project_meta` | 改工程名/描述 | 否 |
| `list_scenes` / `read_scene` | 分镜列表（分页）/ 单条完整记录 | 否 |
| `create_scene` | 末尾新建分镜（描述、时长） | 否 |
| `update_scene` | 改描述/提示词/时长/地点/景别/情绪/台词/出场角色道具 | 否 |
| `update_scene_dialogues` | 台词数组（一行一个说话人，禁止行内「某某：」前缀） | 否 |
| `delete_scene` | 删除分镜 | **是（confirm + 自动快照）** |
| `list_scripts` / `read_script` / `update_script` | 剧本列表 / 全文 / 改标题正文 | 否 |
| `list_characters` / `read_character` / `create_character` / `update_character` | 角色资产 CRUD（只写设定，不触发生图） | 否 |
| `delete_character` | 删除角色 | **是（confirm + 自动快照）** |
| `list_props` / `list_studios` | 道具 / 影棚只读摘要 | 否 |
| `read_project_settings` | 工程生成设置（美术风格/写手等） | 否 |
| `create_snapshot` / `list_snapshots` | 手动快照 / 快照列表 | 否 |

资源：`aivs://projects`（工程列表 JSON）。

### 典型对话

> 「列出我的工程」→ `list_projects`
> 「看看《悲伤后遗症》第 1 个分镜」→ `project_summary` → `read_scene`
> 「把第 2 分区描述改成雨夜霓虹，并补两句台词」→ `update_scene` + `update_scene_dialogues`
> 「删掉第 5 个分镜」→ `delete_scene`（confirm=true，自动快照）

## 安全模型

1. **快照先行**：删除分镜/角色前自动快照；快照目录与 Rust `snapshots.rs` 同布局
   （`snapshots/<id>/{data/,project.json,meta.json}`），应用内可直接恢复。
2. **可写面收敛**：每个工具只接受白名单字段；未知字段直接报错而不是静默丢弃。
3. **路径校验**：任何文件操作被限制在工程目录内，`../` 越界直接拒绝。
4. **不碰素材**：`media/` 只作为既有引用出现，MCP 不会写/删素材文件。
5. **UI 生成动作不外放**：白膜、出图、出视频、自动拆镜等依赖应用内 UI 状态与付费
   模型的流程仍由应用内智能体执行；MCP 负责结构化数据与快照。

## 并发注意

桌面应用对文档有内存缓存 + 300ms 防抖写。**应用正在编辑同一工程时**，外部写入可能
被应用的后写覆盖；请在外部智能体批量修改前关闭应用的对应工程，或先
`create_snapshot` 留底（任何覆盖都可回退）。

## 自测

```bash
npm test     # 数据层 9 例（临时夹具，覆盖快照/白名单/越界/台词清洗）
npm run smoke # MCP 协议级冒烟：真实 stdio 客户端 initialize→tools/list→tools/call
```