/**
 * 分镜质检素材报告（纯逻辑 + 注入媒体探测）。
 *
 * 从 AIAssistantPanel/index.tsx 抽出：汇总分镜的提示词、生成情况与本地文件
 * 元数据（分辨率/大小），并交出画面图片供模型真看。探测函数可注入，
 * 便于单测与复用（智能体循环 inspect_quality 端口）。
 */
import { probeMediaBatch, formatBytes, formatResolution } from './mediaInfo';

export interface InspectionTargetLike {
  id: number;
  index?: number;
  description?: string;
  scene_description?: string;
  first_frame_url?: string;
  last_frame_url?: string;
  video_url?: string;
  first_frame_prompt?: string;
  last_frame_prompt?: string;
  video_prompt?: string;
}

export interface InspectionReport {
  text: string;
  images: Array<{ label: string; url: string }>;
}

export async function buildSceneInspectionReport(target: InspectionTargetLike | null | undefined): Promise<InspectionReport> {
  if (!target) return { text: '质检失败：找不到对应分镜（sceneId 无效）。请告知用户先选中一个分镜。', images: [] };
  const mediaEntries: Array<{ key: string; url: string; kind: 'image' | 'video' }> = [];
  if (target.first_frame_url) mediaEntries.push({ key: '首帧', url: target.first_frame_url, kind: 'image' });
  if (target.last_frame_url && target.last_frame_url !== target.first_frame_url) mediaEntries.push({ key: '尾帧', url: target.last_frame_url, kind: 'image' });
  if (target.video_url) mediaEntries.push({ key: '视频', url: target.video_url, kind: 'video' });
  const probes = mediaEntries.length > 0
    ? await probeMediaBatch(mediaEntries.map((m) => ({ src: m.url, kind: m.kind })))
    : [];
  const mediaLines = mediaEntries.map((m, i) => {
    const p = probes[i];
    if (p?.missing) return `- ${m.key}：文件缺失（清单有引用但工程 media/ 无实体）`;
    return `- ${m.key}：${formatResolution(p?.width, p?.height)} · ${formatBytes(p?.bytes)}`;
  });
  if (mediaLines.length === 0) mediaLines.push('- 尚未生成任何画面/视频');
  const images = mediaEntries
    .map((m, i) => ({ m, missing: !!probes[i]?.missing }))
    .filter(({ m, missing }) => m.kind === 'image' && !missing)
    .map(({ m }) => ({ label: `分镜#${target.index} ${m.key}`, url: m.url }));
  const sight = images.length > 0
    ? '本条消息已附带该分镜的真实画面图片，你必须看清画面后再评价构图/色彩/人物一致性，不得臆测图中没有的内容。'
    : '该分镜没有可用画面，请仅基于提示词分析，并如实告知用户看不到画面。';
  return {
    text: [
      `【分镜质检素材 #${target.index}（ID:${target.id}）】`,
      `描述：${target.description || target.scene_description || '（无）'}`,
      ...mediaLines,
      `首帧提示词：${target.first_frame_prompt || '（无）'}`,
      `尾帧提示词：${target.last_frame_prompt || '（无）'}`,
      `视频提示词：${target.video_prompt || '（无）'}`,
      `请基于以上真实素材给出 1-5 星评级与具体改进建议，并把反馈直接写进回复正文交给用户。${sight}`,
    ].join('\n'),
    images,
  };
}