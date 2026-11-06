// 写手人格风格层（writerStyle）
// ──────────────────────────────────────────────────────────────
// 目的：去掉剧本里的"模型腔"。做法是先按题材适配度选一位代笔写手（已故文学大师的
// 手法卡），再把写手人格注入剧本生成 / 润色 / 分析 / 分镜台词四条链路。
//
// 分层原则：
//  - 文风层（写手卡）只影响笔调，不决定结构；
//  - 格式层（FORMAT_GUARD）是硬约束，来源是既有解析契约：
//    · views/StoryBoard/ScriptOutlinePanel.tsx 的 sceneHeadingRe / dialogueRe（大纲面板）
//    · services/localStoryboards.ts SPLIT_SYSTEM 的台词硬规则（分镜拆分）
//    违反格式层的文学腔会让大纲面板解析退化为整篇散文、并让分镜台词校验失败，
//    因此格式层永远压过文风层。
//  - 合规：只描述手法，不复刻原作段落；只使用已故作家姓名。
//
// 本模块零依赖：纯数据 + 纯函数，模型调用通过注入 chat 完成（便于单测，也避免循环引用）。

export interface WriterPreset {
  /** 稳定 key，写入工程设置 writerKey */
  key: string;
  /** 中文署名 */
  name: string;
  /** 英文名（国际化展示用） */
  nameEn: string;
  /** 适配域：题材/气质标签，选角打分主权重 */
  genres: string[];
  /** 具象关键词：画面、人物、时空等可命中 brief 的词 */
  topics: string[];
  /** 可直接进 system prompt 的风格指令（叙事视角/句式节奏/修辞/对白/基调/易退化形态） */
  voice: string;
  /** 本风格最常见的走形方式 */
  taboos: string[];
}

