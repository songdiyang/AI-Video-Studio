# 饺子动漫 视频生成全流程图

## 总体流程（Mermaid）

```mermaid
flowchart TD
    %% ============ 阶段0：剧本 ============
    subgraph S0["阶段0 · 剧本创作"]
        A0[("📝 用户输入\n标题/描述/风格")]
        A1["scriptGeneration\n剧本生成（文本模型）"]
        A0 --> A1
        A1 -->|"输出: 剧本文本 content"| DB_SCRIPT[("💾 scripts 表\ncontent, title")]
    end

    %% ============ 重新生成时的清理 ============
    CLEAN["cleanBeforeRegenerate\n🗑️ 删分镜 + 孤立角色 + 孤立场景\n（跨集共享的保留）"]
    CLEAN -.->|"重新生成前调用"| S1

    %% ============ 阶段1：分镜拆解 + 场景状态分析 ============
    subgraph S1["阶段1 · 分镜拆解 + 场景状态分析"]
        B1["storyboardGeneration\n分镜生成（文本模型）\n含规则8: 环境变化追踪"]
        DB_SCRIPT -->|"读取: 剧本文本"| B1
        B1 -->|"输出: JSON 数组\norder/description/shotType\nhasAction/startFrame/endFrame\nendState/dialogue/characters\nlocation/emotion/cameraMovement"| DB_SB[("💾 storyboards 表\nprompt_template\nvariables_json")]
        B2["sceneStateAnalysis\n场景状态分析（文本模型）"]
        DB_SB -->|"读取: 所有分镜\ndescription/endState/location"| B2
        B2 -->|"写入 variables_json:\nscene_state\nenvironment_change\nvisual_anchor"| DB_SB
    end

    %% ============ 阶段2：资源提取 ============
    subgraph S2["阶段2 · 资源提取（可并行）"]
        direction LR
        C1["characterExtraction\n角色提取（文本模型）"]
        C2["sceneExtraction\n场景提取（文本模型）"]
    end
    DB_SB -->|"读取: 分镜中的\ncharacters[] + description"| C1
    DB_SB -->|"读取: 分镜中的\nlocation + description"| C2
    C1 -->|"输出: name/appearance\npersonality/description"| DB_CHAR[("💾 characters 表\n+ storyboard_characters 关联")]
    C2 -->|"输出: name/description\nenvironment/lighting/mood"| DB_SCENE[("💾 scenes 表\n+ storyboard_scenes 关联")]

    %% ============ 阶段3：资源图片生成 ============
    subgraph S3["阶段3 · 资源图片生成（可并行）"]
        direction LR
        D1["characterViewsGeneration\n角色三视图（文本+图片模型）"]
        D2["sceneImageGeneration\n场景图生成（文本+图片模型）"]
        D3["sceneStyleAnalysis\n场景风格关联分析（文本模型）"]
    end
    DB_CHAR -->|"读取: 角色外貌描述"| D1
    DB_SCENE -->|"读取: 场景信息"| D2
    DB_SCENE -->|"已有场景图 → 新场景\n风格一致性参考"| D3
    D3 -.->|"referenceImageUrl\n风格参考"| D2
    D1 -->|"输出: image_url\nfront_view_url\nside_view_url\nback_view_url"| DB_CHAR
    D2 -->|"输出: image_url"| DB_SCENE

    %% ============ 阶段4：首尾帧生成（含场景状态动态决策） ============
    subgraph S4["阶段4 · 首尾帧生成（必须串行 + 场景状态决策）"]
        E0{"hasAction?"}
        E1["frameGeneration\n首尾帧生成（文本+图片模型）"]
        E2["singleFrameGeneration\n单帧生成（文本+图片模型）"]
        E0 -->|"true\n动作镜头"| E1
        E0 -->|"false\n静态镜头"| E2
        BATCH["batchFrameGeneration\n批量串行调度器"]
        BATCH --> E0
        SRU["sceneRefUtils\n场景参考图动态决策"]
        E1 & E2 -->|"modified → 生成空镜\ninherit → 查询空镜"| SRU
        SRU -->|"写入/读取"| DB_URL[("💾 storyboards\nupdated_scene_url")]
    end

    DB_SB -->|"读取: description\nstartFrame/endFrame\nendState/dialogue\nshotType/emotion\nscene_state/environment_change"| BATCH
    DB_CHAR -->|"角色参考图\n正面/侧面/背面\n（外貌参考，非姿态）"| E1
    DB_CHAR -->|"角色参考图"| E2
    DB_SCENE -->|"场景图\n（按 scene_state 动态决策）"| E1
    DB_SCENE -->|"场景图\n（按 scene_state 动态决策）"| E2

    E1 -->|"输出:\nfirst_frame_url\nlast_frame_url"| DB_SB
    E2 -->|"输出:\nfirst_frame_url"| DB_SB

    %% 串行链式依赖（核心！）
    E1 & E2 -.->|"🔗 上一镜头尾帧\nprevEndFrameUrl\nprevEndState\nprevDescription"| BATCH

    %% ============ 阶段5：运镜提示词 ============
    subgraph S5["阶段5 · 运镜提示词（可选）"]
        F1["cameraRunGeneration\n精细运镜提示词（文本模型）"]
    end
    DB_SB -->|"读取: cameraMovement\nfirstFrame/lastFrame\nendState/上下文"| F1
    F1 -->|"输出: camera_run_prompt"| DB_SB

    %% ============ 阶段6：视频生成 ============
    subgraph S6["阶段6 · 视频生成（可并行）"]
        G1["sceneVideoGeneration\n分镜视频生成（文本+视频模型）"]
        G_BATCH["batchSceneVideoGeneration\n批量并发调度器"]
        G_BATCH --> G1
    end

    DB_SB -->|"读取: description/dialogue\nfirstFrame/lastFrame\nprevEndState\ncameraMovement\ncamera_run_prompt"| G_BATCH
    DB_CHAR -->|"角色信息\n（用于提示词）"| G1
    DB_SCENE -->|"场景信息\n（用于提示词）"| G1
    G1 -->|"输出: video_url"| DB_SB

    %% ============ 阶段7：视频合成导出 ============
    subgraph S7["阶段7 · 视频合成导出（浏览器端）"]
        H1["FFmpeg.wasm\n片段拼接 + H.264 编码"]
        H2["ExportToolbar\n步骤进度 + 实时耗时 + Debug 面板"]
        H1 --> H2
    end
    DB_SB -->|"读取: video_url\n（所有分镜视频）"| H1
    H2 -->|"输出: 合成 MP4"| DOWNLOAD["📥 浏览器下载"]

    %% ============ 样式 ============
    classDef storage fill:#fff3cd,stroke:#ffc107,stroke-width:2px
    classDef process fill:#d1ecf1,stroke:#0dcaf0,stroke-width:1px
    classDef batch fill:#e2e3f1,stroke:#6c63ff,stroke-width:2px
    classDef cleanup fill:#f8d7da,stroke:#dc3545,stroke-width:1px,stroke-dasharray: 5 5
    classDef client fill:#d4edda,stroke:#28a745,stroke-width:1px

    class DB_SCRIPT,DB_SB,DB_CHAR,DB_SCENE,DB_URL storage
    class A1,B1,B2,C1,C2,D1,D2,D3,F1,G1 process
    class BATCH,G_BATCH batch
    class CLEAN cleanup
    class H1,H2,DOWNLOAD client
```

