/**
 * 角色设定图合成工具
 * 
 * 将角色三视图（正面、侧面、背面）与角色描述信息合成为一张完整的角色设定图。
 * 使用 sharp 进行图片合成，文字通过 SVG 渲染。
 * 
 * 布局：
 * +-----------------------------------------------+
 * |              角色名称 (大标题)                   |
 * +-----------------------------------------------+
 * |   [正面图]    |   [侧面图]    |   [背面图]      |
 * |   FRONT       |   SIDE        |   BACK         |
 * +-----------------------------------------------+
 * |  外貌: xxx                                     |
 * |  性格: xxx                                     |
 * |  描述: xxx                                     |
 * +-----------------------------------------------+
 */

const sharp = require('sharp');
const { smartDownload } = require('./fileStorage');

// ========== 常量配置 ==========

const CANVAS_WIDTH = 2400;
const VIEW_HEIGHT = 900;           // 三视图区域高度
const PADDING = 60;                // 外边距
const GAP = 30;                    // 图片间距
const HEADER_HEIGHT = 120;         // 标题区域高度
const VIEW_LABEL_HEIGHT = 50;      // 视图标签高度
const INFO_LINE_HEIGHT = 44;       // 信息行高
const INFO_MAX_LINES_PER_FIELD = 4;// 每个字段最大行数
const MAX_CHARS_PER_LINE = 48;     // 每行最大字符数（中文约24个）

// 颜色方案 - 深色主题
const COLORS = {
  background: '#0f172a',           // slate-900
  headerBg: '#1e293b',             // slate-800
  cardBg: '#1e293b',               // 卡片背景
  viewLabelBg: '#334155',          // 视图标签背景
  infoBg: '#1e293b',               // 信息区背景
  border: '#334155',               // 边框
  title: '#f1f5f9',                // 标题文字
  label: '#94a3b8',                // 标签文字
  value: '#e2e8f0',                // 内容文字
  viewLabel: '#cbd5e1',            // 视图标签文字
  accent: '#3b82f6',               // 强调色
};

/**
 * 将文字按最大字符宽度换行
 * 中文字符算2个宽度，英文算1个
 */