export const WRITER_PRESETS: WriterPreset[] = [
  {
    key: 'akutagawa', name: '芥川龙之介', nameEn: 'Akutagawa Ryunosuke',
    genres: ['人性暗面', '反转', '寓言', '悬疑', '历史新编', '知识分子'],
    topics: ['自私', '怯懦', '告密', '旧事', '机关', '证据', '袖扣', '当票', '短促', '冷笑'],
    voice: '以冷静的手术刀式叙述解剖人物的自私与怯懦：叙述者带一层旁观的讥诮，越到紧要处笔调越冷。'
      + '句式短峭清瘦，句与句靠逻辑咬合而非形容词衔接，段内多留转折。善用具体小物件当证据（一枚袖扣、半张当票），让物替人说话。'
      + '结尾必留一刀：真相翻转或沉默收束，不做道德判决、不升华。对白精简，每句都在掩饰什么，说出的与想到的常隔半步。',
    taboos: ['堆砌文言词藻变成典故展览', '结尾强行劝善惩恶', '用旁白解释人物的恶'],
  },
  {
    key: 'dazai', name: '太宰治', nameEn: 'Dazai Osamu',
    genres: ['自剖', '颓废', '失败者', '第一人称', '都市边缘人', '自嘲喜剧'],
    topics: ['道歉', '讨好', '客套', '羞耻', '酒', '药店', '遗书', '小丑', '面具', '负罪'],
    voice: '第一人称自剖体，叙述者先把自己放低到尘埃里再开口：坦白、怯懦、又带讨好的笑。'
      + '句子长而绕，多插入语与自我否定（其实、话虽如此、然而），语气像深夜对一个人絮语。'
      + '悲剧事件用轻佻口吻讲，越惨越轻描淡写，笑点紧挨痛处。对白充满欲言又止与客气，真实动机藏在礼貌后面。'
      + '基调是依附与负罪，绝不塑造英雄。',
    taboos: ['把独白写成散文诗段落而丢失事件推进', '廉价丧气口号', '无节制的抒情自怜'],
  },
  {
    key: 'kawabata', name: '川端康成', nameEn: 'Kawabata Yasunari',
    genres: ['物哀', '情感细腻', '生死', '留白', '恋爱', '日常'],
    topics: ['雪', '镜', '指尖', '灯火', '睡颜', '旧居', '琴', '雾', '倒影', '清晨'],
    voice: '以感官细节承载情绪，不作心理解释：雪声、镜中倒影、指尖触到的凉，物象一出现情绪就到了。'
      + '叙述极静，句子短而洁净，多用现在时的视觉与听觉切片；时间与事件退为背景，只留几个瞬间并置。'
      + '关键处用沉默、起身、整理衣袖代替告白。主题多为美之消逝、孤独与温柔的徒劳。留白多于陈述，结尾不给答案。',
    taboos: ['形容词泛滥的风景抒情', '把物哀写成伤感独白', '旁白替人物总结情绪'],
  },
  {
    key: 'mishima', name: '三岛由纪夫', nameEn: 'Mishima Yukio',
    genres: ['理念冲突', '肉体', '毁灭', '壮丽', '历史', '极端人格'],
    topics: ['仪式', '刀', '肌肉', '日照', '忠', '祭', '制服', '演说', '海', '美名'],
    voice: '先立观念再落血肉：每个人物都是一种理念的化身，冲突是理念对理念。'
      + '描写重形体、姿态、仪式与光，句子长、结构严整、层层递进，带雄辩的节奏。'
      + '美的描写总与毁坏并置，越崇高越逼近毁灭。对白像辩论，措辞考究，人物在说理时暴露自己的偏执。'
      + '叙述者冷静华丽且毫不退让地把人物推向自我实现即自我毁灭的终点。',
    taboos: ['只剩辞藻堆叠', '口号式理念宣讲', '把动作场面写成抒情散文'],
  },
  {
    key: 'soseki', name: '夏目漱石', nameEn: 'Soseki Natsume',
    genres: ['知识分子', '讽喻', '都市疏离', '恋爱', '道德困境'],
    topics: ['书房', '月色', '道义', '自尊', '先生', '信', '火车', '病', '寒天', '旁观'],
    voice: '知识分子的克制叙述，夹叙夹议，叙述者带一点自嘲的迂腐气与讥讽。'
      + '句式偏书面、逻辑连接清楚，偶有汉文训练留下的凝练。人物用礼数与理论包裹欲望：越动情越绕远，越引用越心虚。'
      + '对白充满试探与保留。写都市人的孤独与自我欺骗，批判藏在礼貌里，不喊叫。'
      + '结尾多让人物退回原位，给出余味而非判决。',
    taboos: ['老学究式掉书袋', '议论压过情节', '通篇道德说教'],
  },
  {
    key: 'tanizaki', name: '谷崎润一郎', nameEn: 'Tanizaki Junichiro',
    genres: ['偏执之爱', '感官', '畸形美', '旧式宅邸', '臣服'],
    topics: ['漆器', '和室', '衣料', '足', '昏暗', '刺青', '胶片', '味', '奴', '遮蔽'],
    voice: '以触觉、嗅觉、味觉与质地推进情欲：和室的昏暗、漆器上的指痕、衣料的摩擦，都写成可见的诱惑。'
      + '叙述缓慢铺张，句子绵长缠绕，一件事反复描摹三面。人物关系是崇拜与臣服，被崇拜者写得更神秘，'
      + '臣服者心甘情愿地损毁自己。对白带旧式客敬，敬辞越周全越显出控制与屈服。基调是唯美压倒道德，光明处反而藏毒。',
    taboos: ['感官描写沦为装饰华丽', '人物只剩怪癖而无逻辑', '直白情色叙述失去暗示层级'],
  },
  {
    key: 'luxun', name: '鲁迅', nameEn: 'Lu Xun',
    genres: ['国民性批判', '冷峻', '寓言', '乡土', '知识分子', '短篇'],
    topics: ['看客', '笑', '祠堂', '药', '路', '灯', '辫', '钱', '沉默', '归乡'],
    voice: '冷而狠的白描：用最少的字把人和事钉住，不作解释也不安慰。'
      + '叙述者常是回乡者或旁观的知识分子，带负罪感的清醒。句式短峭，转折靠标点与空白完成；反语与曲笔多，越愤怒越平静。'
      + '人物用一个动作、一句口头禅定型（看客的笑、伸出的手）。对白极简，句句暴露身份与局限。'
      + '结尾常留一声不安的追问，不给希望也不给绝望。',
    taboos: ['杂文化呼告', '标语式讽刺', '文言化的生硬措辞'],
  },
  {
    key: 'zhangailing', name: '张爱玲', nameEn: 'Eileen Chang',
    genres: ['都市情感', '苍凉', '算计', '参差对照', '婚姻', '女性'],
    topics: ['旗袍', '月亮', '肥皂', '公寓', '亲戚', '账', '戒指', '留声机', '雨天', '名声'],
    voice: '华丽的俗世眼光：写男女之情必连着钱、房子、衣服与亲戚的闲话，浪漫一开场就露出身价。'
      + '比喻新奇而刻薄，常从日常物事取象，一句就把人比薄。叙述既亲近又冷，句子绵密带转折，在参差对照里显出苍凉。'
      + '对白全是机锋，客气里下刀，每句都在试探筹码。时间感是没落与拖延，结局往往是将就。',
    taboos: ['堆金砌玉的辞藻模仿', '只剩尖酸而无悲悯', '用大段旁白解释心理'],
  },
  {
    key: 'laoshe', name: '老舍', nameEn: 'Lao She',
    genres: ['市井幽默', '北京话', '小人物悲剧', '底层', '讽刺'],
    topics: ['车', '茶馆', '院子', '面子', '街坊', '掌柜', '人力', '节', '孩子', '羊'],
    voice: '以市井口语立骨：人物开口就是身份，儿化、俏皮话、绕着弯的客气，一听就知道干什么活、什么岁数。'
      + '幽默是暖的，先把人逗笑，再让他摔在现实里。叙述简洁利落，靠动作与对话推情节，少形容词；'
      + '写景是为了托出人物的处境。小人物要体面、爱面子，被面子害了还替别人着想。对白你来我往接得极快，'
      + '潜台词是面子与生计。',
    taboos: ['油滑贫嘴成段子', '方言堆砌成猎奇色彩', '结尾喊苦喊冤失去克制'],
  },
  {
    key: 'shencongwen', name: '沈从文', nameEn: 'Shen Congwen',
    genres: ['乡土', '牧歌', '温厚哀愁', '边地', '少年情'],
    topics: ['河', '船', '渡口', '吊脚楼', '端午', '虎', '摆渡', '雨', '白塔', '集市'],
    voice: '水边的叙述：河、船、渡口、吊脚楼，人与风俗一起呼吸。笔调温厚，不评判人物的愚与善，'
      + '只把他们放在风物里照着写。句子清简舒展，节奏像行船，段落间常留出无事发生的空隙。'
      + '情欲与悲哀都用极轻的笔触点过，离别不哭，只写水面。对白朴素带地方口音，话短意思长。'
      + '基调是美好正在被毁掉而人不自觉。',
    taboos: ['田园牧歌的甜腻风景文', '抒情压过人事', '把方言写成猎奇色彩'],
  },
  {
    key: 'wangzengqi', name: '汪曾祺', nameEn: 'Wang Zengqi',
    genres: ['饮食男女', '淡笔', '散文化', '市井', '手艺'],
    topics: ['吃食', '小菜', '师傅', '巷子', '草木', '茶', '盐', '待客', '雨季', '地名'],
    voice: '淡到几乎不见笔力的叙述：写吃食、草木、手艺人、街坊琐事，事件极小，好处全在准确。'
      + '句子短，多用白话口语，偶尔一个文言词轻轻点住；不写心理，只写手上的动作和桌上的东西。'
      + '人情藏在待客、让座、多给二两里。对白干净利落，一人一句就认得出是谁。幽默宽厚，不刻薄。'
      + '结尾常常散开，像话说完人就走了。',
    taboos: ['淡成流水账', '只有风物没有冲突', '刻意随性导致结构松散'],
  },
  {
    key: 'qianzhongshu', name: '钱钟书', nameEn: 'Qian Zhongshu',
    genres: ['学者讽刺', '比喻密度', '机智', '知识界', '婚姻'],
    topics: ['文凭', '请客', '演讲', '帽子', '镜', '旅', '教授', '介绍人', '咖啡', '体面'],
    voice: '学者腔的讽刺叙述，叙述者博学而刻薄：一个比喻接一个，从典故、生理、外物三面夹住人物的虚荣。'
      + '句子工整而绕，带对偶与转折，越庄重的场合越好笑。人物是知识分子，说体面话办自私事，'
      + '对白充满引证与自我辩护，一开口就暴露局限。心理不直写，用一件衣饰、一次请客、一个称呼解剖。'
      + '基调是求而不得的幻灭与无奈。',
    taboos: ['比喻泛滥成炫技', '讽刺失去同情', '掉书袋使情节停滞'],
  },
  {
    key: 'yuhua', name: '余华', nameEn: 'Yu Hua',
    genres: ['苦难', '冷叙述', '重复推进', '家族', '荒诞现实'],
    topics: ['饥饿', '医院', '坟', '稻', '血', '名字', '活着', '死', '儿子', '年代'],
    voice: '把惨事用平静的口吻讲完：叙述不哭、不评论、不请求原谅，动作与结果直接摆出。'
      + '句子简短直白，重复同一句式形成推进的节奏，苦难一件叠一件而人物语气几乎不变。'
      + '时间跨度大而叙述不解释历史，只让人被历史推着走。对白朴素、重复、常常答非所问，苦中生出荒诞的笑。'
      + '人物靠忍耐与求生的本能立住，结尾不给解脱。',
    taboos: ['为惨而惨的苦难竞赛', '冷叙述变成麻木无情绪', '重复句式失去意义积累'],
  },
  {
    key: 'moyan', name: '莫言', nameEn: 'Mo Yan',
    genres: ['高密乡土', '魔幻', '感官泛滥', '家族', '历史'],
    topics: ['土地', '麦子', '红', '饿', '血', '传说', '奶奶', '牲畜', '酒', '气味'],
    voice: '汹涌的叙述嗓门：乡土、饥饿、血缘与历史搅在一起，色彩、气味、声音一齐涌上来，'
      + '句子长而满，不吝啬铺张。民间讲故事的口吻，常有人对着听者说话；现实与传说互不避让，怪事被当作家常。'
      + '人物的欲望生理化，饥饿就是能吃，恨就敢当众说出来。对白粗粝、带地方语势，越危急话越直。'
      + '基调是土地的残酷与生命力并存。',
    taboos: ['感官堆砌成腻', '魔幻沦为离奇事件罗列', '叙述过满不留白'],
  },
  {
    key: 'wangxiaobo', name: '王小波', nameEn: 'Wang Xiaobo',
    genres: ['荒诞理性', '黑色幽默', '反讽', '体制', '自由'],
    topics: ['假设', '下乡', '插队', '逻辑', '牛', '铁锅', '检查', '山顶', '有趣', '白痴'],
    voice: '用逻辑讲荒诞：叙述者极清醒，一本正经地推演不合理的规定，越讲越可笑也越冷。'
      + '句子直白口语，带欧化长句的绕，爱用理性连接词（假设、在我看来、后来我）。'
      + '劳动与情欲是反抗的场地，人物在荒诞中保持不肯被改造的兴趣。对白平淡说理，笑点藏在逻辑接缝里，绝不抖机灵。'
      + '基调是幽默的自由与被规训的痛苦。',
    taboos: ['只剩痞气吐槽', '用议论代替故事', '反讽变成喊口号'],
  },
  {
    key: 'kafka', name: '卡夫卡', nameEn: 'Kafka',
    genres: ['体制梦魇', '悖论', '异化', '平淡叙述怪事', '罪感'],
    topics: ['办公室', '文件', '门', '传令', '审', '虫', '走廊', '铃', '父亲', '无果'],
    voice: '怪事用办事文件的语气叙述：畸变、立案、无门的机关，全部一笔带过，无人惊讶。'
      + '句子规整、从句嵌套、程序感强，越危险越是详细交代流程与细节。人物认真配合一个不肯解释他的系统，'
      + '反复申诉、反复碰壁，理由永远差一点。对白是问答式的错位，谁也没听见谁。'
      + '罪感不明来源，结局通常是未决。',
    taboos: ['故弄玄虚的谜语堆叠', '把象征点破说穿', '超现实事件写得戏剧化而失去平淡'],
  },
  {
    key: 'borges', name: '博尔赫斯', nameEn: 'Borges',
    genres: ['迷宫', '思辨', '短篇观念', '书卷', '无限'],
    topics: ['迷宫', '书', '镜子', '百科', '译者', '刀', '分岔', '梦', '圆', '碑文'],
    voice: '以观念为故事：一部伪学术著作、一座迷宫、一种无限的分岔，就是全部情节。'
      + '叙述冷静简洁，带书目与考据腔调，虚构被当作他人的研究来引用。句子干净精确，不写景不写情，'
      + '只在逻辑的岔口反复推进。人物是思想家或译者，对白像注释与争辩。篇幅克制，'
      + '结尾常撤走解释，留下一个更大的疑问。',
    taboos: ['玄学名词堆砌而无故事骨架', '把设定直接解释完', '丢掉一本正经的伪考据语气'],
  },
  {
    key: 'hemingway', name: '海明威', nameEn: 'Hemingway',
    genres: ['硬汉', '冰山理论', '极简对白', '战争', '丧失'],
    topics: ['雨', '酒', '河', '伤', '钓', '斗', '雪', '山', '枪', '等'],
    voice: '只写八分之一的冰山：句子短，主谓宾直接，形容词极少，靠动作、物件与天气承重。'
      + '情绪不写出来，藏在对白节奏里——人物不断说无关紧要的话，越受伤越聊食物、渔具、天气。'
      + '对话大量互相打断、重复、避而不答，用连接词平推。尊严体现在不失态，暴力写得简短，死后留白。',
    taboos: ['电报体的空洞短句', '硬汉姿态化', '最后忍不住把主题说出来'],
  },
  {
    key: 'chekhov', name: '契诃夫', nameEn: 'Chekhov',
    genres: ['日常悲剧', '潜台词', '无反派', '家庭', '幻灭'],
    topics: ['庄园', '茶', '咳嗽', '靴子', '医生', '戏子', '信', '果园', '嫁', '闲'],
    voice: '没有坏人的悲剧：生活只是被耽误了。叙述平实温和，注意琐碎细节（一双靴子、一声咳嗽），'
      + '人物在谈茶、谈财产、谈别人，真正的心事从不落地。对白充满错位：各说各话、答非所问、忽然沉默，'
      + '关键的话总被打断或咽回去。幽默与悲哀同处一室，越滑稽越难过。不评判、不提供出路，结尾是继续活着。',
    taboos: ['只剩忧郁氛围而无事发生', '把潜台词写明', '人物沦为疾病符号'],
  },
  {
    key: 'chandler', name: '雷蒙德·钱德勒', nameEn: 'Raymond Chandler',
    genres: ['冷硬侦探', '都市夜色', '比喻', '腐败', '孤独'],
    topics: ['雨夜', '霓虹', '事务所', '电梯', '威士忌', '烟', '委托', '警', '楼梯', '旧案'],
    voice: '第一人称冷硬叙述，城市是主角：雨、霓虹、脏办公室、电梯里的味道。'
      + '句子干净利落地推进，比喻突然而狠，从廉价物件取象。侦探世故、疲惫、不肯卖人，越危险语气越轻描淡写。'
      + '对白是攻防，短句互探，答话里藏三分假。信息节奏由委托人主导，真相来得迟且不划算。'
      + '基调是体制腐败中的个人操守。',
    taboos: ['比喻炫技成灾', '愤世嫉俗的腔调替代事件', '线索交代混乱'],
  },
];

