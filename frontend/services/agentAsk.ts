/** Agent 澄清工具：把模型输出规范化成可渲染、可回传的交互卡片。 */
export interface AskToolParams {
  question?: unknown;
  options?: unknown;
}

export interface AskCardData {
  question: string;
  options: string[];
  status: 'pending' | 'answered';
  answer?: string;
  answeredAt?: number;
}

const MAX_ASK_OPTIONS = 4;
const MAX_ASK_OPTION_LENGTH = 160;

/**
 * ask 工具入口。候选答案由模型结合当前对话与工程上下文生成，
 * 这里只负责清洗模型输出；自由文本回答始终由卡片额外提供。
 */
export function ask(params: AskToolParams | null | undefined, fallbackQuestion: string): AskCardData {
  const question = typeof params?.question === 'string' ? params.question.trim() : '';
  const rawOptions = Array.isArray(params?.options) ? params.options : [];
  const options: string[] = [];
  const seen = new Set<string>();

  for (const raw of rawOptions) {
    if (typeof raw !== 'string') continue;
    const option = raw.trim().slice(0, MAX_ASK_OPTION_LENGTH);
    if (!option || seen.has(option)) continue;
    seen.add(option);
    options.push(option);
    if (options.length >= MAX_ASK_OPTIONS) break;
  }

  return {
    question: question || fallbackQuestion,
    options,
    status: 'pending',
  };
}
