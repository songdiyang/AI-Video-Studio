/**
 * 前端首尾帧生成预检校验
 * 
 * 与后端 frameGeneration.js 的 collectCandidateImages 保持一致：
 * - 支持多角色镜头，逐个校验角色资源完整性
 * - 角色字段完整性：name, description, appearance, personality, image_url
 * - 影棚必须存在且有图片（九宫组装图或环境图）
 */

import { getAuthToken } from '../../../services/auth';
import { batchValidateScenes } from '../../../services/storyboards';

export interface ValidationIssue {
  type: string;
  message: string;
  blocking: boolean; // true = 阻止生成，false = 警告但可继续
}

export interface ValidationResult {
  ready: boolean;
  issues: ValidationIssue[];
  blockingIssues: ValidationIssue[];
  warningIssues: ValidationIssue[];
}

interface CharacterRecord {
  id: number;
  name: string;
  description?: string;
  appearance?: string;
  personality?: string;
  image_url?: string;
}

interface StudioRecord {
  id: number;
  name: string;
  description?: string;
  nine_grid_image_url?: string;
  environment_id?: number;
  cover_image_url?: string;
}

/**
 * 检查字符串字段是否为非空
 */
function isEmptyField(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}

// ============ 非角色群体词过滤（与后端 characterFilter.js 保持一致） ============

const NON_CHARACTER_TERMS = new Set([
  '人群', '路人', '群众', '众人', '行人', '观众', '围观者', '人们',
  '群演', '背景人物', '旁人', '陌生人', '过客', '游客', '旅客',
  '村民', '居民', '市民', '百姓', '民众', '平民',
  '士兵', '卫兵', '侍卫', '侍女', '仆人', '随从', '下人', '杂兵', '守卫',
  '商贩', '小贩', '摊贩', '店员', '伙计',
  '僧人', '僧侣', '道士', '和尚',
  '乘客', '旅人', '客人', '宾客', '来宾',
  '工人', '农民', '渔民', '猎人',
  '顾客', '买家', '卖家', '食客', '住客', '房客', '租客', '访客',
  '同学们', '学生们', '老师们', '孩子们', '小朋友', '少年们',
  '记者', '警察', '医生', '护士',
  '大人', '小孩', '老人', '少女', '少年', '青年', '中年人', '老年人',
  '男人', '女人', '男子', '女子', '男孩', '女孩',
  '众人们', '其他人', '周围的人', '附近的人', '身边的人',
  'NPC', 'npc', '龙套', '配角们', '路人甲', '路人乙',
  '少年少女', '其他少年少女', '其他人物', '其他角色', '其他同学',
  '一群人', '几个人', '数人', '若干人', '男女', '老少', '老幼', '男女老少',
]);

const NON_CHARACTER_PREFIXES = ['其他', '其余', '另外', '别的', '一些', '几个', '几名', '一群', '数个', '数名', '若干', '部分', '剩余', '周围'];

const NON_CHARACTER_ROOTS = [
  '少年', '少女', '青年', '小孩', '孩子', '男孩', '女孩', '男子', '女子',
  '人物', '角色', '同学', '学生', '老师', '路人', '村民', '居民', '市民',
  '士兵', '卫兵', '侍卫', '商贩', '行人', '观众', '游客', '乘客', '客人', '顾客',
  '少年少女', '男女', '人', '人们', '群众', '百姓',
];

function isNonCharacterEntity(name: string): boolean {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (trimmed === '') return true;
  if (NON_CHARACTER_TERMS.has(trimmed)) return true;
  if (trimmed.endsWith('们') && NON_CHARACTER_TERMS.has(trimmed.slice(0, -1))) return true;
  for (const prefix of NON_CHARACTER_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      const rest = trimmed.slice(prefix.length).replace(/的$/, '').replace(/们$/, '');
      if (rest === '' || NON_CHARACTER_TERMS.has(rest)) return true;
      for (const root of NON_CHARACTER_ROOTS) {
        if (rest === root || rest.includes(root)) return true;
      }
    }
  }
  if (/^.{0,2}(等人|等角色|等几人)$/.test(trimmed)) return true;
  return false;
}

/**
 * 模糊匹配角色名（与后端 validateReadiness.js 保持一致）
 */
function fuzzyMatchCharacter(queryName: string, characters: CharacterRecord[]): CharacterRecord | undefined {
  const q = queryName.trim();
  const exact = characters.find(c => c.name === q);
  if (exact) return exact;
  const normalize = (s: string) => s.replace(/[\s\u3000·・\-_—–，,。.、！!？?""''「」『』【】（）()《》〈〉]/g, '');
  const qNorm = normalize(q);
  const normMatch = characters.find(c => normalize(c.name) === qNorm);
  if (normMatch) return normMatch;
  const containsMatch = characters.find(c => {
    const cNorm = normalize(c.name);
    return (cNorm.length >= 2 && qNorm.includes(cNorm)) || (qNorm.length >= 2 && cNorm.includes(qNorm));
  });
  if (containsMatch) return containsMatch;
  return undefined;
}

