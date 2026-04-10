/**
 * 镜头语言参数徽章组件
 * 以紧凑标签形式展示已设置的镜头参数
 */

import React from 'react';
import {
  ShotLanguage,
  getShotSizeLabel,
  getFocalLengthLabel,
  getCameraDistanceLabel,
} from '../../../types/shotLanguage';

interface ShotLanguageBadgeProps {
  shotLanguage?: ShotLanguage;
  compact?: boolean;
}

const LABEL_MAP: Record<string, Record<string, string>> = {
  cameraHeight: {
    eye_level: '平视', low_angle: '仰拍', high_angle: '俯拍',
    bird_eye: '鸟瞰', worm_eye: '虫视', pov: '主观视角',
    dutch_angle: '荷兰角', over_shoulder: '过肩',
  },
  cameraMovement: {
    static: '固定', push: '推', pull: '拉', pan: '摇',
    tilt: '升降', track: '移', dolly: '跟', zoom: '变焦',
    orbit: '环绕', dolly_zoom: '希区柯克变焦', crane: '升降臂',
    handheld: '手持', steadicam: '稳定器', whip_pan: '甩镜',
  },
  depthOfField: { shallow: '浅景深', medium: '中景深', deep: '深景深' },
  lightingDirection: {
    front: '正面光', side: '侧光', back: '逆光', top: '顶光',
    bottom: '底光', rim: '轮廓光', three_point: '三点布光', natural: '自然光',
  },
  lightingQuality: {
    hard: '硬光', soft: '软光', diffused: '散射光',
    specular: '镜面光', ambient: '环境光', dappled: '斑驳光',
  },
  lightingColor: {
    warm: '暖色调', cool: '冷色调', neutral: '中性',
    golden_hour: '黄金时段', blue_hour: '蓝调', moonlight: '月光',
    neon: '霓虹', mixed: '混合色温',
  },
  lightingIntensity: {
    high_key: '高调', low_key: '低调', high_contrast: '高对比',
    low_contrast: '低对比', silhouette: '剪影',
  },
  lightingSource: {
    natural_daylight: '日光', overcast: '阴天', golden_hour: '黄金时段',
    blue_hour: '蓝调', moonlight: '月光', led: 'LED',
    spotlight: '聚光灯', softbox: '柔光箱', practical: '实用光源',
    mixed: '混合光源',
  },
  compositionRule: {
    rule_of_thirds: '三分法', center: '中心', symmetry: '对称',
    leading_lines: '引导线', frame_in_frame: '框中框',
    frame_within_frame: '框中框', diagonal: '对角线',
    golden_ratio: '黄金分割', negative_space: '负空间', fill_frame: '填满画面',
  },
  axisPosition: { left: '左侧', right: '右侧', on_axis: '轴线上' },
  screenDirection: {
    left_to_right: '左→右', right_to_left: '右→左',
    towards_camera: '朝向镜头', away_from_camera: '远离镜头',
  },
  transitionType: {
    cut: '硬切', fade: '淡入淡出', dissolve: '叠化',
    wipe: '划像', match_cut: '匹配剪辑',
  },
  montageType: {
    narrative: '叙事蒙太奇', expressive: '表现蒙太奇',
    cross_cutting: '交叉蒙太奇', metaphorical: '隐喻蒙太奇',
    accumulative: '积累蒙太奇',
  },
};

function getLabel(field: string, value: string | number | undefined): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (field === 'shotSize') return getShotSizeLabel(value as any) || null;
  if (field === 'focalLength') return getFocalLengthLabel(value as any) || null;
  if (field === 'cameraDistance') return getCameraDistanceLabel(value as any) || null;
  if (field === 'focalLengthMm') return `${value}mm`;
  if (field === 'shotDuration') return `${value}s`;
  if (field === 'focusPoint') return typeof value === 'string' ? value : null;
  if (field === 'povCharacter') return typeof value === 'string' ? `视角:${value}` : null;
  const map = LABEL_MAP[field];
  if (map && typeof value === 'string') return map[value] || value;
  return null;
}

const DISPLAY_FIELDS: (keyof ShotLanguage)[] = [
  'shotSize', 'focalLength', 'focalLengthMm', 'cameraHeight',
  'cameraMovement', 'cameraDistance', 'depthOfField',
  'compositionRule', 'montageType',
  'lightingDirection', 'lightingQuality', 'lightingColor',
  'lightingIntensity', 'lightingSource',
  'axisPosition', 'screenDirection', 'transitionType',
  'shotDuration', 'focusPoint', 'povCharacter',
];

const COMPACT_MAX = 4;

const ShotLanguageBadge: React.FC<ShotLanguageBadgeProps> = ({ shotLanguage, compact = false }) => {
  if (!shotLanguage) return null;

  const badges: { field: string; label: string }[] = [];
  for (const field of DISPLAY_FIELDS) {
    const val = shotLanguage[field];
    const label = getLabel(field, val);
    if (label) badges.push({ field, label });
  }

  if (badges.length === 0) return null;

  const displayBadges = compact ? badges.slice(0, COMPACT_MAX) : badges;
  const hiddenCount = compact ? Math.max(0, badges.length - COMPACT_MAX) : 0;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {displayBadges.map((b) => (
        <span
          key={b.field}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-slate-300 border border-slate-600/30"
        >
          {b.label}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="text-[10px] text-slate-500">+{hiddenCount}</span>
      )}
    </div>
  );
};

export default ShotLanguageBadge;
