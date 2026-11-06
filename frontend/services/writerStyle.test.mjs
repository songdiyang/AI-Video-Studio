/** 写手风格层护栏回归：node --test services/writerStyle.test.mjs
 *
 * 这一层是「文风」与「结构」的接缝，最容易在后续改动中被单方面破坏：
 * 改了 FORMAT_GUARD 的文案，或改了大纲面板的解析正则，两边都会静默漂移，
 * 表现为「大师腔一开，大纲面板解析不出节点 / 分镜拆分丢台词」。
 * 因此本文件直接引用 ScriptOutlinePanel 导出的真实正则与解析函数做交叉断言，
 * 而不是在测试里抄一份正则（抄的那份改了不会有人报错）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * 转译真实源码执行。
 * 视图文件不能直接剥掉 import：模块级常量（如 TYPE_CONFIG）会引用图标名，
 * 剥空后求值 ReferenceError。所以把每个 import 绑定点替换成可调用/可取属性的桩，
 * 组件永不渲染，桩永不真正工作，模块级求值因此安全。
 */
function loadTs(file, { stubViewImports = false } = {}) {
  let source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
  if (stubViewImports) {
    const bindings = new Set();
    source = source.replace(/^[ \t]*import\s+([\s\S]*?)\s+from\s*['"][^'"]*['"];?[ \t]*$/gm, (_m, clause) => {
      const named = clause.match(/\{([\s\S]*)\}/);
      if (named) {
        for (const raw of named[1].split(',')) {
          const part = raw.trim().replace(/^type\s+/, '');
          if (part) bindings.add(part.split(/\s+as\s+/).pop().trim());
        }
      }
      const head = clause.replace(/\{[\s\S]*\}/, ' ').replace(/,/g, ' ').trim();
      for (const token of head.split(/\s+/)) {
        const name = token.replace(/^\*\s+as\s+/, '').trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) bindings.add(name);
      }
      return '';
    });
    assert.ok(!/^\s*import\s/m.test(source), '未能剥离视图文件的 import 语句');
    assert.ok(bindings.size > 0, '视图文件没有解析到任何 import 绑定');
    source = [
      'const __stub = (() => {',
      '  const p = new Proxy(function () {}, { get: () => p, apply: () => p, construct: () => p });',
      '  return () => p;',
      '})();',
      ...[...bindings].map((name) => `const ${name} = __stub();`),
      source,
    ].join('\n');
  }
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
}

const writer = await loadTs('./writerStyle.ts');
const outline = await loadTs('../views/StoryBoard/ScriptOutlinePanel.tsx', { stubViewImports: true });
const {
  WRITER_PRESETS, FORMAT_GUARD, AI_FLAVOR_RE, ANTI_AI_FLAVOR,
  buildWriterSystem, writerVoiceDigest, scoreWriterFit, rankWritersByFit,
  findWriterPreset, castWriter, writerWorks, detectSameTitleWork,
  sameTitleNotice, ORIGINALITY_GUARD,
} = writer;
const { SCENE_HEADING_RE, DIALOGUE_RE, parseScriptToOutline } = outline;

// ==================== 写手卡库 ====================

test('写手卡库：20 位已故大师，字段齐备且 key 唯一', () => {
  assert.equal(WRITER_PRESETS.length, 20);
  const keys = WRITER_PRESETS.map((w) => w.key);
  assert.equal(new Set(keys).size, keys.length, 'key 不得重复');
  for (const card of WRITER_PRESETS) {
    assert.ok(card.name && card.nameEn, `${card.key} 缺中/英署名`);
    assert.ok(Array.isArray(card.genres) && card.genres.length >= 3, `${card.key} 适配域过少`);
    // voice 要能直接进 system prompt：既要有视角/节奏，也要写清易退化形态
    assert.ok(card.voice.length >= 120 && card.voice.length <= 600, `${card.key} 风格指令长度异常`);
    assert.ok(Array.isArray(card.taboos) && card.taboos.length >= 2, `${card.key} 缺退化禁忌`);
    // 代表作清单只用于同名检测：必须有，但书名绝不允许混进 voice（进了就是诱导复刻）
    assert.ok(writerWorks(card.key).length >= 2, `${card.key} 缺代表作清单，同名检测会失效`);
    for (const work of writerWorks(card.key)) {
      assert.ok(!card.voice.includes(work), `${card.key} 的 voice 里出现了原作书名：${work}`);
      assert.ok(
        !card.taboos.some((x) => x.includes(work)),
        `${card.key} 的 taboos 里出现了原作书名：${work}`
      );
      assert.ok(
        !card.genres.some((x) => x.includes(work)),
        `${card.key} 的 genres 里出现了原作书名（会进选角清单提示词）：${work}`
      );
    }
  }
});