function wrapText(text, maxWidth) {
  if (!text) return [''];
  const lines = [];
  let currentLine = '';
  let currentWidth = 0;

  for (const char of text) {
    const charWidth = /[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(char) ? 2 : 1;
    if (currentWidth + charWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = char;
      currentWidth = charWidth;
    } else {
      currentLine += char;
      currentWidth += charWidth;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

/**
 * XML 转义
 */
function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 计算信息区域所需高度
 */
function calculateInfoHeight(fields) {
  let totalLines = 0;
  for (const { value } of fields) {
    const lines = wrapText(value || '', MAX_CHARS_PER_LINE);
    totalLines += Math.min(lines.length, INFO_MAX_LINES_PER_FIELD);
  }
  return totalLines * INFO_LINE_HEIGHT + PADDING * 2 + (fields.length - 1) * 16;
}

/**
 * 生成信息区域的 SVG
 */
function generateInfoSvg(fields, width, height) {
  let y = PADDING;
  let svgContent = '';

  for (const { label, value } of fields) {
    const lines = wrapText(value || '无', MAX_CHARS_PER_LINE);
    const displayLines = lines.slice(0, INFO_MAX_LINES_PER_FIELD);

    // 标签
    svgContent += `<text x="${PADDING}" y="${y + 28}" font-family="'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif" font-size="24" font-weight="bold" fill="${COLORS.label}">${escapeXml(label)}</text>`;

    // 内容
    for (let i = 0; i < displayLines.length; i++) {
      const lineY = y + 28 + (i + 1) * INFO_LINE_HEIGHT * 0.85;
      let lineText = displayLines[i];
      if (i === displayLines.length - 1 && lines.length > INFO_MAX_LINES_PER_FIELD) {
        lineText += '...';
      }
      svgContent += `<text x="${PADDING + 120}" y="${lineY}" font-family="'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif" font-size="22" fill="${COLORS.value}">${escapeXml(lineText)}</text>`;
    }

    y += Math.max(displayLines.length, 1) * INFO_LINE_HEIGHT * 0.85 + INFO_LINE_HEIGHT + 8;
  }

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${COLORS.infoBg}" rx="12"/>
    ${svgContent}
  </svg>`;
}

/**
 * 生成标题区域的 SVG
 */
function generateHeaderSvg(characterName, width) {
  const name = escapeXml(characterName || '未命名角色');
  return `<svg width="${width}" height="${HEADER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${HEADER_HEIGHT}" fill="${COLORS.headerBg}" rx="12"/>
    <line x1="${PADDING}" y1="${HEADER_HEIGHT - 2}" x2="${width - PADDING}" y2="${HEADER_HEIGHT - 2}" stroke="${COLORS.accent}" stroke-width="3" stroke-opacity="0.6"/>
    <text x="${width / 2}" y="${HEADER_HEIGHT / 2 + 12}" font-family="'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif" font-size="42" font-weight="bold" fill="${COLORS.title}" text-anchor="middle">${name}</text>
    <text x="${width / 2}" y="${HEADER_HEIGHT / 2 - 20}" font-family="'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif" font-size="16" fill="${COLORS.label}" text-anchor="middle" letter-spacing="4">CHARACTER DESIGN SHEET</text>
  </svg>`;
}

/**
 * 生成视图标签的 SVG
 */
function generateViewLabelSvg(label, width) {
  return `<svg width="${width}" height="${VIEW_LABEL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${VIEW_LABEL_HEIGHT}" fill="${COLORS.viewLabelBg}" rx="0"/>
    <text x="${width / 2}" y="${VIEW_LABEL_HEIGHT / 2 + 7}" font-family="'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif" font-size="20" font-weight="bold" fill="${COLORS.viewLabel}" text-anchor="middle">${escapeXml(label)}</text>
  </svg>`;
}

/**
 * 下载图片并转为 sharp 可处理的 Buffer
 */
async function downloadImageBuffer(url) {
  if (!url) return null;
  try {
    const result = await smartDownload(url);
    return result.buffer;
  } catch (err) {
    console.error(`[ComposeSheet] 下载图片失败: ${url.substring(0, 80)}...`, err.message);
    return null;
  }
}

/**
 * 生成占位图 SVG（当某个视图缺失时）
 */
function generatePlaceholderSvg(width, height, label) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="${COLORS.cardBg}"/>
    <line x1="0" y1="0" x2="${width}" y2="${height}" stroke="${COLORS.border}" stroke-width="1" stroke-opacity="0.3"/>
    <line x1="${width}" y1="0" x2="0" y2="${height}" stroke="${COLORS.border}" stroke-width="1" stroke-opacity="0.3"/>
    <text x="${width / 2}" y="${height / 2 + 8}" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif" font-size="24" fill="${COLORS.label}" text-anchor="middle">${escapeXml(label || '暂无')}</text>
  </svg>`);
}

/**
 * 合成角色设定图
 * 
 * @param {object} params
 * @param {string} params.frontViewUrl   - 正面视图 URL
 * @param {string} params.sideViewUrl    - 侧面视图 URL
 * @param {string} params.backViewUrl    - 背面视图 URL
 * @param {string} params.characterName  - 角色名称
 * @param {string} params.appearance     - 外貌描述
 * @param {string} params.personality    - 性格描述
 * @param {string} params.description    - 角色描述
 * @param {string} params.style          - 风格
 * @returns {Promise<Buffer>} PNG 图片 Buffer
 */
async function composeCharacterSheet({
  frontViewUrl,
  sideViewUrl,
  backViewUrl,
  characterName,
  appearance,
  personality,
  description,
  style
}) {
  console.log('[ComposeSheet] 开始合成角色设定图:', characterName);

  // 1. 并行下载三张视图
  const [frontBuf, sideBuf, backBuf] = await Promise.all([
    downloadImageBuffer(frontViewUrl),
    downloadImageBuffer(sideViewUrl),
    downloadImageBuffer(backViewUrl),
  ]);

  console.log('[ComposeSheet] 图片下载完成:', {
    front: frontBuf ? `${(frontBuf.length / 1024).toFixed(0)}KB` : '缺失',
    side: sideBuf ? `${(sideBuf.length / 1024).toFixed(0)}KB` : '缺失',
    back: backBuf ? `${(backBuf.length / 1024).toFixed(0)}KB` : '缺失',
  });

  // 2. 计算布局尺寸
  const contentWidth = CANVAS_WIDTH - PADDING * 2;
  const viewWidth = Math.floor((contentWidth - GAP * 2) / 3);
  const viewImageHeight = VIEW_HEIGHT - VIEW_LABEL_HEIGHT;

  // 3. 处理三张图片 - 统一缩放到固定尺寸
  async function processViewImage(buffer, placeholderLabel) {
    if (buffer) {
      return sharp(buffer)
        .resize(viewWidth, viewImageHeight, { fit: 'contain', background: COLORS.cardBg })
        .png()
        .toBuffer();
    }
    // 生成占位图
    return sharp(generatePlaceholderSvg(viewWidth, viewImageHeight, placeholderLabel))
      .png()
      .toBuffer();
  }

  const [frontImg, sideImg, backImg] = await Promise.all([
    processViewImage(frontBuf, '正面 - 暂无'),
    processViewImage(sideBuf, '侧面 - 暂无'),
    processViewImage(backBuf, '背面 - 暂无'),
  ]);

  // 4. 生成视图标签
  const [frontLabel, sideLabel, backLabel] = await Promise.all([
    sharp(Buffer.from(generateViewLabelSvg('FRONT / 正面', viewWidth))).png().toBuffer(),
    sharp(Buffer.from(generateViewLabelSvg('SIDE / 侧面', viewWidth))).png().toBuffer(),
    sharp(Buffer.from(generateViewLabelSvg('BACK / 背面', viewWidth))).png().toBuffer(),
  ]);

  // 5. 计算信息区域
  const infoFields = [];
  if (appearance) infoFields.push({ label: '外貌', value: appearance });
  if (personality) infoFields.push({ label: '性格', value: personality });
  if (description) infoFields.push({ label: '描述', value: description });
  if (style) infoFields.push({ label: '风格', value: style });

  const infoHeight = infoFields.length > 0 ? calculateInfoHeight(infoFields) : 0;
  const infoSvg = infoFields.length > 0 ? generateInfoSvg(infoFields, contentWidth, infoHeight) : null;

  let infoImg = null;
  if (infoSvg) {
    infoImg = await sharp(Buffer.from(infoSvg)).png().toBuffer();
  }

  // 6. 生成标题
  const headerSvg = generateHeaderSvg(characterName, contentWidth);
  const headerImg = await sharp(Buffer.from(headerSvg)).png().toBuffer();

  // 7. 计算总画布高度
  const totalHeight = PADDING
    + HEADER_HEIGHT          // 标题
    + GAP                    // 间距
    + VIEW_HEIGHT            // 三视图 (图片 + 标签)
    + (infoHeight > 0 ? GAP + infoHeight : 0)  // 信息区
    + PADDING;               // 底部边距

  // 8. 合成
  const compositeInputs = [];
  const viewsTop = PADDING + HEADER_HEIGHT + GAP;

  // 标题
  compositeInputs.push({ input: headerImg, top: PADDING, left: PADDING });

  // 三视图图片
  compositeInputs.push({ input: frontImg, top: viewsTop, left: PADDING });
  compositeInputs.push({ input: sideImg, top: viewsTop, left: PADDING + viewWidth + GAP });
  compositeInputs.push({ input: backImg, top: viewsTop, left: PADDING + (viewWidth + GAP) * 2 });

  // 视图标签
  const labelTop = viewsTop + viewImageHeight;
  compositeInputs.push({ input: frontLabel, top: labelTop, left: PADDING });
  compositeInputs.push({ input: sideLabel, top: labelTop, left: PADDING + viewWidth + GAP });
  compositeInputs.push({ input: backLabel, top: labelTop, left: PADDING + (viewWidth + GAP) * 2 });

  // 信息区
  if (infoImg) {
    const infoTop = viewsTop + VIEW_HEIGHT + GAP;
    compositeInputs.push({ input: infoImg, top: infoTop, left: PADDING });
  }

  const result = await sharp({
    create: {
      width: CANVAS_WIDTH,
      height: totalHeight,
      channels: 4,
      background: COLORS.background,
    }
  })
    .composite(compositeInputs)
    .png({ quality: 90, compressionLevel: 6 })
    .toBuffer();

  console.log(`[ComposeSheet] 角色设定图合成完成: ${(result.length / 1024).toFixed(0)}KB, ${CANVAS_WIDTH}x${totalHeight}`);
  return result;
}

module.exports = composeCharacterSheet;
