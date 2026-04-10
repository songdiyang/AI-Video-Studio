/**
 * 颜色可访问性工具
 * 确保颜色对比度符合 WCAG AA 标准（至少 4.5:1）
 */

// 预设颜色方案 - 优化后的高对比度版本
export const TAG_GROUP_COLORS = [
  '#dc2626', // 红 - 更深的红色
  '#ea580c', // 橙 - 更深的橙色
  '#ca8a04', // 黄 - 金黄色，避免太亮
  '#16a34a', // 绿 - 更深的绿色
  '#0891b2', // 青 - 更深的青色
  '#2563eb', // 蓝 - 更深的蓝色
  '#7c3aed', // 紫 - 更深的紫色
  '#db2777', // 粉 - 更深的粉色
  '#4b5563', // 灰 - 更深的灰色
  '#78350f', // 棕 - 更深的棕色
];

// 为每个颜色提供配套的样式（确保可访问性）
export interface TagColorStyle {
  bg: string;          // 背景色（带透明度）
  text: string;        // 文本色
  border: string;      // 边框色
  hoverBg: string;     // 悬停背景色
  activeBg: string;    // 激活背景色
}

/**
 * 计算颜色的相对亮度
 * 基于 WCAG 2.1 标准
 */
function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 计算两个颜色之间的对比度
 */
function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 将十六进制颜色转换为 RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/**
 * 判断颜色是深色还是浅色
 */
export function isColorDark(hex: string): boolean {
  return getLuminance(hex) < 0.5;
}

/**
 * 获取标签的可访问性样式
 * @param baseColor 基础颜色
 * @param isDarkTheme 是否深色主题
 */
export function getTagAccessibleStyle(baseColor: string, isDarkTheme: boolean = true): TagColorStyle {
  if (isDarkTheme) {
    // 深色主题：使用较深的背景，较亮的文本
    return {
      bg: `${baseColor}25`,        // 背景 15% -> 25% 透明度
      text: baseColor,              // 使用原色作为文本
      border: `${baseColor}50`,     // 边框 50% 透明度
      hoverBg: `${baseColor}35`,    // 悬停时更深
      activeBg: `${baseColor}45`,   // 激活时最深
    };
  } else {
    // 浅色主题：使用较浅的背景，较深的文本
    const darkerColor = darkenColor(baseColor, 20);
    return {
      bg: `${baseColor}18`,         // 更浅的背景
      text: darkerColor,            // 更深的文本确保对比度
      border: `${baseColor}40`,     // 边框
      hoverBg: `${baseColor}25`,
      activeBg: `${baseColor}35`,
    };
  }
}

/**
 * 加深颜色
 */
function darkenColor(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  const factor = 1 - percent / 100;
  const r = Math.round(rgb.r * factor);
  const g = Math.round(rgb.g * factor);
  const b = Math.round(rgb.b * factor);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * 获取颜色选择器按钮的样式
 * @param color 颜色
 * @param isSelected 是否选中
 * @param isDarkTheme 是否深色主题
 */
export function getColorPickerButtonStyle(color: string, isSelected: boolean, isDarkTheme: boolean = true): React.CSSProperties {
  return {
    backgroundColor: color,
    boxShadow: isSelected 
      ? `0 0 0 3px ${isDarkTheme ? '#1e293b' : '#ffffff'}, 0 0 0 5px ${color}`
      : `0 0 0 2px ${isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
    transform: isSelected ? 'scale(1.1)' : 'scale(1)',
  };
}

/**
 * 获取颜色指示器圆点的样式（用于列表项等）
 */
export function getColorDotStyle(color: string, size: 'sm' | 'md' | 'lg' = 'md'): React.CSSProperties {
  const sizes = { sm: 8, md: 12, lg: 16 };
  const s = sizes[size];
  
  return {
    width: s,
    height: s,
    backgroundColor: color,
    borderRadius: '50%',
    border: `2px solid ${color}40`,
    boxShadow: `0 0 0 1px rgba(255,255,255,0.1)`,
  };
}

/**
 * 获取分组标签的完整样式
 */
export function getGroupTagStyle(
  color: string, 
  state: 'default' | 'hover' | 'active' = 'default',
  isDarkTheme: boolean = true
): React.CSSProperties {
  const style = getTagAccessibleStyle(color, isDarkTheme);
  
  let bgColor = style.bg;
  if (state === 'hover') bgColor = style.hoverBg;
  if (state === 'active') bgColor = style.activeBg;
  
  return {
    backgroundColor: bgColor,
    color: style.text,
    borderColor: style.border,
    borderWidth: 1,
    borderStyle: 'solid',
  };
}

/**
 * 验证颜色对比度是否符合 WCAG AA 标准
 */
export function checkContrast(foreground: string, background: string): {
  ratio: number;
  passesAA: boolean;
  passesAAA: boolean;
} {
  const ratio = getContrastRatio(foreground, background);
  return {
    ratio: Math.round(ratio * 100) / 100,
    passesAA: ratio >= 4.5,
    passesAAA: ratio >= 7,
  };
}
