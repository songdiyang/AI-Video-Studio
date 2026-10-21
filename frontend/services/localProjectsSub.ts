// 项目子资源本地路由（/api/projects/:id/*）
//
// 忠实镜像原后端 projects 路由（backend 目录已删除）中挂在 projects 下的子资源端点，
// 使本地工程同样具备封面、AI 设置推荐、剧本列表、小说大纲/章节、漫画、短视频能力。
//
// 契约（大小写各异，逐个回放）：
//   POST /api/projects/suggest-settings        → { suggestions:{visualStyle,visualStylePrompt,storyStyle,storyConstraints} }
//   POST /api/projects/generate-cover          → { cover_url, prompt }（snake）
//   POST /api/projects/:id/cover               → { message, coverUrl }（camel，FormData 'cover' 二进制）
//   POST /api/projects/:id/cover/crop          → { message, coverUrl }（{sourceUrl,crop}）
//   GET  /api/projects/:id/scripts             → { scripts }
//   GET/POST /api/projects/:id/novel/outlines[/:oid] / +/generate
//   GET/POST /api/projects/:id/novel/chapters[/:cid]
//   GET  /api/projects/:id/manga/episodes      → { episodes }
//   GET/PUT /api/projects/:id/manga/scripts/:ep → { content }
//   GET  /api/projects/:id/manga/pages?episode= → { pages }
//   GET/PUT /api/projects/:id/video/script      → { content,title,duration }
//   POST /api/projects/:id/video/script/generate → { content }
//   GET/PUT /api/projects/:id/video/clips       → { clips }
//   GET/PUT /api/projects/:id/video/effects     → { effects }
//
// manga/video 落在工程目录的 project_workspace.json；novel 复用 localNovels 的 novels.json。

import { readDoc, writeDoc, resolveLocalPath, getActiveProjectPath, getActiveProjectId } from './localStore';
import { jsonResponse, pickTextModel, pickImageModel, chatJson } from './localAssetShared';
import { persistGeneratedMedia } from './localMedia';
import { chatText, generateImage } from './localAI';
import { loadNovelDoc, saveNovelDoc } from './localNovels';
import { resolveScriptReferences } from './localScripts';

// ==================== 视觉风格预设（与前端 Projects.tsx 键名一致） ====================
const VISUAL_STYLE_PRESETS: Record<string, string> = {
  animeJapanese: '动漫风格, 赛璐珞上色, 鲜艳色彩, 干净线条, 漫画美学, 日式动画',
  realisticFilm: '照片写实, 电影级打光, 胶片质感, 真实比例, 电影剧照, 自然色调',
  render3D: '3D渲染, 皮克斯风格, 柔和光照, 次表面散射, 平滑着色, CG品质',
  pixar3D: '3D渲染, 皮克斯动画风格, 圆润可爱角色造型, 柔和光照, 次表面散射, 大眼睛萌感, 鲜艳饱和色调, 毛发与布料细节质感, 美式家庭动画电影感',
  disney3D: '3D渲染, 迪士尼CG动画风格, 精致五官, 梦幻光影, 童话公主质感, 优雅身型, 光滑高光表面, 明亮鲜亮色调, 高品质迪士尼CG美学',
  chinese3D: '3D渲染, 国漫CG风格, 东方美学, 水墨质感与CG融合, 仙侠飘逸氛围, 华丽东方特效, 中国神话元素, 古风服饰, 哪吒白蛇类国产动画质感',
  anime3D: '3D渲染, 日式赛璐珞3D风格, 二次元线条感, 动漫大眼睛, 平涂阴影, 2D化3D质感, 日本动画CG美学, 鬼灭之刃类风格',
  watercolor: '水彩插画, 柔和边缘, 粉彩色调, 绘本风格, 手绘纹理',
  cyberpunk: '赛博朋克, 霓虹灯光, 暗黑氛围, 未来科幻, 高对比度, 科幻美学',
  americanComic: '美式漫画风格, 粗犷描边, 动感明暗, 超级英雄美学, 鲜明色彩',
  pixelArt: '像素画风格, 复古游戏美学, 16位像素, 干净像素点, 怀旧风',
  chineseInk: '中国水墨画风格, 传统笔触, 典雅, 留白极简, 东方美学',
  shoujoManga: '日本少女漫画风格, 大而闪亮的星光瞳孔, 精致美少女特征, 柔粉淡紫色调, 花卉网点背景, 浪漫氛围, 飘逸秀发配缎带, 装饰性闪光特效, 柔和腮红, 梦幻柔焦光效',
  fashionPhoto: '高端时尚大片, 精致灯光, 杂志封面品质, 人像摄影, 柔和散射光, 色彩协调',
  documentary: '纪实摄影, 自然光线, 真实场景, 新闻纪录片美学, 抓拍感, 真实光影',
  cinematicDrama: '电影色调, 宽银幕构图, 戏剧性光影, 胶片颗粒感, 质感电影画面, cinematic lighting',
};