## 阶段依赖关系矩阵

| 阶段 | 依赖的上游 | 并行/串行 | 说明 |
|---|---|---|---|
| 0. 剧本生成 | 无 | - | 用户触发 |
| 1. 分镜拆解 | 剧本 | - | 将剧本拆为镜头序列，含环境变化追踪规范 |
| 1.5 场景状态分析 | 分镜 | - | 分析每个镜头的 scene_state / environment_change / visual_anchor |
| 2. 资源提取 | 分镜 | **角色/场景可并行** | 从分镜中提取角色和场景实体 |
| 3. 资源图片 | 角色信息 + 场景信息 | **角色图/场景图可并行** | 场景图之间有风格关联依赖 |
| 4. 首尾帧 | 分镜 + 角色图 + 场景图 + 场景状态 | **必须串行**（链式） | 按 scene_state 动态决策参考图，modified 后生成空镜 |
| 5. 运镜提示词 | 首尾帧 + 分镜 | 可并行 | 可选步骤 |
| 6. 视频生成 | 首尾帧 + 运镜 + 分镜 | **可并行**（并发池） | 每个镜头独立生成视频 |
| 7. 视频合成导出 | 所有分镜视频 | - | 浏览器端 FFmpeg.wasm 拼接，含步骤进度和 debug 日志 |

