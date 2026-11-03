/**
 * AI 助手对话相关共享类型。
 * 独立成模块以消除 ChatMessage.tsx 与 TaskProgressCard.tsx 之间的循环引用。
 */

import type { AskCardData } from '../../services/agentAsk';
                                               
export type { AskCardData } from '../../services/agentAsk';

export interface ChatMessageAttachment {
  type: 'image' | 'video' | 'file' | 'script';
  url: string;
  name?: string;
  /** 剧本附件文本内容 / 图片视频本地缓存 ID（与 AIAssistantPanel 生产侧一致） */
  textContent?: string;
}

export interface ChatMessageSuggestion {
  action: string;
  label: string;
  params?: any;
}

/** 执行步骤（编码智能体风格）：运行中展开逐步刷新，完成后折叠为摘要 */
export interface ChatMessageStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
  startedAt?: number;
  endedAt?: number;
}

/** 后台任务进度卡片数据：由 agent 循环在提交长任务后挂到对话消息上，卡片自轮询工作流状态 */
export interface TaskCardData {
  /** 任务类别 */
  kind: 'storyboard' | 'image' | 'video' | 'generic' | 'script';
  /** 工作流 jobId；离线分镜拆分同步完成时可缺省（直接进入完成态，用 sceneCount） */
  jobId?: string;
  /** 卡片标题（如「重新拆分 · 第1集」） */
  title: string;
  /** 分镜拆分完成数（无 jobId 的同步完成态使用） */
  sceneCount?: number;
  /** 剧本生成阶段；卡片只记录状态与元数据，不记录剧本正文 */
  status?: 'planning' | 'writing' | 'completed' | 'failed';
  /** 已保存的剧本 ID，供完成态确认写入结果 */
  scriptId?: number;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string; // 思考过程（默认折叠）
  attachments?: ChatMessageAttachment[];
  suggestions?: ChatMessageSuggestion[];
  timestamp: number;
  isLoading?: boolean;
  /** 任务进行中：展示旋转指示器，消息内容作为动态进度文案（执行期间由 agent 循环刷新） */
  running?: boolean;
  /** 执行步骤列表：存在时渲染可折叠步骤区（运行中展开、完成/失败后折叠） */
  steps?: ChatMessageStep[];
  /** 后台任务进度卡片：存在时渲染自轮询进度卡（回合结束后仍持续更新到终态） */
  task?: TaskCardData;
  /** Agent 澄清卡片：回答后保留结果，并随用户回答继续原对话 */
  ask?: AskCardData;
}
