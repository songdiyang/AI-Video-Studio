/**
 * 工程生成参数（设置页 · 工程设置）
 * ──────────────────────────────────────────────────────────────
 * 当前工程的图片/视频分辨率、画面比例与美术风格限定，持久化在工程目录
 * data/project_settings.json（localStore 文档），随 .jzp 归档携带。
 *
 * 消费链路：useStoryboardCore 读取后合并进 projectSettings，
 * 生成图片/视频时优先于模型默认值（'' 表示自动、跟随模型默认）；
 * 美术风格限定由 localWorkflow 统一追加到图片/视频/提示词优化请求上。
 * 保存后派发 project-generation-settings-changed 事件，工作台实时生效。
 */

import { readProjectDoc, writeProjectDoc } from './localStore';
import { findWriterPreset, type WriterPreset } from './writerStyle';

/** 工程生成参数：'' 或缺省表示自动（跟随模型默认） */
export interface ProjectGenerationSettings {
  imageAspectRatio?: string;
  imageResolution?: string;
  videoAspectRatio?: string;
  videoResolution?: string;
  /** 美术风格预设 key（见 ART_STYLE_PRESETS），'' 表示不限定 */
  artStyle?: string;
  /** 风格限定描述：写入提示词的完整风格约束，空表示不追加 */
  artStylePrompt?: string;
  /** 临时风格覆盖：用户临时意图优先于工程限定，非空时替代 artStylePrompt 注入 */
  tempArtStylePrompt?: string;
  /** 临时风格来源说明（如「用户要求第3镜用水墨风」），便于 UI 展示与 AI 理解 */
  tempArtStyleNote?: string;
  /** 代笔写手预设 key（见 WRITER_PRESETS），'' 表示不限定：只套去 AI 味与格式护栏，不加人格 */
  writerKey?: string;
  /** 写手风格指令：注入剧本生成/润色/拆分提示词；留空则回落写手卡内置 voice */
  writerStylePrompt?: string;
  /** 选角理由（cast-writer 写入），供设置页与智能体播报 */
  writerNote?: string;
  /** 临时写手覆盖：某一集想换个笔法时用，非空时优先于 writerKey */
  tempWriterKey?: string;
  /** 临时写手来源说明 */
  tempWriterNote?: string;
}

/** 工程当前生效的代笔写手 */
export interface EffectiveWriter {
  /** 生效 key（'' = 不限定） */
  key: string;
  /** 命中的写手卡，未限定或 key 非法时为 null */
  writer: WriterPreset | null;
  /** 生效风格文本：用户改写优先，其次写手卡内置 voice，皆空表示不注入人格 */
  stylePrompt: string;
  /** 选角理由 */
  note: string;
  /** 是否为临时覆盖 */
  temp: boolean;
}

/** 美术风格预设：key 存库，prompt 是追加到生成提示词里的风格描述 */
export const ART_STYLE_PRESETS: Array<{ key: string; label: string; prompt: string }> = [
  { key: '', label: '不限定', prompt: '' },
  { key: 'anime-japanese', label: '日系动漫', prompt: '日系动画风，线条干净，赛璐璐上色，柔和光影与通透色彩' },
  { key: 'anime-chinese', label: '国漫古风', prompt: '国漫古风，工笔细节，青绿暖金配色，留白氛围' },
  { key: 'realistic', label: '写实电影', prompt: '写实电影质感，自然光比，真实材质细节与轻微胶片颗粒' },
  { key: 'render-3d', label: '3D 渲染', prompt: '3D 动画渲染，PBR 材质，柔和的全局光照与体积雾' },
  { key: 'watercolor', label: '水彩插画', prompt: '水彩插画，纸张纹理，边缘晕染，淡彩叠加' },
  { key: 'cyberpunk', label: '赛博朋克', prompt: '赛博朋克，霓虹冷光与品红高光，湿润反光地面' },
  { key: 'ink', label: '水墨', prompt: '中国水墨，墨色浓淡层次，留白构图' },
  { key: 'custom', label: '自定义', prompt: '' },
];

/** 按 key 取预设（未匹配返回 undefined） */
export function findArtStylePreset(key: string | undefined | null) {
  return ART_STYLE_PRESETS.find((preset) => preset.key === (key || ''));
}

/** 工程生成参数变更事件名（detail: { projectId, settings }） */
export const PROJECT_SETTINGS_CHANGED = 'project-generation-settings-changed';

/** 读取工程生成参数；未打开/非本地工程返回空对象（各字段自动） */
export async function loadProjectGenerationSettings(
  projectId: number | null | undefined
): Promise<ProjectGenerationSettings> {
  if (!projectId) return {};
  const doc = await readProjectDoc<ProjectGenerationSettings>(projectId, 'projectSettings', {});
  return doc && typeof doc === 'object' ? doc : {};
}

/**
 * 保存工程生成参数（写内存缓存 + 防抖落盘），并广播变更事件
 * 供已打开的工作台实时应用。
 */