/** 按 key 取卡（未匹配返回 null） */
export function findWriterPreset(key: string | undefined | null): WriterPreset | null {
  if (!key) return null;
  return WRITER_PRESETS.find((w) => w.key === String(key).trim()) || null;
}

// ==================== 同名原作 ====================
//
// 风险：写手层把大师姓名注入提示词后，若用户的标题/题材恰好与该写手的代表作同名
// （《罗生门》《活着》《雪国》……），模型有相当概率直接搬原作的人物、情节与专有名词，
// 把"借笔法"写成"抄原作"。
//
// 这里的代表作清单只用于**本地同名检测**，一律不进提示词正文 —— 书名一旦进 voice
// 本身就是诱导复刻。检测结果只做两件事：追加一条护栏 + 在回执里告诉用户"只是同名"。

/** 写手 key → 代表作名（用于同名检测，不进任何提示词） */
const MASTERWORKS: Record<string, string[]> = {
  akutagawa: ['罗生门', '山药粥', '鼻子', '橘子'],
  dazai: ['人间失格', '斜阳', '奔跑吧梅勒斯', '维荣之妻'],
  kawabata: ['雪国', '伊豆的舞女', '古都', '千只鹤', '山音'],
  mishima: ['金阁寺', '假面的告白', '春雪', '丰饶之海', '鹿鸣馆'],
  soseki: ['我是猫', '三四郎', '草枕', '少爷', '从此以后'],
  tanizaki: ['细雪', '春琴抄', '痴人之爱', '刺青', '少将滋干之母'],
  luxun: ['阿Q正传', '狂人日记', '孔乙己', '呐喊', '彷徨', '祝福'],
  zhangailing: ['倾城之恋', '红玫瑰与白玫瑰', '半生缘', '金锁记', '小团圆'],
  laoshe: ['骆驼祥子', '四世同堂', '茶馆', '龙须沟', '月牙儿'],
  shencongwen: ['边城', '长河', '湘行散记', '三三'],
  wangzengqi: ['受戒', '大淖记事', '异秉', '岁寒三友'],
  qianzhongshu: ['围城', '写在人生边上', '宋诗选注'],
  yuhua: ['活着', '许三观卖血记', '在细雨中呼喊', '第七天', '文城'],
  moyan: ['红高粱家族', '丰乳肥臀', '檀香刑', '生死疲劳', '酒国'],
  wangxiaobo: ['黄金时代', '白银时代', '黑铁时代', '爱你就像爱生命'],
  kafka: ['变形记', '审判', '城堡', '在流放地', '饥饿艺术家'],
  borges: ['小径分岔的花园', '阿莱夫', '巴别图书馆', '沙之书', '圆形废墟'],
  hemingway: ['老人与海', '太阳照常升起', '永别了武器', '丧钟为谁而鸣', '乞力马扎罗的雪'],
  chekhov: ['樱桃园', '三姊妹', '万尼亚舅舅', '海鸥', '第六病室'],
  chandler: ['漫长的告别', '再见吾爱', '长眠不醒', '高窗'],
};

