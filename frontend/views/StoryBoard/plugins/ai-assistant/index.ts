/**
 * AI 助手插件入口
 * ──────────────────────────────────────────────────────────────
 * AI 助手已统一为 Layout 层全局右侧停靠侧边栏（AIAssistantDrawer），
 * 本模块仅保留工作台 → 全局侧边栏的数据/动作桥接。
 */

export { useStoryboardAIAssistantBridge } from './useAIAssistantBridge';
export type { StoryboardAIAssistantBridgeParams } from './useAIAssistantBridge';
