/**
 * 非角色群体词过滤工具
 * 
 * AI 生成分镜时可能将泛称群体（如"人群"、"路人"等）放入 characters 数组，
 * 但这些不是具体角色，无法建立角色关联，会导致验证失败。
 * 本模块提供统一的过滤函数，供分镜生成后处理和验证环节共同使用。
 */

// 非角色群体词 / 泛称集合
const NON_CHARACTER_TERMS = new Set([
  // 泛称人群
  '人群', '路人', '群众', '众人', '行人', '观众', '围观者', '人们',
  '群演', '背景人物', '旁人', '陌生人', '过客', '游客', '旅客',
  // 集体称谓
  '村民', '居民', '市民', '百姓', '民众', '平民',
  '士兵', '卫兵', '侍卫', '侍女', '仆人', '随从', '下人', '杂兵', '守卫',
  '商贩', '小贩', '摊贩', '店员', '伙计',
  '僧人', '僧侣', '道士', '和尚',
  '乘客', '旅人', '客人', '宾客', '来宾',
  '工人', '农民', '渔民', '猎人',
  // 校园/社会泛称
  '同学们', '学生们', '老师们', '孩子们', '小朋友', '少年们',
  '记者', '警察', '医生', '护士',
  // 其他泛称
  '大人', '小孩', '老人', '少女', '少年', '青年', '中年人', '老年人',
  '男人', '女人', '男子', '女子', '男孩', '女孩',
  '众人们', '其他人', '周围的人', '附近的人', '身边的人',
  'NPC', 'npc', '龙套', '配角们', '路人甲', '路人乙',
]);

/**
 * 判断一个名称是否为非角色群体词
 * @param {string} name - 角色名称
 * @returns {boolean} true 表示不是具体角色（应跳过）
 */
function isNonCharacterEntity(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (trimmed === '') return true;
  // 精确匹配
  if (NON_CHARACTER_TERMS.has(trimmed)) return true;
  // 去掉“们”后缀再匹配（如“市民们”→“市民”）
  if (trimmed.endsWith('们') && NON_CHARACTER_TERMS.has(trimmed.slice(0, -1))) return true;
  return false;
}

/**
 * 从角色名数组中过滤掉非角色群体词
 * @param {string[]} characters - 角色名数组
 * @returns {string[]} 过滤后的角色名数组
 */
function filterNonCharacters(characters) {
  if (!Array.isArray(characters)) return [];
  const filtered = characters.filter(name => !isNonCharacterEntity(name));
  const removed = characters.filter(name => isNonCharacterEntity(name));
  if (removed.length > 0) {
    console.log('[CharacterFilter] 过滤非角色群体词:', removed);
  }
  return filtered;
}

module.exports = {
  isNonCharacterEntity,
  filterNonCharacters,
  NON_CHARACTER_TERMS,
};