// ==================== 工程路径 / 二进制助手 ====================

async function resolvePath(projectId?: number | string | null): Promise<string | null> {
  if (projectId !== undefined && projectId !== null && projectId !== '') {
    const id = Number(projectId);
    if (Number.isFinite(id)) {
      const p = await resolveLocalPath(id);
      if (p) return p;
    }
  }
  return getActiveProjectPath();
}

/** File → base64 data URL（供 download_media_file 落地工程 media/） */
async function fileToDataUrl(file: File | Blob, fallbackMime = 'image/png'): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const mime = ((file as File).type || fallbackMime).split(';')[0];
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(undefined, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/** 前端 canvas 裁剪，产出 PNG data URL；跨域污染或加载失败时抛错（调用方降级）。 */
async function cropImageToDataUrl(sourceUrl: string, crop: { x: number; y: number; width: number; height: number }): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('无 canvas 环境'));
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(crop.width));
        canvas.height = Math.max(1, Math.round(crop.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('无 canvas 上下文'));
        ctx.drawImage(
          img,
          Math.max(0, crop.x), Math.max(0, crop.y), Math.max(1, crop.width), Math.max(1, crop.height),
          0, 0, canvas.width, canvas.height,
        );
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('原图加载失败'));
    img.src = sourceUrl;
  });
}

// ==================== project_workspace 文档 ====================

interface WorkspaceDoc {
  manga: { episodes: any[]; scripts: Record<string, string>; pages: Record<string, any[]> };
  video: { script: { content?: string; title?: string; duration?: number }; clips: any[]; effects: any[] };
}

const EMPTY_WORKSPACE: WorkspaceDoc = {
  manga: { episodes: [], scripts: {}, pages: {} },
  video: { script: {}, clips: [], effects: [] },
};

async function loadWorkspace(path: string): Promise<WorkspaceDoc> {
  const raw = await readDoc<Partial<WorkspaceDoc>>(path, 'projectWorkspace', {});
  const manga = raw.manga || EMPTY_WORKSPACE.manga;
  const video = raw.video || EMPTY_WORKSPACE.video;
  return {
    manga: {
      episodes: Array.isArray(manga.episodes) ? manga.episodes : [],
      scripts: manga.scripts && typeof manga.scripts === 'object' ? manga.scripts : {},
      pages: manga.pages && typeof manga.pages === 'object' ? manga.pages : {},
    },
    video: {
      script: video.script && typeof video.script === 'object' ? video.script : {},
      clips: Array.isArray(video.clips) ? video.clips : [],
      effects: Array.isArray(video.effects) ? video.effects : [],
    },
  };
}
function saveWorkspace(path: string, doc: WorkspaceDoc): void {
  writeDoc(path, 'projectWorkspace', doc);
}

// ==================== 封面 ====================

async function handleCoverUpload(projectId: number, body: any): Promise<Response> {
  const file = body?._files?.cover as File | undefined;
  if (!file) return jsonResponse({ message: '请选择要上传的封面图片' }, 400);
  let coverUrl: string;
  try {
    const dataUrl = await fileToDataUrl(file);
    coverUrl = await persistGeneratedMedia(projectId, dataUrl, 'cover.png');
  } catch (err: any) {
    return jsonResponse({ message: '封面上传失败：' + (err?.message || err) }, 500);
  }
  const path = await resolvePath(projectId);
  if (path) {
    const cov = await readDoc<{ coverUrl?: string }>(path, 'projectCover', {});
    writeDoc(path, 'projectCover', { ...cov, coverUrl });
  }
  return jsonResponse({ message: '封面上传成功', coverUrl });
}

