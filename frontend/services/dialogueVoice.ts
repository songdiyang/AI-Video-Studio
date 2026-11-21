// 台词配音（TTS）：把时间线片段里的角色台词逐条合成音频，落到工程 media/，
// 返回带起始时间的音轨条目，供原生导出按 adelay 混音。
//
// 模型选择：优先名字含 tts/audio 的模型，其次第一个可用模型；
// TTS 失败必须抛错（含片段序号与原因），不静默丢台词。

import { isTauri } from './localApi';
import { getOfflineModels, resolveModel, synthesizeSpeech } from './localAI';
import { resolveLocalPath } from './localStore';
import type { CompositionClip } from '../views/VideoComposition/types';

export interface DialogueVoiceItem {
  /** 本机绝对路径（导出混音用） */
  path: string;
  /** 片段在成片中的起始秒 */
  startSec: number;
  clipOrder: number;
}

async function pickTtsModel(): Promise<string> {
  const models = await getOfflineModels();
  const hit = models.find((m) => /tts|audio|speech/i.test(m.model_name) || /tts|audio|speech/i.test(m.provider));
  if (hit) return hit.model_name;
  return models[0]?.model_name || '';
}

/** 逐片段合成台词配音；返回可用音轨（无台词的片段跳过） */
export async function generateDialogueVoiceovers(
  projectId: number,
  clips: CompositionClip[],
  onProgress?: (done: number, total: number, label: string) => void,
): Promise<DialogueVoiceItem[]> {
  if (!isTauri()) throw new Error('台词配音需要桌面端（音频写入工程 media/）');
  const projectPath = await resolveLocalPath(projectId);
  if (!projectPath) throw new Error('无法解析工程目录');
  const modelName = await pickTtsModel();
  if (!modelName) throw new Error('没有可用模型，请先在「设置 › 模型」配置');
  const model = await resolveModel(modelName);
  if (!model) throw new Error(`模型 ${modelName} 配置不可用`);

  const { invoke } = await import('@tauri-apps/api/core');
  const { convertFileSrc } = await import('@tauri-apps/api/core');

  const withDialogue = clips.filter((c) => (c.dialogue || '').trim());
  const items: DialogueVoiceItem[] = [];
  let cursor = 0;
  let done = 0;
  for (const clip of clips) {
    const startSec = cursor;
    cursor += Math.max(0, clip.duration || 0);
    const text = (clip.dialogue || '').trim();
    if (!text) continue;
    done += 1;
    onProgress?.(done, withDialogue.length, `分镜 #${clip.order}`);
    let bytes: Uint8Array;
    try {
      bytes = await synthesizeSpeech({ model, text });
    } catch (e: any) {
      throw new Error(`第 ${done} 条台词配音失败（分镜 #${clip.order}）: ${e?.message || e}`);
    }
    const fileName = `tts_${clip.storyboardId}_${Date.now()}.mp3`;
    const path = await invoke<string>('save_media_bytes', {
      projectPath,
      fileName,
      data: Array.from(bytes),
    });
    items.push({ path, startSec, clipOrder: clip.order });
    // 供 UI 预览用（产物已授权 asset 作用域）
    void convertFileSrc(path);
  }
  return items;
}