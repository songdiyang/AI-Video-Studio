/**
 * 提示词构建器
 * 将积木块转换为自然语言提示词
 */

import {
  Block,
  BlockType,
  BlockData,
  GeneratedPrompt,
} from '../types/blockTypes';
import { BLOCK_OPTIONS, getBlockDefinition } from './blockRegistry';

// ============ 提示词模板 ============

const PROMPT_TEMPLATES: Record<BlockType, (data: BlockData) => string> = {
  text: (data) => (data as { text: string }).text || '',

  shot_size: (data) => {
    const { value } = data as { value: string };
    const option = BLOCK_OPTIONS.shotSize.find(opt => opt.value === value);
    return option ? `${option.label}镜头` : '';
  },

  camera_angle: (data) => {
    const { value } = data as { value: string };
    const option = BLOCK_OPTIONS.cameraAngle.find(opt => opt.value === value);
    return option ? `${option.label}视角` : '';
  },

  movement: (data) => {
    const { value } = data as { value: string };
    const option = BLOCK_OPTIONS.movement.find(opt => opt.value === value);
    if (value === 'static') return '镜头固定';
    return option ? `镜头${option.label}` : '';
  },

  lens_type: (data) => {
    const { value } = data as { value: string };
    const option = BLOCK_OPTIONS.lensType.find(opt => opt.value === value);
    return option ? `使用${option.label}镜头` : '';
  },

  depth_of_field: (data) => {
    const { value } = data as { value: string };
    const option = BLOCK_OPTIONS.depthOfField.find(opt => opt.value === value);
    return option ? `${option.label}效果` : '';
  },

  lighting_mood: (data) => {
    const { value } = data as { value: string };
    const option = BLOCK_OPTIONS.lightingMood.find(opt => opt.value === value);
    return option ? `${option.label}光影` : '';
  },

  character: (data) => {
    const { characterName } = data as { characterName: string };
    return characterName ? `角色「${characterName}」` : '';
  },

  character_attr: (data) => {
    const { expression, action } = data as { expression: string; action: string };
    const parts: string[] = [];
    if (expression) parts.push(`表情${expression}`);
    if (action) parts.push(action);
    return parts.join('，');
  },

  character_pos: (data) => {
    const { horizontal, vertical } = data as { horizontal: string; vertical: string };
    const hOption = BLOCK_OPTIONS.characterPosition.find(opt => opt.value === horizontal);
    const vOption = BLOCK_OPTIONS.verticalPosition.find(opt => opt.value === vertical);
    return `位于画面${hOption?.label || ''}${vOption?.label || ''}`;
  },

  scene: (data) => {
    const { sceneName } = data as { sceneName: string };
    return sceneName ? `在${sceneName}场景中` : '';
  },

  environment: (data) => {
    const { lighting, atmosphere } = data as { lighting: string; atmosphere: string };
    const lOption = BLOCK_OPTIONS.lighting.find(opt => opt.value === lighting);
    const aOption = BLOCK_OPTIONS.atmosphere.find(opt => opt.value === atmosphere);
    const parts: string[] = [];
    if (lOption) parts.push(lOption.label);
    if (aOption) parts.push(aOption.label);
    return parts.length > 0 ? `${parts.join('，')}的环境` : '';
  },

  action: (data) => {
    const { type, customType } = data as { type: string; customType?: string };
    if (type === 'custom' && customType) {
      return customType;
    }
    const option = BLOCK_OPTIONS.actionType.find(opt => opt.value === type);
    return option ? option.label : '';
  },

  duration: (data) => {
    const { seconds } = data as { seconds: number };
    return `持续${seconds}秒`;
  },

  effect: (data) => {
    const { visual, sound, particle } = data as { visual: boolean; sound: boolean; particle?: string };
    const parts: string[] = [];
    if (visual) parts.push('视觉特效');
    if (sound) parts.push('音效');
    if (particle) parts.push(particle);
    return parts.length > 0 ? `带有${parts.join('、')}` : '';
  },
};

// ============ 积木块优先级 ============

const BLOCK_PRIORITY: Record<BlockType, number> = {
  text: 0,
  scene: 1,
  environment: 2,
  character: 3,
  character_pos: 4,
  character_attr: 5,
  action: 6,
  duration: 7,
  effect: 8,
  shot_size: 9,
  camera_angle: 10,
  lens_type: 11,
  depth_of_field: 12,
  lighting_mood: 13,
  movement: 14,
};

// ============ 提示词构建器类 ============

export class PromptBuilder {
  private blocks: Block[];

