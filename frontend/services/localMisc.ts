// 杂项本地路由（reference-images / upload / users / stats）
//
// 覆盖核心生产域中零散但被实际调用的端点：
//   /api/reference-images        资产参考图（asset_type + asset_id 作用域，落在 referenceImages 文档）
//   /api/upload[/status|/general] 文件上传（走 XHR，二进制经 localMedia 落地工程 media/）
//   /api/users/*                 本地身份资料（localStorage，无账号体系，默认返回本地档案）
//   /api/stats/dashboard         仪表盘统计（聚合本地工程）
//
// 契约大小写/包裹差异逐个回放（见各 handler）。

import { readDoc, writeDoc, getActiveProjectId } from './localStore';
import { jsonResponse, resolvePath } from './localAssetShared';
import { persistGeneratedMedia } from './localMedia';
import { fetchLocalProjects } from './projects';

// ==================== 通用助手 ====================

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

interface RefDoc { nextId: number; items: any[] }
async function loadRefDoc(path: string): Promise<RefDoc> {
  const raw = await readDoc<Partial<RefDoc>>(path, 'referenceImages', {});
  const items = Array.isArray(raw.items) ? raw.items : [];
  const maxId = items.reduce((mx: number, it: any) => Math.max(mx, Number(it?.id) || 0), 0);
  return { nextId: Math.max(Number(raw.nextId) || 1, maxId + 1), items };
}
function refSort(items: any[]): any[] {
  return items.slice().sort((a, b) => {
    const sa = Number(a?.sort_order) || 0;
    const sb = Number(b?.sort_order) || 0;
    if (sa !== sb) return sa - sb;
    return String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
  });
}

// ==================== 参考图 ====================

async function routeReferenceImages(url: URL, m: string, body: any): Promise<Response | null> {
  const pathname = url.pathname;
  if (pathname !== '/api/reference-images' && !pathname.startsWith('/api/reference-images/')) return null;
  // 归属解析：显式 projectId（body/query）优先，兜底活动工程
  const path = await resolvePath(body?.project_id ?? body?.projectId ?? url.searchParams.get('projectId') ?? url.searchParams.get('project_id'));

  // 批量重排序（非数字段，先于 /:id）
  if (pathname === '/api/reference-images/batch-reorder' && m === 'PUT') {
    if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
    const doc = await loadRefDoc(path);
    const orders: any[] = Array.isArray(body?.orders) ? body.orders : [];
    for (const o of orders) {
      const it = doc.items.find((x: any) => Number(x.id) === Number(o.id));
      if (it) it.sort_order = Number(o.sort_order) || 0;
    }
    writeDoc(path, 'referenceImages', doc);
    return jsonResponse({ message: '排序更新成功' });
  }

  if (pathname === '/api/reference-images') {
    if (m === 'GET') {
      if (!path) return jsonResponse({ images: [] });
      const doc = await loadRefDoc(path);
      const assetType = url.searchParams.get('asset_type');
      const assetId = url.searchParams.get('asset_id');
      const enabledOnly = url.searchParams.get('enabled_only') === 'true';
      let items = doc.items;
      if (assetType) items = items.filter((it: any) => String(it.asset_type) === assetType);
      if (assetId) items = items.filter((it: any) => String(it.asset_id) === String(assetId));
      if (enabledOnly) items = items.filter((it: any) => it.is_enabled !== false);
      return jsonResponse({ images: refSort(items) });
    }
    if (m === 'POST') {
      if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
      const doc = await loadRefDoc(path);
      const now = new Date().toISOString();
      const scopedCount = doc.items.filter((it: any) => String(it.asset_type) === String(body?.asset_type) && String(it.asset_id) === String(body?.asset_id)).length;
      const image = {
        id: doc.nextId++,
        asset_type: body?.asset_type,
        asset_id: Number(body?.asset_id) || 0,
        image_url: body?.image_url || '',
        description: body?.description ?? null,
        view_type: body?.view_type || 'other',
        sort_order: body?.sort_order ?? scopedCount,
        is_enabled: body?.is_enabled !== false,
        created_at: now,
        updated_at: now,
      };
      doc.items.push(image);
      writeDoc(path, 'referenceImages', doc);
      return jsonResponse({ message: '参考图上传成功', image }, 201);
    }
    return jsonResponse({ message: 'method not allowed' }, 405);
  }

  // /api/reference-images/:id
  const idm = pathname.match(/^\/api\/reference-images\/(\d+)$/);
  if (idm) {
    if (!path) return jsonResponse({ message: '未打开本地工程' }, 400);
    const doc = await loadRefDoc(path);
    const id = Number(idm[1]);
    const idx = doc.items.findIndex((it: any) => Number(it.id) === id);
    if (m === 'PUT') {
      if (idx === -1) return jsonResponse({ message: '参考图不存在' }, 404);
      const prev = doc.items[idx];
      const image = { ...prev, ...(body || {}), id, updated_at: new Date().toISOString() };
      doc.items[idx] = image;
      writeDoc(path, 'referenceImages', doc);
      return jsonResponse({ message: '参考图更新成功', image });
    }
    if (m === 'DELETE') {
      if (idx !== -1) doc.items.splice(idx, 1);
      writeDoc(path, 'referenceImages', doc);
      return jsonResponse({ message: '参考图删除成功' });
    }
  }
  return null;
}