async function handleCoverCrop(projectId: number, body: any): Promise<Response> {
  const sourceUrl = body?.sourceUrl;
  const crop = body?.crop;
  if (!sourceUrl || !crop || typeof crop.x !== 'number' || typeof crop.y !== 'number'
    || typeof crop.width !== 'number' || typeof crop.height !== 'number') {
    return jsonResponse({ message: '缺少 sourceUrl 或 crop 坐标参数' }, 400);
  }
  let coverUrl = String(sourceUrl);
  try {
    const dataUrl = await cropImageToDataUrl(String(sourceUrl), crop);
    coverUrl = await persistGeneratedMedia(projectId, dataUrl, 'cover_crop.png');
  } catch {
    // 裁剪不可用（跨域污染/无 canvas）：降级沿用原图地址，保证 UI 不阻塞
  }
  const path = await resolvePath(projectId);
  if (path) {
    const cov = await readDoc<{ coverUrl?: string }>(path, 'projectCover', {});
    writeDoc(path, 'projectCover', { ...cov, coverUrl });
  }
  return jsonResponse({ message: '封面裁剪成功', coverUrl });
}

async function handleGenerateCover(body: any): Promise<Response> {
  const { name, description, visualStylePrompt, storyStyle, storyConstraints } = body || {};
  if (!name && !description) return jsonResponse({ message: '请提供项目名称或描述' }, 400);

  const textModel = await pickTextModel(body?.modelName);
  if (!textModel) return jsonResponse({ message: '没有可用的文本模型' }, 500);
  const styleHint = visualStylePrompt ? `\nVisual style: ${visualStylePrompt}` : '';
  const storyStyleHint = storyStyle ? `\nNarrative style: ${storyStyle}` : '';
  const constraintsHint = storyConstraints ? `\nStory constraints: ${storyConstraints}` : '';
  const promptForCover = `You are a professional illustrator prompt engineer. Generate a concise English prompt for an AI image model to create a visually striking cover/poster image for the following project.\n\nProject name: ${name || 'Untitled'}\nProject description: ${description || 'No description'}${styleHint}${storyStyleHint}${constraintsHint}\n\nRequirements:\n1. Describe a single iconic scene that captures the essence of the project\n2. Include composition, lighting, color palette, and mood descriptors\n3. DO NOT include any text/title/words in the image\n4. Keep the prompt between 50-100 words\n5. Return ONLY the prompt text, no explanations`;

  let coverPrompt = '';
  try {
    const textResult = await chatText({ model: textModel, temperature: 0.7, messages: [{ role: 'user', content: promptForCover }] });
    coverPrompt = (textResult.content || '').replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();
  } catch (err: any) {
    return jsonResponse({ message: '封面提示词生成失败: ' + (err?.message || err) }, 500);
  }

  const imageModel = await pickImageModel(body?.imageModel);
  if (!imageModel) return jsonResponse({ message: '没有可用的图片模型' }, 500);
  let raw: string | null = null;
  try {
    const imgResult = await generateImage({ model: imageModel, prompt: coverPrompt, aspectRatio: '1:1' });
    raw = imgResult.url || (imgResult.b64 ? `data:image/png;base64,${imgResult.b64}` : null);
  } catch (err: any) {
    return jsonResponse({ message: '图片生成失败: ' + (err?.message || err) }, 500);
  }
  if (!raw) return jsonResponse({ message: '图片生成成功但未返回图片地址' }, 500);

  const activeId = getActiveProjectId();
  let coverUrl = raw;
  if (activeId) {
    try {
      coverUrl = await persistGeneratedMedia(activeId, raw, 'cover.png');
      const path = await resolvePath(activeId);
      if (path) {
        const cov = await readDoc<{ coverUrl?: string }>(path, 'projectCover', {});
        writeDoc(path, 'projectCover', { ...cov, coverUrl });
      }
    } catch {
      coverUrl = raw;
    }
  }
  return jsonResponse({ cover_url: coverUrl, prompt: coverPrompt });
}

// ==================== 设置推荐 ====================