  constructor(blocks: Block[]) {
    this.blocks = blocks;
  }

  /**
   * 构建提示词
   */
  build(): GeneratedPrompt {
    // 按优先级排序
    const sortedBlocks = [...this.blocks].sort(
      (a, b) => BLOCK_PRIORITY[a.type] - BLOCK_PRIORITY[b.type]
    );

    // 生成文本片段
    const fragments: string[] = [];
    const metadata = {
      shotLanguage: {} as Record<string, unknown>,
      characters: [] as number[],
      scenes: [] as number[],
      duration: 3,
    };

    for (const block of sortedBlocks) {
      const text = this.buildBlockText(block);
      if (text) {
        fragments.push(text);
      }

      // 收集元数据
      this.collectMetadata(block, metadata);
    }

    // 合并文本
    const text = this.mergeFragments(fragments);

    return {
      text,
      blocks: sortedBlocks,
      metadata,
    };
  }

  /**
   * 构建单个积木块的文本
   */
  private buildBlockText(block: Block): string {
    const template = PROMPT_TEMPLATES[block.type];
    if (!template) return '';

    try {
      return template(block.data);
    } catch (error) {
      console.error(`[PromptBuilder] Error building text for block ${block.type}:`, error);
      return '';
    }
  }

  /**
   * 收集元数据
   */
  private collectMetadata(
    block: Block,
    metadata: { shotLanguage: Record<string, unknown>; characters: number[]; scenes: number[]; duration: number }
  ): void {
    // 收集镜头语言参数
    const shotLanguageKeys: BlockType[] = [
      'shot_size',
      'camera_angle',
      'movement',
      'lens_type',
      'depth_of_field',
      'lighting_mood',
    ];

    if (shotLanguageKeys.includes(block.type)) {
      const key = block.type.replace('_', '');
      metadata.shotLanguage[key] = (block.data as { value: string }).value;
    }

    // 收集角色
    if (block.type === 'character') {
      const { characterId } = block.data as { characterId: number };
      if (characterId && !metadata.characters.includes(characterId)) {
        metadata.characters.push(characterId);
      }
    }

    // 收集场景
    if (block.type === 'scene') {
      const { sceneId } = block.data as { sceneId: number };
      if (sceneId && !metadata.scenes.includes(sceneId)) {
        metadata.scenes.push(sceneId);
      }
    }

    // 收集时长
    if (block.type === 'duration') {
      metadata.duration = (block.data as { seconds: number }).seconds;
    }
  }

  /**
   * 合并文本片段
   */
  private mergeFragments(fragments: string[]): string {
    // 过滤空字符串
    const validFragments = fragments.filter(f => f.trim());

    if (validFragments.length === 0) {
      return '';
    }

    // 按类别分组
    const groups: Record<string, string[]> = {
      scene: [],
      character: [],
      action: [],
      shot: [],
      other: [],
    };

    for (const fragment of validFragments) {
      if (fragment.includes('场景')) {
        groups.scene.push(fragment);
      } else if (fragment.includes('角色') || fragment.includes('位于') || fragment.includes('表情')) {
        groups.character.push(fragment);
      } else if (fragment.includes('镜头') || fragment.includes('视角') || fragment.includes('效果')) {
        groups.shot.push(fragment);
      } else if (fragment.includes('持续') || fragment.includes('带有')) {
        groups.action.push(fragment);
      } else {
        groups.other.push(fragment);
      }
    }

    // 按顺序组合
    const orderedParts: string[] = [];

    // 场景描述
    if (groups.scene.length > 0) {
      orderedParts.push(groups.scene.join('，'));
    }

    // 角色描述
    if (groups.character.length > 0) {
      orderedParts.push(groups.character.join('，'));
    }

    // 动作描述
    if (groups.action.length > 0) {
      orderedParts.push(groups.action.join('，'));
    }

    // 镜头描述
    if (groups.shot.length > 0) {
      orderedParts.push(groups.shot.join('，'));
    }

    // 其他文本
    if (groups.other.length > 0) {
      orderedParts.push(groups.other.join('，'));
    }

    return orderedParts.join('。');
  }
}

// ============ 便捷函数 ============

/**
 * 从积木块数组生成提示词
 */
export function generatePrompt(blocks: Block[]): GeneratedPrompt {
  const builder = new PromptBuilder(blocks);
  return builder.build();
}

/**
 * 仅生成文本
 */
export function generatePromptText(blocks: Block[]): string {
  return generatePrompt(blocks).text;
}

/**
 * 预览提示词（截断）
 */
export function previewPrompt(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
