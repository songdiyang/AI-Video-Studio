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
  // 古代兵种/军队集体词（常被 AI 识别为"角色"误入 characters 数组）
  '边军', '禁军', '禁卫军', '御林军', '羽林军', '虎贲军', '乡兵', '县兵',
  '轻骑', '铁骑', '骑兵', '步卒', '步兵', '弓兵', '弓手', '弩兵',
  '甲士', '甲兵', '兵卒', '军卒', '军士', '兵丁', '官兵', '戍卒',
  '府兵', '州兵', '边卒', '水军', '水师', '水卒', '虎贲', '羽林',
  '亲卫', '禁卫', '家丁', '门客', '衙役', '捕快', '镇军',
  '汉军', '唐军', '宋军', '明军', '清军', '秦军', '楚军', '魏军', '蜀军', '吴军',
  '僧人', '僧侣', '道士', '和尚',
  '乘客', '旅人', '客人', '宾客', '来宾',
  '工人', '农民', '渔民', '猎人',
  '顾客', '买家', '卖家', '食客', '住客', '房客', '租客', '访客',
  // 校园/社会泛称
  '同学们', '学生们', '老师们', '孩子们', '小朋友', '少年们',
  '记者', '警察', '医生', '护士',
  // 其他泛称
  '大人', '小孩', '老人', '少女', '少年', '青年', '中年人', '老年人',
  '男人', '女人', '男子', '女子', '男孩', '女孩',
  '众人们', '其他人', '周围的人', '附近的人', '身边的人',
  'NPC', 'npc', '龙套', '配角们', '路人甲', '路人乙',
  // 复合泛称
  '少年少女', '其他少年少女', '其他人物', '其他角色', '其他同学',
  '一群人', '几个人', '数人', '若干人',
  '男女', '老少', '老幼', '男女老少',
]);

// 模式匹配前缀：以这些词开头 + 泛称词 → 视为非角色
const NON_CHARACTER_PREFIXES = ['其他', '其余', '另外', '别的', '一些', '几个', '几名', '一群', '数个', '数名', '若干', '部分', '剩余', '周围'];

// 模式匹配后缀：泛称词根（去掉"们"后的词根 + 额外词根）
const NON_CHARACTER_ROOTS = [
  '少年', '少女', '青年', '小孩', '孩子', '男孩', '女孩', '男子', '女子',
  '人物', '角色', '同学', '学生', '老师', '路人', '村民', '居民', '市民',
  '士兵', '卫兵', '侍卫', '侍女', '仆人', '随从', '守卫',
  '商贩', '小贩', '摊贩', '店员', '伙计',
  // 古代兵种词根（配合"们"/"一群"等前后缀匹配，如"汉军们"、"一群边军"）
  '边军', '禁军', '御林军', '羽林军', '乡兵', '县兵', '轻骑', '铁骑',
  '骑兵', '步卒', '步兵', '弓兵', '甲士', '兵卒', '军卒', '军士', '兵丁',
  '官兵', '戍卒', '府兵', '州兵', '边卒', '水军', '亲卫', '禁卫', '家丁',
  '门客', '衙役', '捕快', '汉军', '唐军', '宋军', '明军', '清军',
  '僧人', '僧侣', '道士', '和尚',
  '乘客', '旅人', '客人', '宾客', '来宾', '游客', '旅客', '访客',
  '工人', '农民', '渔民', '猎人',
  '顾客', '买家', '卖家', '食客', '住客', '房客', '租客',
  '记者', '警察', '医生', '护士',
  '少年少女', '男女', '人', '人们', '群众', '百姓', '民众',
  '老人', '大人', '小孩', '行人', '观众', '过客',
];

// 军队/兵种结尾词根：只要角色名以这些词结尾，即视为集体军队单位
// （如"西汉边军"、"大唐铁骑"、"秦朝禁军"）
// 注意：这些词根必须足够"硬"，单字词（如"兵"、"军"）不要加入，以免误伤具名角色
const MILITARY_GROUP_ROOTS = [
  '边军', '禁军', '御林军', '羽林军', '虎贲军', '禁卫军',
  '乡兵', '县兵', '民兵', '府兵', '州兵', '边卒', '戍卒',
  '轻骑', '铁骑', '重骑', '骑兵', '步兵', '步卒', '弓兵', '弓手', '弩兵',
  '甲士', '甲兵', '兵卒', '军卒', '军士', '兵丁', '官兵',
  '亲卫', '禁卫', '家丁', '门客', '衙役', '捕快',
  '水军', '水师', '水卒', '虎贲', '羽林',
  '汉军', '唐军', '宋军', '明军', '清军', '秦军', '楚军', '魏军', '蜀军', '吴军',
];

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
  // 军队/兵种词根结尾匹配（如"西汉边军"、"大唐铁骑"、"秦朝禁军"）
  // 不要求"们"后缀，因为军队词根本身即表示集体
  for (const root of MILITARY_GROUP_ROOTS) {
    if (trimmed.endsWith(root)) return true;
  }
  // 去掉"们"后缀再匹配（如"市民们"→"市民"）
  const withoutMen = trimmed.endsWith('们') ? trimmed.slice(0, -1) : null;
  if (withoutMen && NON_CHARACTER_TERMS.has(withoutMen)) return true;
  // "们"结尾 + 以已知群体词根结尾 → 群体角色（如"酒肆顾客们" → 词根"顾客"）
  if (withoutMen) {
    for (const root of NON_CHARACTER_ROOTS) {
      if (withoutMen.endsWith(root) && withoutMen.length > root.length) return true;
    }
  }
  // 模式匹配：前缀 + 泛称词根（如"其他少年少女"、"一群士兵"、"几个学生"）
  for (const prefix of NON_CHARACTER_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      const rest = trimmed.slice(prefix.length).replace(/的$/, '').replace(/们$/, '');
      if (rest === '' || NON_CHARACTER_TERMS.has(rest)) return true;
      for (const root of NON_CHARACTER_ROOTS) {
        if (rest === root || rest.includes(root)) return true;
      }
    }
  }
  // 包含"等人"/"等角色"后缀的泛称（如"零等人"不匹配，但"少年等人"匹配）
  if (/^.{0,2}(等人|等角色|等几人)$/.test(trimmed)) return true;
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
  /**
   * 角色最小出场分镜数阈值
   * 只在 ≥ 该数量的分镜中出现的角色才要求生成角色图片/建立关联
   * 出场次数低于此值的角色被视为"临时角色"，跳过验证以防角色画面崩坏
   */
  MIN_CHARACTER_APPEARANCE: 2,
};