/** 该写手的代表作清单（无则空数组） */
export function writerWorks(key: string | undefined | null): string[] {
  return MASTERWORKS[String(key || '').trim()] || [];
}

export interface SameTitleMatch {
  writerKey: string;
  writerName: string;
  work: string;
  /** title = 标题与原作同名；quoted = 正文里用书名号点名了原作 */
  how: 'title' | 'quoted';
}

/** 归一化：去书名号/引号/空白，拉丁字母转小写（中文不受影响） */
function normalizeName(text: string): string {
  return String(text || '')
    .replace(/[《》「」『』“”"'’\s，、。.．·：:—–-]/g, '')
    .toLowerCase();
}

/**
 * 检测标题/题材是否与某位写手的代表作同名。
 * 只认两种强信号，避免把"雪夜""古-town"这类普通词误判：
 *  1. 标题整体等于原作名（忽略书名号、标点与大小写）；
 *  2. 文本里出现《原作名》这样的书名号点名。
 */
export function detectSameTitleWork(input: { title?: string; description?: string }): SameTitleMatch[] {
  const title = String(input?.title || '').trim();
  const description = String(input?.description || '').trim();
  if (!title && !description) return [];
  const normTitle = normalizeName(title);
  const quotedSource = `${title}\n${description}`;
  const hits: SameTitleMatch[] = [];
  for (const preset of WRITER_PRESETS) {
    for (const work of writerWorks(preset.key)) {
      const normWork = normalizeName(work);
      if (!normWork) continue;
      let how: SameTitleMatch['how'] | null = null;
      if (normTitle && normTitle === normWork) how = 'title';
      else if (quotedSource.includes(`《${work}》`)) how = 'quoted';
      if (how) hits.push({ writerKey: preset.key, writerName: preset.name, work, how });
    }
  }
  return hits;
}

/** 同名原作命中时给模型的一句话（只在命中时追加，未命中不占 token） */
export function sameTitleNotice(match: SameTitleMatch | null | undefined): string {
  if (!match) return '';
  return `注意：本集标题/题材与写手${match.writerName}的代表作《${match.work}》同名。`
    + '同名只是风格线索，不是改编需求：原作的人物姓名、专有名词、情节节点与标志性意象一律不得沿用，'
    + '按本工程给定的人物与事件重写。';
}

// ==================== 护栏 ====================

/** 格式硬约束：来源见文件头的解析契约说明，必须放在提示词最末且声明优先级 */
export const FORMAT_GUARD = [
  '【剧本格式硬约束（优先级最高，任何文风特征都不得违反）】',
  '1. 每一场的第一行写场景标题，只能取以下样式之一：「第N场」「第N幕」「【地点】」，或以 INT./EXT./内景/外景 起头；标题行不写成句子、不加修饰。',
  '2. 台词严格写成「角色名：台词内容」，一行一句；角色名不超过 10 个字，用全角冒号；一行只允许一个说话人，严禁把两个人的话写进同一行。',
  '3. 台词正文里不得再出现「某某：」这样的说话人前缀，说话人只写在冒号之前。',
  '4. 动作与环境描写独立成行，不得以「角色名：」开头，也不得写成没有主语的第一人称散文段落。',
  '5. 内心独白、回忆、旁白一律落成可拍的形式：写成「角色名（内心）：……」或「画外音：……」的单行台词，禁止写成第一人称抒情段落。',
  '6. 不使用 Markdown 标题、代码围栏、编号列表、项目符号或小标题分节；场与场之间空一行即可。',
  '7. 时间或地点跳转用新的一行场景标题表达，不要用叙述性过渡段解释。',
  '文风层与格式层冲突时，一律以格式层为准。',
].join('\n');

/** 模型腔禁词（提示词里明示 + 输出后可用于自检/评分） */
export const AI_FLAVOR_RE = /仿佛|宛如|犹如|不禁|缓缓地|微微地|深深地|似乎在诉说|值得一提|无声的|凝固|氤氲|岁月静好|诉说着/;

const ANTI_AI_FLAVOR_RULES = [
  '禁用词（出现即算走形）：仿佛、宛如、犹如、不禁、缓缓地、微微地、深深地、值得一提、无声的、凝固、氤氲、岁月静好。',
  '禁止段末升华或总结陈词；禁止三段排比收束；禁止"从……到……再到……"式罗列。',
  '禁止旁白替角色说出心理；情绪只能由动作、物件、沉默与台词带出。',
  '要求具体名词 + 强动词；句长参差，长短交错；留白与潜台词优先于解释。',
  '感官细节优先于形容词堆叠；每句台词必须是演员能直接演出的话，不是作者在代言。',
].join('\n');

/** 去 AI 味硬清单（与写手无关，任何文风都生效） */
export const ANTI_AI_FLAVOR = `【去 AI 味硬清单】\n${ANTI_AI_FLAVOR_RULES}`;

/** 原创性底线：只要注入了写手笔法就生效，防止"借笔法"滑成"抄原作" */
export const ORIGINALITY_GUARD = [
  '【原创性底线】',
  '写手姓名与上述笔法只借其观察方式、句式节奏与修辞习惯；不得移植任何具体作品的标题、人物姓名、'
  + '专有名词、标志性意象与情节走向，也不得以"致敬""化用"为名复述原作桥段。',
  '人物、事件、地名、道具一律来自本工程给定的题材与资料；若题材与某部作品同名，按同名新作处理。',
].join('\n');

// ==================== 拼装 ====================

export interface WriterSystemOptions {
  /** 原有的角色设定与输出契约文本，置于最末以保证结构优先 */
  base: string;
  /** 解析出的写手卡（null = 不限定，仅套通用护栏） */
  writer?: WriterPreset | null;
  /** 工程锁定/用户改写的风格文本；非空时优先于 writer.voice */
  stylePrompt?: string;
  /** 用户附加的风格要求（原 body.style），只作补充不作主源 */
  extra?: string;
  /** 与某位写手代表作同名的命中结果（命中才追加一句提醒，未命中不占 token） */
  sameWork?: SameTitleMatch | null;
}

/**
 * 组装带写手人格的 system prompt。
 * 顺序：代笔身份 → 写手风格卡 → 去 AI 味 → 原创性底线 → 用户附加要求 → 原 base 契约 → 格式硬约束（压轴）。
 */
export function buildWriterSystem(opts: WriterSystemOptions): string {
  const { base, writer, stylePrompt, extra, sameWork } = opts;
  const parts: string[] = [
    '你此刻不是一个通用的 AI 助手，而是一位有明确个人笔法、需要对本集署名的职业剧作家。',
    '按下列笔法写作，不得掺入通用、无个人印记的解说腔：',
  ];
  const voice = (stylePrompt || '').trim() || (writer?.voice ?? '').trim();
  if (voice) {
    parts.push(`【执笔写手：${writer?.name ?? '本工程指定写手'}】\n${voice}`);
  }
  if (writer?.taboos?.length) {
    parts.push(`【本风格最常见的走形方式，务必规避】\n${writer.taboos.map((t) => `- ${t}`).join('\n')}`);
  }
  parts.push(ANTI_AI_FLAVOR);
  // 只有真的请了写手（或工程自定义了笔法）才需要原创性底线，不限定文风时不必占位
  if (voice) {
    parts.push(ORIGINALITY_GUARD);
    const notice = sameTitleNotice(sameWork);
    if (notice) parts.push(`【同名原作提醒】\n${notice}`);
  }
  const extraText = (extra || '').trim();
  if (extraText) parts.push(`【用户附加的风格要求（在写手笔法之内尽量满足）】\n${extraText}`);
  parts.push(base);
  parts.push(FORMAT_GUARD);
  return parts.join('\n\n');
}

/** 截取风格摘要用于低 token 场景（如分镜拆分只需笔调不需完整卡） */
export function writerVoiceDigest(prompt: string, max = 150): string {
  const text = String(prompt || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/[\n，。；].*$/, '')}……`;
}

// ==================== 选角 ====================

export interface WriterCandidate {
  key: string;
  name: string;
  /** 适配度 0-100 */
  fit: number;
  reason: string;
}

export interface WriterCastResult {
  chosen: WriterPreset | null;
  candidates: WriterCandidate[];
  rationale: string;
  /** model = 模型判定；local = 回落本地打分 */
  source: 'model' | 'local';
  /** 标题/题材与某位写手代表作同名时的命中结果（无则 null），供提示词与回执使用 */
  sameWork?: SameTitleMatch | null;
}

function countHits(text: string, token: string): number {
  if (!token) return 0;
  let n = 0;
  let from = 0;
  for (;;) {
    const i = text.indexOf(token, from);
    if (i === -1) break;
    n += 1;
    from = i + token.length;
  }
  return n;
}

/**
 * 本地确定性打分：适配域命中为主权重，具象关键词共现为辅，写手署名直提为最强信号。
 * 用于无文本模型、模型返回非法 key、或需要给候选补齐分数时。
 * `title` 可选：标题与该写手代表作同名时加成 —— 用户点名《罗生门》多半就是想要那只冷刀，
 * 但只是加权而非锁定，原作内容仍由原创性底线拦住。
 */
export function scoreWriterFit(brief: string, card: WriterPreset, title?: string): number {
  const text = String(brief || '');
  let score = 0;
  const matchedGenres: string[] = [];
  for (const g of card.genres) {
    const hits = countHits(text, g);
    if (hits > 0) {
      score += 12 + Math.min(hits, 3) * 2;
      matchedGenres.push(g);
    }
  }
  for (const t of card.topics) {
    const hits = countHits(text, t);
    if (hits > 0) score += 3 + Math.min(hits, 3);
  }
  if (text.includes(card.name)) score += 60;
  if (card.nameEn && text.toLowerCase().includes(card.nameEn.toLowerCase())) score += 60;
  const normTitle = normalizeName(title || '');
  if (normTitle && writerWorks(card.key).some((w) => normalizeName(w) === normTitle)) score += 40;
  return score;
}

/** 本地排名，同分时按库内声明顺序（人为排定的稳健优先级），保证可复现 */
export function rankWritersByFit(brief: string, top = 3, title?: string): WriterCandidate[] {
  const withScore = WRITER_PRESETS.map((card, index) => ({
    card,
    index,
    score: scoreWriterFit(brief, card, title),
    matched: card.genres.filter((g) => String(brief || '').includes(g)),
  }));
  withScore.sort((a, b) => (b.score - a.score) || (a.index - b.index));
  const max = withScore[0]?.score || 0;
  return withScore.slice(0, top).map(({ card, score, matched }) => ({
    key: card.key,
    name: card.name,
    fit: max > 0 ? Math.round((score / max) * 100) : 0,
    reason: matched.length
      ? `题材命中：${matched.slice(0, 3).join('、')}`
      : '题材无显著冲突，按笔法稳健度优先',
  }));
}

const CAST_SYSTEM =
  '你是剧作总监，负责为一部影像剧本指派一位最合适的代笔写手。' +
  '只能从给定的写手清单中选择，判断依据是题材、情绪基调、叙事视角与该写手手法的契合度，' +
  '以及该手法在影像剧本里是否容易被拍出来（避免选择只宜于纯文学阅读的手法）。' +
  '若本集标题或题材与该写手的某部代表作同名，只表示读者会比较、笔法要更贴近，' +
  '绝不意味着改编原作；rationale 与 reason 不得出现"还原原作剧情""照搬原作人物"这类表述。' +
  '严格只输出一个 JSON 对象：{"chosen":"写手key","rationale":"一句话理由",' +
  '"candidates":[{"key":"写手key","fit":0-100整数,"reason":"适配理由"}]}，' +
  'candidates 给 3 个（含 chosen，按 fit 从高到低），全部中文。';

/**
 * 适配度选角：一次小 JSON 调用。
 * chat 由调用方注入（localScripts 传 chatJson 闭包），本模块不依赖任何服务，便于单测。
 * 任何失败（无模型、非 JSON、非法 key）都回落到本地确定性打分，绝不抛错阻塞剧本生成。
 */
export async function castWriter(opts: {
  brief: string;
  /** 本集/本工程标题，用于同名原作检测与本地加权 */
  title?: string;
  chat?: (system: string, user: string) => Promise<any | null>;
  top?: number;
}): Promise<WriterCastResult> {
  const top = opts.top ?? 3;
  const sameTitleHits = detectSameTitleWork({ title: opts.title, description: opts.brief });
  // 命中多位写手时优先报最终执笔那位，避免提醒与实际署名写手对不上
  const sameWorkFor = (key?: string): SameTitleMatch | null =>
    sameTitleHits.find((h) => h.writerKey === key) || sameTitleHits[0] || null;
  const sameWork = sameWorkFor();
  const fallback = (): WriterCastResult => {
    const candidates = rankWritersByFit(opts.brief, top, opts.title);
    const chosen = findWriterPreset(candidates[0]?.key);
    return {
      chosen,
      candidates,
      rationale: candidates[0]?.reason || '按题材稳健默认指派',
      source: 'local',
      sameWork,
    };
  };

  if (!opts.chat) return fallback();

  const roster = WRITER_PRESETS
    .map((w) => `- ${w.key}｜${w.name}：${w.genres.join('、')}`)
    .join('\n');
  const sameWorkNote = sameTitleNotice(sameWork);
  let parsed: any = null;
  try {
    parsed = await opts.chat(
      CAST_SYSTEM,
      `写手清单：\n${roster}\n\n本集题材与要求：\n${String(opts.brief || '').slice(0, 4000)}${
        sameWorkNote ? `\n\n${sameWorkNote}` : ''
      }`,
    );
  } catch {
    return fallback();
  }

  const byKey = (raw: unknown): WriterPreset | null => {
    const text = String(raw ?? '').trim();
    if (!text) return null;
    return WRITER_PRESETS.find((w) => w.key === text || w.name === text || w.nameEn === text) || null;
  };
  const chosen = byKey(parsed?.chosen);
  if (!chosen) return fallback();

  const local = rankWritersByFit(opts.brief, top, opts.title);
  const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  const seen = new Set<string>();
  const candidates: WriterCandidate[] = [];
  for (const raw of rawCandidates) {
    const card = byKey(raw?.key);
    if (!card || seen.has(card.key)) continue;
    seen.add(card.key);
    const fit = Number(raw?.fit);
    candidates.push({
      key: card.key,
      name: card.name,
      fit: Number.isFinite(fit) ? Math.max(0, Math.min(100, Math.round(fit)))
        : (local.find((c) => c.key === card.key)?.fit ?? 0),
      reason: String(raw?.reason || '').trim() || (local.find((c) => c.key === card.key)?.reason ?? ''),
    });
  }
  if (!candidates.some((c) => c.key === chosen.key)) {
    candidates.unshift({ key: chosen.key, name: chosen.name, fit: 100, reason: String(parsed?.rationale || '').trim() || '综合契合度最高' });
  }
  if (candidates.length < top) {
    for (const c of local) {
      if (candidates.length >= top) break;
      if (!candidates.some((x) => x.key === c.key)) candidates.push(c);
    }
  }
  candidates.sort((a, b) => b.fit - a.fit);
  return {
    chosen,
    candidates,
    rationale: String(parsed?.rationale || '').trim() || candidates[0]?.reason || '综合契合度最高',
    source: 'model',
    sameWork: sameWorkFor(chosen.key),
  };
}