export async function saveProjectGenerationSettings(
  projectId: number,
  settings: ProjectGenerationSettings
): Promise<boolean> {
  const accepted = await writeProjectDoc(projectId, 'projectSettings', settings);
  window.dispatchEvent(
    new CustomEvent(PROJECT_SETTINGS_CHANGED, { detail: { projectId, settings } })
  );
  return accepted;
}

/**
 * 取工程的美术风格限定提示词。
 * 以 `artStylePrompt` 为唯一真源（预设只是快捷填充，用户可改可清空），
 * 返回空字符串表示该工程未做风格限定（不追加任何内容）。
 */
export async function loadProjectArtStylePrompt(
  projectId: number | null | undefined
): Promise<string> {
  const settings = await loadProjectGenerationSettings(projectId);
  return (settings.artStylePrompt || '').trim();
}

/**
 * 取当前生效的美术风格提示词：临时覆盖优先于工程锁定。
 * 用户临时风格意图（机动性高）> 工程限定（长期约束）；
 * 无临时覆盖时回落到 artStylePrompt，二者皆空返回 ''。
 */
export async function loadEffectiveArtStylePrompt(
  projectId: number | null | undefined
): Promise<string> {
  const settings = await loadProjectGenerationSettings(projectId);
  const temp = (settings.tempArtStylePrompt || '').trim();
  if (temp) return temp;
  return (settings.artStylePrompt || '').trim();
}

/** 设置临时风格覆盖（不动工程锁定风格），广播变更事件 */
export async function setTempArtStyle(
  projectId: number,
  prompt: string,
  note?: string
): Promise<boolean> {
  const settings = await loadProjectGenerationSettings(projectId);
  const next: ProjectGenerationSettings = {
    ...settings,
    tempArtStylePrompt: (prompt || '').trim(),
    tempArtStyleNote: (note || '').trim(),
  };
  return saveProjectGenerationSettings(projectId, next);
}

/** 清除临时风格覆盖，恢复工程锁定风格 */
export async function clearTempArtStyle(projectId: number): Promise<boolean> {
  const settings = await loadProjectGenerationSettings(projectId);
  const next: ProjectGenerationSettings = { ...settings };
  delete next.tempArtStylePrompt;
  delete next.tempArtStyleNote;
  return saveProjectGenerationSettings(projectId, next);
}

// ==================== 代笔写手（剧本文风） ====================

/**
 * 取当前生效的代笔写手。
 * 临时覆盖优先于工程锁定（与美术风格同一口径）；
 * writerStylePrompt 是用户可改写的第一真源，留空才回落到写手卡内置 voice。
 */
export async function loadEffectiveWriter(
  projectId: number | null | undefined
): Promise<EffectiveWriter> {
  const settings = await loadProjectGenerationSettings(projectId);
  const tempKey = (settings.tempWriterKey || '').trim();
  if (tempKey) {
    const writer = findWriterPreset(tempKey);
    return {
      key: writer ? tempKey : '',
      writer,
      stylePrompt: writer?.voice ?? '',
      note: (settings.tempWriterNote || '').trim(),
      temp: true,
    };
  }
  const key = (settings.writerKey || '').trim();
  const writer = findWriterPreset(key);
  const edited = (settings.writerStylePrompt || '').trim();
  return {
    key: writer ? key : '',
    writer,
    stylePrompt: edited || writer?.voice || '',
    note: (settings.writerNote || '').trim(),
    temp: false,
  };
}

/**
 * 锁定工程代笔写手（选角结果落库处）。
 * 传入 null / '' 表示不限定；stylePrompt 留空则使用写手卡内置 voice。
 */
export async function lockWriter(
  projectId: number,
  key: string | null | undefined,
  stylePrompt?: string,
  note?: string
): Promise<boolean> {
  const settings = await loadProjectGenerationSettings(projectId);
  const writer = findWriterPreset(key);
  const next: ProjectGenerationSettings = {
    ...settings,
    writerKey: writer ? writer.key : '',
    writerStylePrompt: (stylePrompt || '').trim() || writer?.voice || '',
    writerNote: (note || '').trim(),
  };
  return saveProjectGenerationSettings(projectId, next);
}

/** 设置临时写手覆盖（不动工程锁定写手），用于"这一集换个笔法" */
export async function setTempWriter(
  projectId: number,
  key: string,
  note?: string
): Promise<boolean> {
  const settings = await loadProjectGenerationSettings(projectId);
  const next: ProjectGenerationSettings = {
    ...settings,
    tempWriterKey: (key || '').trim(),
    tempWriterNote: (note || '').trim(),
  };
  return saveProjectGenerationSettings(projectId, next);
}

/** 清除临时写手覆盖，恢复工程锁定写手 */
export async function clearTempWriter(projectId: number): Promise<boolean> {
  const settings = await loadProjectGenerationSettings(projectId);
  const next: ProjectGenerationSettings = { ...settings };
  delete next.tempWriterKey;
  delete next.tempWriterNote;
  return saveProjectGenerationSettings(projectId, next);
}