// ==================== 格式护栏 ↔ 大纲解析契约 ====================

test('FORMAT_GUARD 要求的每种场景标题式都能被大纲面板识别', () => {
  const headings = ['第一场', '第12场', '第三幕', '第二集', '【旧课桌前】', 'INT. 教室 - 夜', 'EXT. 天台', '内景 当铺', '外景 巷口', 'Scene 3'];
  for (const line of headings) {
    assert.ok(SCENE_HEADING_RE.test(line), `场景标题未被识别：${line}`);
  }
  // 护栏明确禁止的写法：叙述性过渡段不得被当成正经标题结构
  assert.ok(/Markdown|代码围栏/.test(FORMAT_GUARD), 'FORMAT_GUARD 缺少禁用 Markdown 的条款');
});

test('FORMAT_GUARD 要求的台词式都能被识别，且说话人前缀不残留进正文', () => {
  const lines = ['老李：这案子我接了。', '陈默（内心）：他不会告密的。', '画外音：十年前的那个雨夜。', 'Small: hello'];
  for (const line of lines) {
    assert.ok(DIALOGUE_RE.test(line), `台词行未被识别：${line}`);
  }
  const script = [
    '第一场',
    '老李：这案子我接了。',
    '陈默（内心）：他不会告密的。',
    '',
    '第二场',
    '画外音：十年前的那个雨夜。',
  ].join('\n');
  const nodes = parseScriptToOutline(script);
  assert.equal(nodes.length, 2, '两场应解析出两个场景节点');
  assert.equal(nodes[0].children.length, 2, '第一场应有两句台词');
  const bodies = nodes.flatMap((n) => (n.children || []).map((c) => c.content));
  for (const body of bodies) {
    assert.ok(!/（内心）|画外音[：:]/.test(body || ''), `台词正文残留说话人标注：${body}`);
    assert.ok(!/^(老李|陈默)[：:]/.test(body || ''), `台词正文重复带了前缀：${body}`);
  }
});

test('大师腔的高危写法（第一人称散文独白）不会被误当台词', () => {
  // 这类句子一旦出现在正文里，大纲面板只会归为动作段，分镜拆分也拿不到说话人
  assert.ok(!DIALOGUE_RE.test('我觉得这世上的事大抵是无所谓结果的。'), '散文段落被误识别为台词');
  assert.ok(!DIALOGUE_RE.test('他缓缓地站了起来，仿佛在诉说着什么。'), '动作描写被误识别为台词');
});

test('FORMAT_GUARD 明确声明格式层优先于文风层', () => {
  assert.match(FORMAT_GUARD, /文风层与格式层冲突时，一律以格式层为准/);
});

// ==================== 去 AI 味清单 ====================

test('AI_FLAVOR_RE 命中典型模型腔，不误伤干净句', () => {
  const dirty = [
    '她仿佛看见了十年前的自己。',
    '他缓缓地转过身，宛如一尊雕塑。',
    '屋里的空气似乎凝固了。',
    '檀香的烟气氤氲在梁上。',
    '值得一提的是，这只袖扣是新的。',
    '岁月静好，现世安稳。',
    '那双眼睛似乎在诉说着一段往事。',
    '她不禁红了眼眶，深深地吸了一口气。',
  ];
  for (const sentence of dirty) {
    assert.ok(AI_FLAVOR_RE.test(sentence), `应命中模型腔：${sentence}`);
  }
  const clean = [
    '老李把袖扣放进证物袋，没看第二眼。',
    '柜台上摆着半张当票，日期是十年前。',
    '他数了三遍，还是多出两块钱。',
    '母亲把鱼头夹到自己碗里。',
  ];
  for (const sentence of clean) {
    assert.ok(!AI_FLAVOR_RE.test(sentence), `误伤干净句：${sentence}`);
  }
  assert.match(ANTI_AI_FLAVOR, /禁止段末升华/);
  assert.match(ANTI_AI_FLAVOR, /三段排比/);
  assert.match(ANTI_AI_FLAVOR, /具体名词 \+ 强动词/);
});

// ==================== 拼装顺序 ====================