## 阶段4 首尾帧串行链式详解

```mermaid
flowchart LR
    subgraph 镜头1["镜头1 · normal"]
        S1_start["首帧\n（无前帧参考）"]
        S1_end["尾帧"]
        S1_start --> S1_end
    end

    subgraph 镜头2["镜头2 · modified\n🔥 环境变化"]
        S2_start["首帧\n（不传场景图）"]
        S2_end["尾帧"]
        S2_start --> S2_end
        S2_end -->|"生成更新版空镜"| S2_scene["sceneRefUtils\n→ updated_scene_url"]
    end

    subgraph 镜头3["镜头3 · inherit\n✅ 继承变化"]
        S3_start["首帧"]
        S3_end["尾帧"]
        S3_start --> S3_end
    end

    S1_end -->|"prevEndFrameUrl\nprevEndState\nprevDescription"| S2_start
    S2_end -->|"prevEndFrameUrl\nprevEndState\nprevDescription"| S3_start
    S2_scene -.->|"updated_scene_url\n替代原始场景图"| S3_start

    REF_CHAR(["🧑 角色参考图\n（外貌参考，非姿态）"])
    REF_SCENE(["🏞️ 场景参考图"])

    REF_CHAR -.->|"每帧都参考"| S1_start & S2_start & S3_start
    REF_SCENE -.->|"normal → 原始场景图"| S1_start
    REF_SCENE -.->|"modified → ❌ 不传"| S2_start
```

## 场景参考图动态决策（scene_state 三态）

| scene_state | 场景参考图 | 提示词 |
|-------------|-----------|--------|
| `normal` | 原始场景图 | 标准约束 |
| `modified` | **不传**（靠 environment_change 描述引导） | 加入环境变化描述 |
| `inherit` | **updated_scene_url**（上一个 modified 生成的空镜） | 约束"保持已变化的环境" |

## 每帧的参考图构成

### 首帧 imageUrls 数组（normal / inherit）：
```
[
  prevEndFrameUrl,      // 位置0（unshift）：上一镜头尾帧 → 最高优先级
  characterFrontView,   // 位置1：角色正面立绘（外貌参考）
  (characterSideView),  // 位置2（可选）：侧面/背面视图
  sceneImage            // 最后：原始场景图 或 updated_scene_url
]
```

### 首帧 imageUrls 数组（modified）：
```
[
  prevEndFrameUrl,      // 位置0：上一镜头尾帧
  characterFrontView,   // 位置1：角色正面立绘
  (characterSideView),  // 位置2（可选）
  // ❌ 不传场景图，靠提示词中的 environment_change 引导
]
```

### 尾帧 endFrameRefs 数组：
```
[
  startFrame,           // 位置0：刚生成的首帧 → 最高优先级
  characterFrontView,   // 位置1：角色正面立绘
  (characterSideView),  // 位置2（可选）
  sceneImage            // 最后：同首帧的场景图决策
]
```