// ==================== 上传 ====================

async function routeUpload(m: string, body: any, url: URL): Promise<Response | null> {
  // POST /api/upload（XHR，绑定资产类型，同时创建参考图记录）
  if (m === 'POST') {
    const file = body?._files?.file as File | undefined;
    if (!file) return jsonResponse({ message: '没有上传文件或文件类型不支持' }, 400);
    // 归属解析：显式 projectId（body/query）优先，兜底活动工程
    const explicitPid = Number(body?.project_id ?? body?.projectId ?? url.searchParams.get('projectId')) || 0;
    const pid = explicitPid || getActiveProjectId();
    const dataUrl = await fileToDataUrl(file);
    let url2 = dataUrl;
    if (pid) {
      // 落地硬约束：已选工程时必须写入工程 media/，失败显式报错（不再内联 base64 存文档）
      try { url2 = await persistGeneratedMedia(pid, dataUrl, file.name || 'upload.png'); }
      catch (e: any) { return jsonResponse({ message: '文件保存到工程媒体目录失败：' + (e?.message || e) }, 500); }
    }
    const { asset_type, asset_id, view_type = 'other', description } = body || {};
    let image: any = null;
    if (asset_type && asset_id) {
      const path = await resolvePath(explicitPid || null);
      if (path) {
        const doc = await loadRefDoc(path);
        const now = new Date().toISOString();
        const scopedCount = doc.items.filter((it: any) => String(it.asset_type) === String(asset_type) && String(it.asset_id) === String(asset_id)).length;
        image = {
          id: doc.nextId++,
          asset_type,
          asset_id: Number(asset_id) || 0,
          image_url: url2,
          description: description || null,
          view_type: ['front', 'side', 'back', 'other'].includes(view_type) ? view_type : 'other',
          sort_order: scopedCount,
          is_enabled: true,
          created_at: now,
          updated_at: now,
        };
        doc.items.push(image);
        writeDoc(path, 'referenceImages', doc);
      }
    }
    return jsonResponse({ message: '文件上传成功', image, url: url2 }, 201);
  }
  return null;
}

// ==================== 用户（本地身份，localStorage） ====================

const PROFILE_KEY = 'nanostory-local-profile';