async function handleSuggestSettings(body: any): Promise<Response> {
  const name = body?.name;
  const description = body?.description;
  if (!name && !description) return jsonResponse({ message: '请提供项目名称或描述' }, 400);
  const model = await pickTextModel(body?.modelName);
  const styleKeys = Object.keys(VISUAL_STYLE_PRESETS).filter((k) => k !== 'custom');
  if (!model) {
    return jsonResponse({ suggestions: { visualStyle: 'animeJapanese', visualStylePrompt: VISUAL_STYLE_PRESETS.animeJapanese, storyStyle: '热血少年漫', storyConstraints: '' } });
  }
  const prompt = `你是一个专业的动漫/影视项目顾问。请根据以下项目信息，推荐最合适的风格设置。\n\n项目名称：${name || '未提供'}\n项目描述：${description || '未提供'}\n\n可选的视觉风格键：${styleKeys.join('、')}\n\n请以JSON格式返回，格式如下：\n{\n  "visualStyle": "推荐的视觉风格键（必须严格从可选列表中选择）",\n  "storyStyle": "推荐的叙事风格",\n  "storyConstraints": "推荐的剧本约束（简短一句话）"\n}\n只返回JSON，不要有其他文字说明。`;
  let suggestions: any = null;
  try {
    suggestions = await chatJson(model, '你是专业的项目风格顾问，只输出JSON。', prompt);
  } catch {
    suggestions = null;
  }
  if (!suggestions || typeof suggestions !== 'object') {
    suggestions = { visualStyle: 'animeJapanese', storyStyle: '热血少年漫', storyConstraints: '' };
  }
  if (!VISUAL_STYLE_PRESETS[suggestions.visualStyle]) suggestions.visualStyle = 'animeJapanese';
  suggestions.visualStylePrompt = VISUAL_STYLE_PRESETS[suggestions.visualStyle] || '';
  return jsonResponse({
    suggestions: {
      visualStyle: suggestions.visualStyle,
      visualStylePrompt: suggestions.visualStylePrompt,
      storyStyle: suggestions.storyStyle || '热血少年漫',
      storyConstraints: suggestions.storyConstraints || '',
    },
  });
}

// ==================== 剧本列表 ====================

async function handleProjectScripts(projectId: number): Promise<Response> {
  const path = await resolvePath(projectId);
  if (!path) return jsonResponse({ scripts: [] });
  const doc = await readDoc<{ nextId?: number; scripts?: any[] }>(path, 'scripts', { nextId: 1, scripts: [] });
  const scripts = Array.isArray(doc.scripts) ? doc.scripts : [];
  const hydrated = await resolveScriptReferences(scripts as any);
  return jsonResponse({ scripts: hydrated });
}

// ==================== 小说大纲 / 章节（复用 novels.json） ====================

const normKeys = (b: any) => b && typeof b === 'object' ? b : {};