/**
 * 校验角色字段完整性
 */
function validateCharacterFields(character: CharacterRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const requiredFields: { key: keyof CharacterRecord; label: string }[] = [
    { key: 'name', label: '名称' },
    { key: 'description', label: '描述' },
    { key: 'appearance', label: '外貌' },
    { key: 'personality', label: '性格' },
    { key: 'image_url', label: '图片' },
  ];

  for (const { key, label } of requiredFields) {
    if (isEmptyField(character[key])) {
      issues.push({
        type: 'character_field_missing',
        message: `角色「${character.name || '未知'}」缺少${label}`,
        blocking: true,
      });
    }
  }

  return issues;
}

/**
 * 校验影棚字段完整性
 */
function validateStudioFields(studio: StudioRecord, locationName: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!studio.nine_grid_image_url) {
    issues.push({
      type: 'scene_field_missing',
      message: `影棚「${locationName}」缺少九宫组装图，请先到影棚中生成`,
      blocking: true,
    });
  }
  if (isEmptyField(studio.description)) {
    issues.push({
      type: 'scene_field_missing',
      message: `影棚「${locationName}」缺少描述`,
      blocking: true,
    });
  }

  return issues;
}

/**
 * 从后端获取指定项目的角色列表
 */
async function fetchProjectCharacters(projectId: number): Promise<CharacterRecord[]> {
  const token = getAuthToken();
  const res = await fetch(`/api/characters/project/${projectId}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.characters || [];
}

/**
 * 从后端获取指定项目的影棚列表
 */
async function fetchProjectStudios(projectId: number): Promise<StudioRecord[]> {
  const token = getAuthToken();
  const res = await fetch(`/api/studios?projectId=${projectId}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.studios || [];
}

/**
 * 角色最小出场分镜数阈值（与后端 characterFilter.js 保持一致）
 * 只在 ≥ 该数量的分镜中出现的角色才要求生成角色图片/建立关联
 */
const MIN_CHARACTER_APPEARANCE = 2;

/**
 * 前端首尾帧生成预检（通过后端关联表校验）
 * 
 * @param projectId     项目 ID
 * @param characters    镜头涉及的角色名数组
 * @param location      镜头涉及的场景名
 * @param scriptId      可选，剧本 ID
 * @param storyboardId  分镜 ID（用于关联表查询）
 * @param charAppearanceMap 可选，角色出场次数映射（角色名 -> 出场分镜数）
 */
export async function validateFrameReadiness(
  projectId: number,
  characters: string[],
  location: string,
  scriptId?: number,
  storyboardId?: number,
  charAppearanceMap?: Record<string, number>
): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  // 1. 场景必须存在
  if (!location || location.trim() === '') {
    issues.push({
      type: 'no_location',
      message: '该镜头未指定场景：首尾帧生成要求必须提供场景',
      blocking: true,
    });
  }

  // 如果有阻止性问题（例如无场景），直接返回
  const earlyBlocking = issues.filter(i => i.blocking);
  if (earlyBlocking.length > 0) {
    return {
      ready: false,
      issues,
      blockingIssues: earlyBlocking,
      warningIssues: issues.filter(i => !i.blocking),
    };
  }

  // 3. 通过后端关联表校验（优先使用 storyboardId）
  if (storyboardId) {
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/storyboards/${storyboardId}/validate?type=frame`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.ready && data.issues) {
          for (const issue of data.issues) {
            issues.push({
              type: issue.type,
              message: issue.message,
              blocking: true,
            });
          }
        }
        const blockingIssues = issues.filter(i => i.blocking);
        const warningIssues = issues.filter(i => !i.blocking);
        return { ready: blockingIssues.length === 0, issues, blockingIssues, warningIssues };
      }
    } catch (e) {
      console.warn('[validateFrameReadiness] 后端校验失败，降级为本地校验:', e);
    }
  }

  // 4. 降级：无 storyboardId 或后端校验失败时，使用本地名称匹配
  const [allCharacters, allStudios] = await Promise.all([
    fetchProjectCharacters(projectId),
    fetchProjectStudios(projectId),
  ]);

  for (const charName of characters) {
    // 跳过非角色群体词
    if (isNonCharacterEntity(charName)) {
      continue;
    }
    // 跳过出场次数不足的临时角色（防止角色画面崩坏）
    if (charAppearanceMap && (charAppearanceMap[charName] || 0) < MIN_CHARACTER_APPEARANCE) {
      continue;
    }
    // 使用模糊匹配查找角色（容忍名称差异）
    const charRecord = fuzzyMatchCharacter(charName, allCharacters);
    if (!charRecord) {
      issues.push({ type: 'character_not_found', message: `角色不存在：${charName}`, blocking: true });
      continue;
    }

    issues.push(...validateCharacterFields(charRecord));
  }

  if (location && location.trim() !== '') {
    const studioRecord = allStudios.find(s => s.name === location);
    if (!studioRecord) {
      issues.push({ type: 'scene_not_found', message: `影棚不存在：${location}`, blocking: true });
    } else {
      issues.push(...validateStudioFields(studioRecord, location));
    }
  }

  const blockingIssues = issues.filter(i => i.blocking);
  const warningIssues = issues.filter(i => !i.blocking);
  return { ready: blockingIssues.length === 0, issues, blockingIssues, warningIssues };
}

/**
 * 批量帧生成预检：通过单次请求校验所有分镜
 * 
 * @param projectId  项目 ID（保留参数以保持接口兼容）
 * @param scenes     分镜列表（需包含 id, characters 和 location）
 * @param scriptId   剧本 ID
 * @param type       校验类型：'frame' | 'video'，默认 'frame'
 * @returns 汇总的校验结果（去重后的 blocking issues）
 */
export async function validateBatchFrameReadiness(
  projectId: number,
  scenes: { id?: number; characters: string[]; location: string }[],
  scriptId?: number,
  type: 'frame' | 'video' = 'frame'
): Promise<ValidationResult> {
  // 过滤出有 id 的分镜
  const scenesWithId = scenes.filter(s => s.id != null) as { id: number; characters: string[]; location: string }[];
  
  if (scenesWithId.length === 0 || !scriptId) {
    // 无有效分镜或无 scriptId，返回空结果
    return {
      ready: true,
      issues: [],
      blockingIssues: [],
      warningIssues: [],
    };
  }

  try {
    const sceneIds = scenesWithId.map(s => s.id);
    const response = await batchValidateScenes(sceneIds, scriptId, type);
    
    // 汇总所有问题
    const allIssues: ValidationIssue[] = [];
    
    for (const result of response.results) {
      for (const message of result.blockingIssues) {
        allIssues.push({ type: 'blocking', message, blocking: true });
      }
      for (const message of result.warningIssues) {
        allIssues.push({ type: 'warning', message, blocking: false });
      }
    }

    // 去重（同一条 message 只保留一次）
    const seen = new Set<string>();
    const uniqueIssues = allIssues.filter(i => {
      if (seen.has(i.message)) return false;
      seen.add(i.message);
      return true;
    });

    const blockingIssues = uniqueIssues.filter(i => i.blocking);
    const warningIssues = uniqueIssues.filter(i => !i.blocking);

    return {
      ready: blockingIssues.length === 0,
      issues: uniqueIssues,
      blockingIssues,
      warningIssues,
    };
  } catch (e) {
    console.warn('[validateBatchFrameReadiness] 批量校验失败，降级为逐个校验:', e);
    // 降级：逐个校验（原有逻辑）
    return await validateBatchFrameReadinessLegacy(projectId, scenes, scriptId);
  }
}

/**
 * 批量帧生成预检（原有逻辑，作为降级方案）
 */
async function validateBatchFrameReadinessLegacy(
  projectId: number,
  scenes: { id?: number; characters: string[]; location: string }[],
  scriptId?: number
): Promise<ValidationResult> {
  const allIssues: ValidationIssue[] = [];
  const token = getAuthToken();

  // 逐个分镜通过后端关联表校验
  const validationPromises = scenes.map(async (s) => {
    if (!s.id) return; // 无 storyboardId 跳过
    try {
      const res = await fetch(`/api/storyboards/${s.id}/validate?type=frame`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.ready && data.issues) {
          for (const issue of data.issues) {
            allIssues.push({ type: issue.type, message: issue.message, blocking: true });
          }
        }
      }
    } catch (e) {
      console.warn(`[validateBatch] 分镜 ${s.id} 校验失败:`, e);
    }
  });

  await Promise.all(validationPromises);

  // 去重（同一条 message 只保留一次）
  const seen = new Set<string>();
  const uniqueIssues = allIssues.filter(i => {
    if (seen.has(i.message)) return false;
    seen.add(i.message);
    return true;
  });

  const blockingIssues = uniqueIssues.filter(i => i.blocking);
  const warningIssues = uniqueIssues.filter(i => !i.blocking);

  return {
    ready: blockingIssues.length === 0,
    issues: uniqueIssues,
    blockingIssues,
    warningIssues,
  };
}

/**
 * 将校验结果格式化为用户可读的消息
 */
export function formatValidationMessage(result: ValidationResult): string {
  if (result.ready) return '';

  const lines: string[] = [];

  if (result.blockingIssues.length > 0) {
    lines.push('❌ 以下问题必须修复后才能生成：');
    result.blockingIssues.forEach(i => lines.push(`  • ${i.message}`));
  }

  if (result.warningIssues.length > 0) {
    lines.push('⚠️ 以下问题可能影响生成效果：');
    result.warningIssues.forEach(i => lines.push(`  • ${i.message}`));
  }

  return lines.join('\n');
}
