// 道具资产的本地路由 —— 补齐道具图生成入口
//
// 为什么单独有这个文件：/api/props/{id}/generate-image 与 /generate-views 是云端契约里的
// 道具出图入口，本地化后从未实现。未命中的请求被 localApiRouter 兜底成 HTTP 200 + 空对象，
// 调用方（资源面板「新建道具后生成设定图」、AI 助手动作）只判断 response.ok，
// 于是拿到空响应、jobId 是 undefined，看起来成功、实际 props.json 里永远没有 image_url。
// 而出图门禁的口径是「道具已入库就必须有道具图」——缺这个端点就等于把用户堵死，
// 所以必须真实实现，而不是让门禁放行一张凭空画的道具。
//
// 产物形态：一张道具设定图写回 image_url（同时写 front_view_url，与门禁读取的字段一致）。

import { readDoc, writeDoc } from './localStore';
import {
  jsonResponse,
  resolvePath,
  assertProject,
  findById,
  genImageToUrl,
  submitGenJob,
} from './localAssetShared';

interface PropItem {
  id: number;
  name?: string;
  description?: string;
  category?: string;
  [k: string]: unknown;
}

interface PropsDoc {
  nextId: number;
  props: PropItem[];
}

async function loadProps(path: string): Promise<PropsDoc> {
  const doc = await readDoc<Partial<PropsDoc>>(path, 'props', {});
  return { nextId: Number(doc.nextId) || 1, props: Array.isArray(doc.props) ? doc.props : [] };
}

function saveProps(path: string, doc: PropsDoc): void {
  writeDoc(path, 'props', doc);
}

/**
 * 道具设定图提示词：道具名 + 描述 + 影棚式约束。
 * 约束的目的是让道具图能当参考图用：单一物体、干净背景、不含人物与场景，
 * 否则模型会把道具画进某个剧情画面，后续分镜参考时就失效了。
 */
export function buildPropImagePrompt(prop: PropItem, opts: { multiView?: boolean } = {}): string {
  const name = String(prop?.name || '').trim();
  const desc = String(prop?.description || '').trim();
  const category = String(prop?.category || '').trim();
  const subject = [name ? `道具「${name}」` : '', category, desc].filter(Boolean).join('，');
  if (!subject) return '';
  const views = opts.multiView
    ? '同一道具的正面、侧面、俯视三个视角排布在一张设定图中，各视角为同一件物品、尺寸比例一致'
    : '单一道具居中特写，完整呈现整体造型';
  return `${subject}。道具设定图，${views}；纯中性背景，无人物、无手持、无场景、无文字与水印，材质、磨损与结构细节清晰`;
}

async function handlePropGenerate(
  propId: number,
  body: any,
  multiView: boolean,
): Promise<Response> {
  const path = await resolvePath(body?.project_id ?? body?.projectId);
  if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
  const doc = await loadProps(path);
  const prop = findById(doc.props, propId);
  if (!prop || !assertProject(prop, path)) return jsonResponse({ message: '道具不存在' }, 404);

  const prompt = buildPropImagePrompt(prop, { multiView });
  if (!prompt) {
    return jsonResponse({ message: '道具缺少名称与描述，无法生成道具图，请先补全 description' }, 400);
  }

  const projectId = Number(prop.project_id) || 0;
  const refs = Array.isArray(body?.refImageUrls)
    ? body.refImageUrls.filter((u: unknown): u is string => typeof u === 'string' && !!u)
    : undefined;

  prop.generation_status = 'generating';
  saveProps(path, doc);

  const jobId = submitGenJob({
    workflowType: 'prop_views_generation',
    workflowName: multiView ? '道具设定图（三视图）生成' : '道具图片生成',
    projectId,
    inputParams: { propId, imageModel: body?.imageModel, propName: prop.name },
    run: async () => {
      const url = await genImageToUrl({
        imageModel: body?.imageModel,
        prompt,
        projectId,
        nameHint: `prop${propId}`,
        refImageUrls: refs,
        aspectRatio: body?.aspectRatio || '1:1',
      });
      const d2 = await loadProps(path);
      const p2 = findById(d2.props, propId);
      if (p2) {
        p2.image_url = url;
        if (multiView || !p2.front_view_url) p2.front_view_url = url;
        p2.generation_status = 'completed';
        p2.updated_at = new Date().toISOString();
        saveProps(path, d2);
      }
      return { image_url: url };
    },
  });

  return jsonResponse({ message: 'generating', jobId, propId, status: 'generating' });
}

/**
 * 接管道具的特殊子路径（出图）。其余道具 CRUD 仍由 localApiRouter 原处理器负责。
 * 未命中返回 null 交回通用路由。
 */
export async function routeProps(url: URL, method: string, body: any): Promise<Response | null> {
  const p = url.pathname;
  const m = method.toUpperCase();
  let mt: RegExpMatchArray | null;

  if ((mt = p.match(/^\/api\/props\/(\d+)\/generate-views$/)) && m === 'POST') {
    return handlePropGenerate(Number(mt[1]), body || {}, true);
  }
  if ((mt = p.match(/^\/api\/props\/(\d+)\/generate-image$/)) && m === 'POST') {
    return handlePropGenerate(Number(mt[1]), body || {}, false);
  }
  return null;
}