async function handleNovelOutlines(path: string, projectId: number, rest: string, m: string, body: any): Promise<Response | null> {
  const doc = await loadNovelDoc(path);
  // /generate
  if (rest === '/generate' && m === 'POST') {
    const model = await pickTextModel(body?.modelName);
    const now = new Date().toISOString();
    let generated: any = null;
    if (model) {
      const aiPrompt = `请为以下小说项目生成一个详细的大纲：\n\n项目描述：${body?.prompt || doc.project?.plot_summary || '暂无描述'}\n${body?.genre ? `类型：${body.genre}\n` : ''}${body?.tone ? `风格：${body.tone}\n` : ''}\n\n请生成JSON格式：\n{\n  "title": "大纲标题",\n  "content": "大纲详细内容",\n  "structure": { "acts": [ { "name": "第一幕", "summary": "内容", "chapters": ["章节1"] } ] }\n}\n只返回JSON。`;
      try { generated = await chatJson(model, '你是专业小说策划，只输出JSON。', aiPrompt); } catch { generated = null; }
    }
    const outline = {
      id: doc.nextOutlineId++,
      project_id: projectId,
      title: generated?.title || 'AI生成大纲',
      content: generated?.content || '',
      structure: generated?.structure || {},
      is_ai_generated: 1,
      sort_order: doc.outlines.length,
      created_at: now,
      updated_at: now,
    };
    doc.outlines.push(outline);
    saveNovelDoc(path, doc);
    return jsonResponse({ message: '大纲生成成功', outline, outlines: doc.outlines });
  }
  // 列表 / 创建
  if (!rest) {
    if (m === 'GET') {
      const list = doc.outlines.slice().sort((a: any, b: any) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
      return jsonResponse({ outlines: list });
    }
    if (m === 'POST') {
      const now = new Date().toISOString();
      const incoming = normKeys(body);
      const outline = {
        ...incoming,
        id: doc.nextOutlineId++,
        project_id: projectId,
        title: incoming.title || '未命名大纲',
        content: incoming.content || '',
        structure: incoming.structure || {},
        created_at: incoming.created_at || now,
        updated_at: now,
      };
      doc.outlines.push(outline);
      saveNovelDoc(path, doc);
      return jsonResponse({ message: '大纲创建成功', outline });
    }
    return jsonResponse({ message: 'method not allowed' }, 405);
  }
  // /:oid
  const idm = rest.match(/^\/(\d+)$/);
  if (idm) {
    const oid = Number(idm[1]);
    const idx = doc.outlines.findIndex((o: any) => Number(o.id) === oid);
    if (m === 'PUT') {
      if (idx === -1) return jsonResponse({ message: '大纲不存在' }, 404);
      const prev = doc.outlines[idx];
      const incoming = normKeys(body);
      const outline = { ...prev, ...incoming, id: oid, project_id: projectId, updated_at: new Date().toISOString() };
      doc.outlines[idx] = outline;
      saveNovelDoc(path, doc);
      return jsonResponse({ message: '大纲更新成功', outline });
    }
    if (m === 'DELETE') {
      if (idx !== -1) doc.outlines.splice(idx, 1);
      saveNovelDoc(path, doc);
      return jsonResponse({ message: '大纲删除成功' });
    }
  }
  return null;
}

async function handleNovelChapters(path: string, projectId: number, rest: string, m: string, body: any): Promise<Response | null> {
  const doc = await loadNovelDoc(path);
  if (!rest) {
    if (m === 'GET') {
      const list = doc.chapters.slice().sort((a: any, b: any) => (Number(a.chapter_number) || 0) - (Number(b.chapter_number) || 0));
      return jsonResponse({ chapters: list });
    }
    if (m === 'POST') {
      const now = new Date().toISOString();
      const incoming = normKeys(body);
      let chapterNum = incoming.chapter_number;
      if (!chapterNum) {
        chapterNum = doc.chapters.reduce((mx: number, c: any) => Math.max(mx, Number(c.chapter_number) || 0), 0) + 1;
      }
      const chapter = {
        ...incoming,
        id: doc.nextChapterId++,
        project_id: projectId,
        outline_id: incoming.outline_id ?? null,
        chapter_number: chapterNum,
        title: incoming.title || `第${chapterNum}章`,
        content: incoming.content || '',
        status: incoming.status || 'draft',
        word_count: incoming.word_count || 0,
        created_at: incoming.created_at || now,
        updated_at: now,
      };
      doc.chapters.push(chapter);
      saveNovelDoc(path, doc);
      return jsonResponse({ message: '章节创建成功', chapter });
    }
    return jsonResponse({ message: 'method not allowed' }, 405);
  }
  const idm = rest.match(/^\/(\d+)$/);
  if (idm) {
    const cid = Number(idm[1]);
    const idx = doc.chapters.findIndex((c: any) => Number(c.id) === cid);
    if (m === 'PUT') {
      if (idx === -1) return jsonResponse({ message: '章节不存在' }, 404);
      const prev = doc.chapters[idx];
      const incoming = normKeys(body);
      const chapter = {
        ...prev, ...incoming, id: cid, project_id: projectId,
        status: incoming.status ?? prev.status ?? 'draft',
        word_count: incoming.word_count ?? prev.word_count ?? 0,
        updated_at: new Date().toISOString(),
      };
      doc.chapters[idx] = chapter;
      saveNovelDoc(path, doc);
      return jsonResponse({ message: '章节更新成功', chapter });
    }
    if (m === 'DELETE') {
      if (idx !== -1) doc.chapters.splice(idx, 1);
      saveNovelDoc(path, doc);
      return jsonResponse({ message: '章节删除成功' });
    }
  }
  return null;
}

// ==================== 漫画 ====================

async function handleManga(path: string, rest: string, m: string, body: any): Promise<Response | null> {
  const ws = await loadWorkspace(path);
  if (rest === '/episodes' && m === 'GET') {
    const episodes = ws.manga.episodes.length
      ? ws.manga.episodes
      : [{ number: 1, title: '第1话', pageCount: 0 }];
    return jsonResponse({ episodes });
  }
  const scriptm = rest.match(/^\/scripts\/(\d+)$/);
  if (scriptm) {
    const ep = scriptm[1];
    if (m === 'GET') return jsonResponse({ content: ws.manga.scripts[ep] || '' });
    if (m === 'PUT') {
      ws.manga.scripts[ep] = String(body?.content ?? '');
      if (!ws.manga.episodes.some((e: any) => Number(e.number) === Number(ep))) {
        ws.manga.episodes.push({ number: Number(ep), title: `第${ep}话`, pageCount: 0 });
      }
      saveWorkspace(path, ws);
      return jsonResponse({ message: '保存成功' });
    }
  }
  if (rest.startsWith('/pages') && m === 'GET') {
    const ep = String(body?.episode ?? ws.manga.episodes[0]?.number ?? 1);
    return jsonResponse({ pages: ws.manga.pages[ep] || [] });
  }
  return null;
}

// ==================== 短视频 ====================

async function handleVideo(path: string, projectId: number, rest: string, m: string, body: any): Promise<Response | null> {
  const ws = await loadWorkspace(path);
  if (rest === '/script') {
    if (m === 'GET') return jsonResponse({ content: ws.video.script.content || '', title: ws.video.script.title || '', duration: ws.video.script.duration || 60 });
    if (m === 'PUT') {
      ws.video.script = { ...ws.video.script, content: body?.content ?? ws.video.script.content, title: body?.title ?? ws.video.script.title, duration: body?.duration ?? ws.video.script.duration };
      saveWorkspace(path, ws);
      return jsonResponse({ message: '保存成功' });
    }
  }
  if (rest === '/script/generate' && m === 'POST') {
    const title = body?.title || '';
    const duration = body?.duration || 60;
    const model = await pickTextModel(body?.modelName);
    let content = '';
    if (model) {
      const prompt = `请为主题「${title}」生成一个时长约 ${duration} 秒的短视频脚本，包含开场、正文、结尾三段，每段给出画面描述与旁白/字幕。直接输出脚本正文。`;
      try {
        const r = await chatText({ model, temperature: 0.7, messages: [{ role: 'user', content: prompt }] });
        content = r.content || '';
      } catch {
        content = '';
      }
    }
    if (!content) {
      content = `【短视频脚本】${title}\n时长：${duration}秒\n\n=== 开场 (0-5秒) ===\n画面：开场画面描述\n旁白/字幕：开场语\n\n=== 正文 (5-${duration - 10}秒) ===\n画面：主要内容画面\n旁白/字幕：主要内容解说\n\n=== 结尾 (${duration - 10}-${duration}秒) ===\n画面：结束画面\n旁白/字幕：结束语/行动号召`;
    }
    ws.video.script = { ...ws.video.script, content, title: ws.video.script.title || title, duration };
    saveWorkspace(path, ws);
    return jsonResponse({ content });
  }
  if (rest === '/clips') {
    if (m === 'GET') return jsonResponse({ clips: ws.video.clips });
    if (m === 'PUT') {
      ws.video.clips = Array.isArray(body?.clips) ? body.clips : [];
      saveWorkspace(path, ws);
      return jsonResponse({ message: '保存成功' });
    }
  }
  if (rest === '/effects') {
    if (m === 'GET') return jsonResponse({ effects: ws.video.effects });
    if (m === 'PUT') {
      ws.video.effects = Array.isArray(body?.effects) ? body.effects : [];
      saveWorkspace(path, ws);
      return jsonResponse({ message: '保存成功' });
    }
  }
  return null;
}

// ==================== 路由入口 ====================

export async function routeProjectsSub(url: URL, method: string, body: any): Promise<Response | null> {
  const pathname = url.pathname;
  const m = method.toUpperCase();
  let mt: RegExpMatchArray | null;

  // 非工程维度的静态端点（无 :id）
  if (pathname === '/api/projects/suggest-settings' && m === 'POST') return handleSuggestSettings(body || {});
  if (pathname === '/api/projects/generate-cover' && m === 'POST') return handleGenerateCover(body || {});

  // /api/projects/:id/<sub>
  if ((mt = pathname.match(/^\/api\/projects\/(\d+)(\/.*)?$/))) {
    const projectId = Number(mt[1]);
    const sub = mt[2] || '';
    if (!sub) return null;

    if (sub === '/cover' && m === 'POST') return handleCoverUpload(projectId, body || {});
    if (sub === '/cover/crop' && m === 'POST') return handleCoverCrop(projectId, body || {});
    if (sub === '/scripts' && m === 'GET') return handleProjectScripts(projectId);

    const path = await resolvePath(projectId);
    if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);

    if (sub.startsWith('/novel/outlines')) return handleNovelOutlines(path, projectId, sub.slice('/novel/outlines'.length), m, body || {});
    if (sub.startsWith('/novel/chapters')) return handleNovelChapters(path, projectId, sub.slice('/novel/chapters'.length), m, body || {});

    if (sub.startsWith('/manga')) {
      const res = await handleManga(path, sub.slice('/manga'.length), m, body || {});
      if (res) return res;
    }
    if (sub.startsWith('/video')) {
      const res = await handleVideo(path, projectId, sub.slice('/video'.length), m, body || {});
      if (res) return res;
    }
    return null;
  }

  return null;
}