test('buildWriterSystem：人格在文风前，格式契约压轴', () => {
  const card = findWriterPreset('akutagawa');
  const sys = buildWriterSystem({ base: '只输出剧本正文', writer: card, extra: '结尾要反转' });
  const atIdentity = sys.indexOf('职业剧作家');
  const atVoice = sys.indexOf(card.name);
  const atAnti = sys.indexOf('【去 AI 味硬清单】');
  const atBase = sys.indexOf('只输出剧本正文');
  const atGuard = sys.indexOf('【剧本格式硬约束');
  assert.ok(atIdentity >= 0 && atIdentity < atVoice, '代笔身份应在写手笔法之前');
  assert.ok(atVoice < atAnti, '写手笔法应在去 AI 味清单之前');
  assert.ok(atAnti < atBase, '通用清单不得压过原有输出契约');
  assert.ok(atGuard > atBase, '格式硬约束必须置于最末（优先级最高）');
  assert.match(sys, /结尾要反转/, '用户附加风格要求被丢弃');
});

test('buildWriterSystem：未指派写手时不虚构人格，护栏仍然齐全', () => {
  const sys = buildWriterSystem({ base: '只输出剧本正文', writer: null });
  assert.ok(!/【执笔写手：/.test(sys), '不限定时不得塞入写手署名');
  assert.match(sys, /【去 AI 味硬清单】/);
  assert.match(sys, /【剧本格式硬约束/);
  // 用户改写过的笔法文本优先于写手卡内置 voice
  const edited = buildWriterSystem({ base: 'b', writer: findWriterPreset('dazai'), stylePrompt: '按我自己的话写' });
  assert.match(edited, /按我自己的话写/);
  assert.ok(!edited.includes(findWriterPreset('dazai').voice), '自定义笔法应覆盖内置 voice');
});

test('writerVoiceDigest：长文本截到限内且不留半句', () => {
  const long = findWriterPreset('moyan').voice + '额外的一句补充说明，用来把长度推过上限。';
  const digest = writerVoiceDigest(long, 60);
  assert.ok(digest.length <= 60 + 6, `摘要超长：${digest.length}`);
  assert.equal(writerVoiceDigest('短句', 150), '短句');
  assert.equal(writerVoiceDigest('', 150), '');
});

// ==================== 适配度打分 ====================

test('scoreWriterFit / rankWritersByFit：同一描述两次排序完全一致', () => {
  const brief = '校园悬疑短片，转校生发现旧课桌里的日记，揭开十年前的秘密，有反转，写人性的暗面';
  const first = rankWritersByFit(brief);
  const second = rankWritersByFit(brief);
  assert.deepEqual(first.map((c) => c.key), second.map((c) => c.key), '打分排序不确定');
  assert.equal(first.length, 3, '默认给出 1 主选 + 2 备选');
  assert.ok(first[0].fit >= first[1].fit, '候选未按适配度降序');
  // 题材命中要真的影响排名：悬疑反转题材下芥川必须排在牧歌乡土型写手之前
  const pastoral = findWriterPreset('shencongwen');
  assert.ok(
    scoreWriterFit(brief, findWriterPreset('akutagawa')) > scoreWriterFit(brief, pastoral),
    '悬疑反转题材的适配度判定反常'
  );
  assert.ok(rankWritersByFit('')[0].key, '空描述也必须给出确定性首选');
});

// ==================== 选角兜底 ====================

test('castWriter：模型给出非法 key 时回落本地打分，绝不抛错', async () => {
  const brief = '都市情感，苍凉的算计，参差对照';
  const bad = await castWriter({
    brief,
    chat: async () => ({ candidates: [{ key: 'LUCA', fit: 99, reason: '臆造' }], chosen: 'LUCA', rationale: 'x' }),
  });
  assert.equal(bad.source, 'local');
  assert.ok(findWriterPreset(bad.chosen?.key), '回落结果必须命中写手卡');
  assert.ok(bad.candidates.length > 0);

  const broken = await castWriter({ brief, chat: async () => { throw new Error('模型不可用'); } });
  assert.equal(broken.source, 'local');
  assert.ok(broken.chosen);

  const noChat = await castWriter({ brief });
  assert.equal(noChat.source, 'local', '没有模型时必须仍能给出本地首选');
});

