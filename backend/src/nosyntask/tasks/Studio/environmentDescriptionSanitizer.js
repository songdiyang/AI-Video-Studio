/**
 * 环境描述清洗工具
 * 用于从环境描述中剔除角色活动与建筑/人造物信息，只保留纯自然场景描述。
 */

/** 常见建筑/人造物关键词 */
const BUILDING_KEYWORDS = [
  '屋', '房', '室', '厅', '楼', '阁', '桥', '亭', '塔', '殿',
  '榭', '廊', '庙', '堡', '窑', '棚', '舍', '坞', '巢'
];

/**
 * 环境名黑名单：命中这些名字说明是"场景标记词"或"泛化类别词"，不是具体环境，
 * 应当被 isInvalidEnvName 识别并拒绝保存。
 */
const INVALID_ENV_NAME_SET = new Set([
  '内', '外', '内景', '外景', '日', '夜', '日外', '日内', '夜外', '夜内',
  '场景', '地点', '环境', '未知', '无',
  '自然场景', '自然景观', '自然风光', '自然', '景观', '风光', '背景',
  '正在处理', '待定', 'undefined', 'null'
]);

/** 常见角色动作 + 动物主语模式 + 动物身体部位 */
const ROLE_ACTION_PATTERNS = [
  /[^，。,.;；]*(?:沿着|站在|坐在|躺在|走在|走过|跑向|跑过|看向|望着|盯着|瞧见|看到|看见|跳着|蹦着|蹦蹦跳跳|转身|回头|抬头|低头|蹲下|趴下|伸手|指着|抱着|拉着|推着|背着|踩过|踏上|路过|穿过|停下|停在|靠在|挨着|搭在|搭着|摆着|挥舞|掀起|翻起)[^，。,.;；]*[，。,.;；]?/g,
  /[^，。,.;；]*(?:小熊|小兔|小猫|小狗|小狐狸|小刺猬|小鹿|小松鼠|小猴子|小熊猫|小老鼠|小鸟|鸟儿|蝴蝶|蜻蜓|主角|孩子|少女|少年|老人|男孩|女孩|男人|女人|他|她|它|咱|咱们|我们|他们|她们)[^，。,.;；]*[，。,.;；]?/g,
  // 第一人称/自指：自己、我的
  /[^，。,.;；]*(?:自己的?|我的)[^，。,.;；]*[，。,.;；]?/g,
  // 动物身体部位与拟人化特征：爪子、尾巴、毛茸茸、胡须、翅膀等
  /[^，。,.;；]*(?:爪子|小爪子|爪尖|脚丫|脚掌|肉垫|尾巴|尾尖|耳朵|耳尖|鼻尖|鼻头|胡须|胡子|毛茸茸|毛绒绒|毛绒|绒毛|茸毛|翅膀|肚皮|肚子|小身子|身子|嘴巴|嘴角|脸颊|小手|小脚|双手|双脚|头顶|胸口|背脊)[^，。,.;；]*[，。,.;；]?/g,
];

/** 从环境名中剔除建筑名和连接词 */
function sanitizeEnvName(name, buildingNames = []) {
  let result = String(name || '').trim();
  result = result.replace(/[_\-]?环境$/g, '').trim();
  for (const bName of buildingNames) {
    if (bName && result.includes(bName)) {
      result = result.replace(new RegExp(bName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '').trim();
    }
  }
  for (const kw of BUILDING_KEYWORDS) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), '').trim();
  }
  result = result
    .replace(/^[前後后旁侧边上边下边里外边]+/g, '')
    .replace(/[前後后旁侧边上边下边里外边]+$/g, '')
    .trim();
  result = result
    .replace(/^[木石砖瓦铁钢]+/g, '')
    .replace(/[木石砖瓦铁钢]+$/g, '')
    .trim();
  result = result.replace(/[_\-]+/g, '').replace(/\s+/g, '').trim();
  return result || '自然场景';
}

/**
 * 判定环境名是否无效（应该被拒绝保存的）。
 * 命中场景标记词、类别泛称、过短（≤1 字）、空白、纯数字等情况均视为无效。
 * 注意：sanitizeEnvName 的兜底值 "自然场景" 也被判定为无效，避免污染数据。
 */
function isInvalidEnvName(name) {
  const s = String(name || '').trim();
  if (!s) return true;
  if (s.length <= 1) return true; // "内"、"外"这种单字
  if (/^[0-9]+$/.test(s)) return true;
  if (INVALID_ENV_NAME_SET.has(s)) return true;
  return false;
}

/** 清洗环境描述：去建筑、去角色、去动物身体部位 */
function sanitizeEnvDescription(description, buildingNames = []) {
  let result = String(description || '').trim();
  if (!result) return '';

  // 去掉包含建筑名的片段
  for (const bName of buildingNames) {
    if (!bName) continue;
    const escaped = bName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`[^，。,.;；]*${escaped}[^，。,.;；]*[，。,.;；]?`, 'g'), '');
  }
  // 去掉角色/动作/动物身体部位相关片段
  for (const pattern of ROLE_ACTION_PATTERNS) {
    result = result.replace(pattern, '');
  }
  // 清理残留标点与空白
  result = result
    .replace(/[，。,.;；]{2,}/g, '，')
    .replace(/^[，。,.;；\s]+|[，。,.;；\s]+$/g, '')
    .replace(/\s+/g, '')
    .trim();
  // 以句号收尾
  if (result && !/[。.]$/.test(result)) result += '。';
  return result;
}

module.exports = {
  sanitizeEnvName,
  sanitizeEnvDescription,
  isInvalidEnvName,
  INVALID_ENV_NAME_SET,
  BUILDING_KEYWORDS,
  ROLE_ACTION_PATTERNS,
};