function readLocalProfile(): any {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    id: 1,
    email: 'local@desktop',
    nickname: '本地用户',
    avatar_url: '',
    signature: '',
    balance: 0,
    created_at: new Date().toISOString(),
  };
}
function writeLocalProfile(p: any): void {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

async function routeUsers(pathname: string, m: string, body: any, url: URL): Promise<Response | null> {
  if (!pathname.startsWith('/api/users')) return null;

  if (pathname === '/api/users/profile') {
    if (m === 'GET') return jsonResponse(readLocalProfile());
    if (m === 'PUT') {
      const profile = readLocalProfile();
      if (body?.nickname !== undefined) profile.nickname = body.nickname;
      if (body?.signature !== undefined) profile.signature = body.signature;
      writeLocalProfile(profile);
      return jsonResponse({ message: '资料更新成功', user: profile });
    }
    return jsonResponse({ message: 'method not allowed' }, 405);
  }

  if (pathname === '/api/users/avatar' && m === 'POST') {
    const file = body?._files?.avatar as File | undefined;
    if (!file) return jsonResponse({ message: '请选择头像文件' }, 400);
    const activeId = getActiveProjectId();
    const dataUrl = await fileToDataUrl(file);
    let avatarUrl = dataUrl;
    if (activeId) {
      // 落地硬约束：有工程时失败显式报错；无工程才允许内联（localStorage 头像）
      try { avatarUrl = await persistGeneratedMedia(activeId, dataUrl, 'avatar.png'); }
      catch (e: any) { return jsonResponse({ message: '头像保存到工程媒体目录失败：' + (e?.message || e) }, 500); }
    }
    const profile = readLocalProfile();
    profile.avatar_url = avatarUrl;
    writeLocalProfile(profile);
    return jsonResponse({ message: '头像更新成功', avatar_url: avatarUrl });
  }

  if (pathname === '/api/users/stats' && m === 'GET') {
    let projectCount = 0;
    try { projectCount = (await fetchLocalProjects()).length; } catch { /* ignore */ }
    return jsonResponse({ imageCount: 0, videoCount: 0, projectCount, scriptCount: 0, characterCount: 0 });
  }

  if (pathname === '/api/users/search' && m === 'GET') {
    // 协作检索属云能力，本地返回空集合
    void url;
    return jsonResponse({ users: [] });
  }

  return null;
}

// ==================== 上传状态 / 通用上传 / 仪表盘统计 ====================

async function routeStatsDashboard(): Promise<Response> {
  let projects: any[] = [];
  try { projects = await fetchLocalProjects(); } catch { /* ignore */ }
  const recentProjects = projects
    .slice()
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    .slice(0, 6)
    .map((p) => ({ id: String(p.id), name: p.name, updatedAt: p.updated_at }));
  return jsonResponse({
    projectCount: projects.length,
    scriptCount: 0,
    storyboardCount: 0,
    aiCallsCount: 0,
    recentProjects,
  });
}

// ==================== 路由入口 ====================

export async function routeMisc(url: URL, method: string, body: any): Promise<Response | null> {
  const pathname = url.pathname;
  const m = method.toUpperCase();
  let res: Response | null;

  res = await routeReferenceImages(url, m, body);
  if (res) return res;

  if (pathname === '/api/upload/status' && m === 'GET') {
    return jsonResponse({ ready: true, maxFileSize: 10 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] });
  }
  if (pathname === '/api/upload/general' && m === 'POST') {
    const file = body?._files?.file as File | undefined;
    if (!file) return jsonResponse({ message: '没有上传文件或文件类型不支持' }, 400);
    // 归属解析：显式 projectId（body/query）优先，兜底活动工程
    const explicitPid = Number(body?.project_id ?? body?.projectId ?? url.searchParams.get('projectId')) || 0;
    const pid = explicitPid || getActiveProjectId();
    const dataUrl = await fileToDataUrl(file);
    let outUrl = dataUrl;
    if (pid) {
      // 落地硬约束：已选工程时必须写入工程 media/，失败显式报错
      try { outUrl = await persistGeneratedMedia(pid, dataUrl, file.name || 'general'); }
      catch (e: any) { return jsonResponse({ message: '文件保存到工程媒体目录失败：' + (e?.message || e) }, 500); }
    }
    return jsonResponse({ url: outUrl, filePath: outUrl, size: file.size, mimeType: file.type || 'application/octet-stream' });
  }
  if (pathname === '/api/upload' && m === 'POST') {
    res = await routeUpload(m, body, url);
    if (res) return res;
  }

  res = await routeUsers(pathname, m, body, url);
  if (res) return res;

  if (pathname === '/api/stats/dashboard' && m === 'GET') return routeStatsDashboard();

  return null;
}