test('castWriter：模型正常返回时采用其选择，理由与候选一并带回', async () => {
  const result = await castWriter({
    brief: '高密乡的魔幻往事，感官泛滥',
    chat: async () => ({
      candidates: [
        { key: 'moyan', fit: 92, reason: '乡土与感官密度契合' },
        { key: 'kawabata', fit: 40, reason: '物哀偏窄' },
      ],
      chosen: 'moyan',
      rationale: '莫言的高密乡土与该题材同源',
    }),
  });
  assert.equal(result.source, 'model');
  assert.equal(result.chosen?.key, 'moyan');
  assert.match(result.rationale, /高密/);
  // 模型只给 2 个候选时，本地排名补齐到 top，但不得引入表外 key、必须按 fit 降序
  const keys = result.candidates.map((c) => c.key);
  assert.equal(result.candidates.length, 3, '候选应补齐到 top 个，供 UI 展示备选');
  assert.equal(new Set(keys).size, keys.length, '候选不得重复');
  for (const key of ['moyan', 'kawabata']) {
    assert.ok(keys.includes(key), `模型给出的候选被丢弃：${key}`);
  }
  for (const c of result.candidates) {
    assert.ok(findWriterPreset(c.key), `候选带表外 key：${c.key}`);
    assert.ok(c.name && c.reason, `${c.key} 候选缺署名或理由`);
  }
  assert.deepEqual(
    result.candidates.map((c) => c.fit),
    [...result.candidates.map((c) => c.fit)].sort((a, b) => b - a),
    '候选未按适配度降序'
  );
  // 候选里不得夹带表外 key，否则工程设置会被写入无法解析的值
  const polluted = await castWriter({
    brief: 'x',
    chat: async () => ({ candidates: [{ key: 'moyan', fit: 9 }, { key: 'nobody', fit: 8 }], chosen: 'nobody' }),
  });
  assert.equal(polluted.source, 'local');
});

// ==================== 同名原作处理 ====================

test('代表作清单只用于本地检测：书名不泄进任何交给模型的文本', () => {
  // 两字书名多是常用词（活着 / 审判 / 茶馆），笔法描述里难以完全避开；
  // 三字以上的基本是专有标题，一旦出现在提示词里就等于诱导复刻。
  const distinctive = WRITER_PRESETS.flatMap((w) => writerWorks(w.key)).filter((x) => x.length >= 3);
  assert.ok(distinctive.length > 20, '代表作清单过短，检测面不足');
  const samples = [
    buildWriterSystem({ base: '只输出剧本正文', writer: findWriterPreset('yuhua'), extra: '结尾不给解脱' }),
    buildWriterSystem({ base: '只输出剧本正文', writer: findWriterPreset('akutagawa') }),
    ANTI_AI_FLAVOR,
    FORMAT_GUARD,
    ORIGINALITY_GUARD,
  ];
  for (const text of samples) {
    for (const work of distinctive) {
      assert.ok(!text.includes(work), `提示词里出现了原作书名：${work}`);
    }
  }
});

test('detectSameTitleWork：只认「标题全等」与「书名号点名」两种强信号', () => {
  const hit = detectSameTitleWork({ title: '罗生门' });
  assert.equal(hit.length, 1, '标题同名应精确命中一位写手的一部原作');
  assert.equal(hit[0].writerKey, 'akutagawa');
  assert.equal(hit[0].how, 'title');
  // 书名号、空白、标点不影响判定
  assert.equal(detectSameTitleWork({ title: '《罗生门》' })[0]?.work, '罗生门');
  assert.equal(detectSameTitleWork({ title: '罗生 门' })[0]?.work, '罗生门');

  const quoted = detectSameTitleWork({ title: '第三十七号当铺', description: '结构参考《活着》的重复推进' });
  assert.equal(quoted.length, 1);
  assert.equal(quoted[0].writerKey, 'yuhua');
  assert.equal(quoted[0].how, 'quoted');

  // 弱信号一律不判：否则「雪夜」「努力活着」这类普通题材会被当成同名原作，提示词天天报警
  assert.deepEqual(detectSameTitleWork({ title: '雪夜三人行' }), []);
  assert.deepEqual(detectSameTitleWork({ title: '一个普通人努力活着的故事', description: '他活着，别人也活着' }), []);
  assert.deepEqual(detectSameTitleWork({ title: '城堡里的旧课桌' }), []);
  assert.deepEqual(detectSameTitleWork({}), []);
  assert.deepEqual(detectSameTitleWork({ title: '   ', description: '' }), []);
});

