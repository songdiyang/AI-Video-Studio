/**
 * 工程内可查看图片索引与 view_image 定位（纯函数，可单测）。
 *
 * 从 AIAssistantPanel/index.tsx 抽出：面板只负责把 props 传进来并 memo，
 * 「按 sceneId / urls / scope / keyword 定位图片」的规则在这里集中维护，
 * 避免巨型组件里再散落一份定位语义。
 */

export interface ProjectImageEntry {
  group: '角色' | '场景库' | '分镜地点' | '道具' | '分镜';
  label: string;
  url: string;
  id?: number;
}

export interface ImageIndexSources {
  characters?: Array<{ name?: string; image_url?: string }>;
  studios?: Array<{ name?: string; cover_image_url?: string; nine_grid_image_url?: string }>;
  locations?: Array<{ name?: string; image_url?: string }>;
  props?: Array<{ name?: string; image_url?: string }>;
  scenes?: Array<{ id: number; index?: number; first_frame_url?: string; last_frame_url?: string }>;
}

export function buildProjectImageIndex(src: ImageIndexSources): ProjectImageEntry[] {
  const out: ProjectImageEntry[] = [];
  (src.characters || []).forEach((c) => {
    if (c.image_url) out.push({ group: '角色', label: `角色「${c.name}」主图`, url: c.image_url });
  });
  (src.studios || []).forEach((s) => {
    if (s.cover_image_url) out.push({ group: '场景库', label: `场景「${s.name}」封面`, url: s.cover_image_url });
    if (s.nine_grid_image_url) out.push({ group: '场景库', label: `场景「${s.name}」九宫格`, url: s.nine_grid_image_url });
  });
  (src.locations || []).forEach((l) => {
    if (l.image_url) out.push({ group: '分镜地点', label: `地点「${l.name}」图`, url: l.image_url });
  });
  (src.props || []).forEach((p) => {
    if (p.image_url) out.push({ group: '道具', label: `道具「${p.name}」图`, url: p.image_url });
  });
  (src.scenes || []).forEach((s) => {
    if (s.first_frame_url) out.push({ group: '分镜', label: `分镜#${s.index} 首帧`, url: s.first_frame_url, id: s.id });
    if (s.last_frame_url && s.last_frame_url !== s.first_frame_url) {
      out.push({ group: '分镜', label: `分镜#${s.index} 尾帧`, url: s.last_frame_url, id: s.id });
    }
  });
  return out;
}

/** 按 sceneId / urls / scope / keyword 定位待看的图片（sceneId 只对应分镜，避免与资产 id 歧义） */
export function resolveImageTargets(
  params: any,
  ctx: {
    index: ProjectImageEntry[];
    scenes?: Array<{ id: number }>;
    currentFrameId?: number | null;
  },
): Array<{ label: string; url: string }> {
  const explicit: string[] = Array.isArray(params?.urls)
    ? params.urls.filter((u: any) => typeof u === 'string' && u.trim())
    : (typeof params?.url === 'string' && params.url.trim() ? [params.url.trim()] : []);
  if (explicit.length > 0) {
    return explicit.slice(0, 6).map((u, i) => {
      const known = ctx.index.find((e) => e.url === u);
      return { label: known?.label || `图片${i + 1}`, url: u };
    });
  }
  const sceneId = Number(params?.sceneId) || Number(ctx.currentFrameId) || 0;
  if (sceneId) {
    const frames = ctx.index.filter((e) => e.group === '分镜' && e.id === sceneId);
    if (frames.length > 0) return frames.slice(0, 4).map((f) => ({ label: f.label, url: f.url }));
    const target = (ctx.scenes || []).find((s) => s.id === sceneId);
    if (target || ctx.currentFrameId === sceneId) return []; // 分镜存在但尚无画面
  }
  const SCOPE_ALIAS: Record<string, string> = {
    character: '角色', characters: '角色', studio: '场景库', studios: '场景库',
    location: '分镜地点', locations: '分镜地点', prop: '道具', props: '道具',
    storyboard: '分镜', storyboards: '分镜', frame: '分镜', frames: '分镜',
  };
  const group = SCOPE_ALIAS[String(params?.scope || '').trim().toLowerCase()];
  if (params?.scope && !group && String(params.scope).trim().toLowerCase() !== 'all') {
    return [];
  }
  const keyword = String(params?.keyword || '').trim().toLowerCase();
  const cap = Math.min(Math.max(Number(params?.max) || 4, 1), 6);
  const matched = ctx.index.filter((e) => {
    if (group && e.group !== group) return false;
    if (keyword && !e.label.toLowerCase().includes(keyword)) return false;
    return true;
  });
  return matched.slice(0, cap);
}