test('sameTitleNotice：命中才出文案，并写明"同名不是改编"', () => {
  assert.equal(sameTitleNotice(null), '');
  const [hit] = detectSameTitleWork({ title: '雪国' });
  const notice = sameTitleNotice(hit);
  assert.match(notice, /《雪国》/);
  assert.ok(notice.includes(hit.writerName), '提醒须点名是哪位写手，否则用户看不懂');
  assert.match(notice, /同名只是风格线索，不是改编需求/);
});

test('ORIGINALITY_GUARD / 同名提醒的注入条件与位置', () => {
  const card = findWriterPreset('kawabata');
  const plain = buildWriterSystem({ base: '只输出剧本正文', writer: card });
  assert.ok(plain.includes(ORIGINALITY_GUARD), '注入写手笔法后必须带原创性底线');
  assert.ok(!plain.includes('【同名原作提醒】'), '未命中同名不该占 token');

  const [hit] = detectSameTitleWork({ title: '雪国' });
  const withHit = buildWriterSystem({ base: '只输出剧本正文', writer: card, sameWork: hit });
  assert.ok(withHit.includes('【同名原作提醒】'), '命中同名后未追加提醒');
  assert.ok(withHit.indexOf('【原创性底线】') < withHit.indexOf('【同名原作提醒】'), '底线应在提醒之前');
  assert.ok(
    withHit.indexOf('【同名原作提醒】') < withHit.indexOf('【剧本格式硬约束'),
    '同名提醒不得压过格式契约'
  );
  // 没请写手 = 没有可复刻的对象，两段都不该出现
  const noWriter = buildWriterSystem({ base: '只输出剧本正文', writer: null, sameWork: hit });
  assert.ok(!noWriter.includes('【原创性底线】'), '无笔法时不该注入原创性底线');
  assert.ok(!noWriter.includes('【同名原作提醒】'), '无笔法时不该注入同名提醒');
});

test('同名标题给执笔者加权（+40），但只加权不锁定、不改写既有排序', () => {
  const brief = '都市职场，一个人的体面一点点塌掉';
  const card = findWriterPreset('dazai');
  assert.equal(scoreWriterFit(brief, card, '人间失格') - scoreWriterFit(brief, card), 40, '同名加成不是 40');
  assert.equal(scoreWriterFit(brief, card, '《人间失格》'), scoreWriterFit(brief, card, '人间失格'), '书名号应被归一化');
  assert.equal(scoreWriterFit(brief, card, '无关标题'), scoreWriterFit(brief, card), '未命中不得加分');
  // 缺省/空/未命中标题三种情况排序完全一致，保证"传不传标题"都不引入不确定性
  const baseOrder = rankWritersByFit(brief).map((c) => c.key);
  assert.deepEqual(rankWritersByFit(brief, 3, '').map((c) => c.key), baseOrder);
  assert.deepEqual(rankWritersByFit(brief, 3, '无关标题').map((c) => c.key), baseOrder);
});

test('castWriter：sameWork 随结果返回，命中判定与执笔者归属都正确', async () => {
  let userPrompt = '';
  const local = await castWriter({
    title: '罗生门',
    brief: '一桩旧案，几个目击者各说一词',
    chat: async (_s, user) => { userPrompt = user; return null; },
  });
  assert.equal(local.source, 'local');
  assert.equal(local.sameWork?.writerKey, 'akutagawa');
  assert.equal(local.sameWork?.work, '罗生门');
  assert.match(userPrompt, /同名只是风格线索，不是改编需求/, '命中同名的提醒没送进选角提示词');

  // 模型选了别人：仍回报原作那位写手的命中，UI 才能说清"这不是改编"
  const picked = await castWriter({
    title: '罗生门',
    brief: '一桩旧案',
    chat: async () => ({
      chosen: 'chandler',
      rationale: '冷硬派更适合侦探视角',
      candidates: [{ key: 'chandler', fit: 90, reason: '冷硬' }],
    }),
  });
  assert.equal(picked.chosen?.key, 'chandler');
  assert.equal(picked.sameWork?.writerKey, 'akutagawa');

  // 未命中：必须是 null，不能让每条剧本都挂着假警报
  const clean = await castWriter({ title: '旧课桌', brief: '校园悬疑', chat: async () => null });
  assert.equal(clean.sameWork, null);
  const noTitle = await castWriter({ brief: '校园悬疑', chat: async () => null });
  assert.equal(noTitle.sameWork, null);
});
