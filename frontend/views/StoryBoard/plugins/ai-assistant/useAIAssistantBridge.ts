/**
 * StoryBoard → AI 助手全局侧边栏 桥接
 * ──────────────────────────────────────────────────────────────
 * 原 AIAssistantPlugin 在工作台右侧内联渲染 AI 面板；
 * 现在 AI 助手统一为 Layout 层的全局右侧停靠侧边栏（AIAssistantDrawer），
 * 本 Hook 负责把工作台的分镜数据 / 资源清单 / 动作处理器注册到
 * AIAssistantContext，供全局侧边栏消费。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAIAssistantWorkbenchContext, AIAssistantAction, AIAssistantFrameContext, AIAssistantSceneSummary, AIAssistantStudioSummary } from '../../../../contexts/AIAssistantContext';
import { createScript as createScriptApi, deleteScript as deleteScriptApi, updateScript as updateScriptApi } from '../../../../services/scripts';
import { fetchCharacter, fetchCharacterStates, createCharacterState, updateCharacterState, generateCharacterStateViews, createProp, updateProp, deleteProp } from '../../../../services/assets';
import { updateProject as updateProjectApi } from '../../../../services/projects';
import { registerLongTask } from '../../../../services/longTasks';
import { listStudios, createStudio, updateStudio, deleteStudio } from '../../../../services/studios';
import { probeMediaBatch, formatBytes, formatResolution, MediaKind } from '../../../../services/mediaInfo';
import {
  loadProjectGenerationSettings,
  saveProjectGenerationSettings,
  findArtStylePreset,
  ART_STYLE_PRESETS,
  setTempArtStyle,
  clearTempArtStyle,
  type ProjectGenerationSettings,
} from '../../../../services/projectSettings';
import {
  addMemory,
  deleteMemory,
  deleteMemoriesByKeyword,
  listMemories,
  loadMemoryFlags,
  type MemoryScope,
  type MemoryImportance,
} from '../../../../services/agentMemory';

export interface StoryboardAIAssistantBridgeParams {
  state: any;
  scenes: any[];
  selectedScene: number | null;
  sceneActions: any;
  generationActions: any;
  resourceActions: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setState: (...args: any[]) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  showToast: (...args: any[]) => void;
  autoStoryboard: any;
}

export function useStoryboardAIAssistantBridge(params: StoryboardAIAssistantBridgeParams) {
  const {
    state,
    scenes,
    selectedScene,
    sceneActions,
    generationActions,
    resourceActions,
    setState,
    showToast,
    autoStoryboard,
  } = params;

  const selectedSceneData = scenes.find((s) => s.id === selectedScene);

  // ===== 场景库（Studio）清单：与资源面板的「场景」页保持同一数据源 =====
  const [studios, setStudios] = useState<AIAssistantStudioSummary[]>([]);
  const projectId = state.currentProjectId as number | null;

  const loadStudios = useCallback(async () => {
    if (!projectId) {
      setStudios([]);
      return;
    }
    try {
      const list = await listStudios(projectId);
      setStudios(list.map((s: any) => {
        const env = s.environment;
        const buildings = Array.isArray(s.buildings) ? s.buildings : [];
        return {
          id: s.id,
          name: s.name,
          description: s.description ?? undefined,
          cover_image_url: s.cover_image_url ?? undefined,
          environment_name: typeof env === 'string' ? env : env?.name ?? undefined,
          building_names: buildings
            .map((b: any) => (typeof b === 'string' ? b : b?.name))
            .filter((n: any): n is string => !!n),
          scene_count: s.scene_count,
          element_count: s.element_count,
          nine_grid_image_url: s.nine_grid_image_url ?? undefined,
        };
      }));
    } catch {
      setStudios([]);
    }
  }, [projectId]);

  useEffect(() => { loadStudios(); }, [loadStudios]);

  // ===== AI action 处理器（与原 AIAssistantPlugin 行为一致） =====
  const handleAction: AIAssistantAction = (action, actionParams?: any, onProgress?: (label: string) => void) => {
    if (action === 're-open-drawer') {
      // AI 助手即全局侧边栏，无需重新打开
      return;
    }

    const sceneIdFrom = (p: any) => Number(p?.sceneId || selectedSceneData?.id);
    // AI 发起的任务统一在对话步骤流/结果消息中反馈，不再弹全局成功 toast
    const toastOk = (_m: string) => {};
    const toastErr = (prefix: string) => (e: any) => showToast(prefix + ': ' + (e?.message || e), 'error');
    const fail = (prefix: string) => (e: any) => {
      const msg = e?.message || String(e);
      return { success: false, error: msg || prefix };
    };
    const notifyLibraryChanged = (type: 'characters' | 'studios' | 'props') => {
      window.dispatchEvent(new CustomEvent('resource-library-changed', { detail: { type } }));
    };
    const ensureProject = () => {
      if (!state.currentProjectId) { showToast('未选择项目', 'warning'); return false; }
      return true;
    };
    // 生成前门禁：工程未锁定美术风格时拒绝出图/出视频，
    // 让 agent 回到「结合剧本先问风格 → update_project_settings 写回」的流程，防止画风漂移
    const ensureArtStyleLocked = (): Promise<{ success: false; error: string } | null> => {
      const projectId = state.currentProjectId;
      if (!projectId) return Promise.resolve(null);
      return loadProjectGenerationSettings(projectId).then((settings) =>
        settings.artStylePrompt?.trim()
          ? null
          : {
              success: false as const,
              error:
                '当前工程尚未锁定美术风格。请先用 ask 结合剧本题材向用户确认风格（给出 2-3 个候选与适配理由），' +
                '收到答复后用 update_project_settings 写入 artStyle 与 artStylePrompt，再重新执行生成。',
            },
      );
    };

    // 分镜：生成与质检
    if (action === 'generate_frame') {
      const sceneId = sceneIdFrom(actionParams);
      if (!sceneId) { showToast('请先选择分镜', 'warning'); return; }
      const target = scenes.find((s) => s.id === sceneId);
      const prompt = actionParams?.prompt || target?.description || selectedSceneData?.description || '';
      // 返回 Promise：把 { success, jobId, error } 回传给对话栏，用于挂后台任务进度卡片
      return ensureArtStyleLocked().then((blocked) => {
        if (blocked) return blocked;
        return generationActions.generateImage(sceneId, prompt)
          .then((result: any) => {
            if (!result.success) showToast(result.error || '生成分镜图失败', 'error');
            return result;
          })
          .catch((err: any) => {
            showToast('生成分镜图失败: ' + (err?.message || err), 'error');
            return { success: false, error: err?.message || String(err) };
          });
      });
    } else if (action === 'generate_video') {
      const sceneId = sceneIdFrom(actionParams);
      if (!sceneId) { showToast('请先选择分镜', 'warning'); return; }
      return ensureArtStyleLocked().then((blocked) => {
        if (blocked) return blocked;
        return generationActions.generateVideo(sceneId)
          .then((result: any) => {
            if (!result.success) showToast(result.error || '生成视频失败', 'error');
            return result;
          })
          .catch((err: any) => {
            showToast('生成视频失败: ' + (err?.message || err), 'error');
            return { success: false, error: err?.message || String(err) };
          });
      });
    } else if (action === 'auto_storyboard') {
      // AI 自动触发时直接执行，不弹确认框。
      // 前置条件：必须已有绑定剧本。否则不得谎称「已启动」——抛错让 agent 循环感知失败，
      // 由模型改用 ask 先询问用户故事需求、再 generate_script、最后 auto_storyboard。
      if (!state.currentScriptId) {
        throw new Error('当前没有绑定剧本，无法拆分分镜。请先用 ask 询问用户想要一个什么样的故事，收到回答后用 generate_script 生成剧本，再执行 auto_storyboard。');
      }
      // 使用 startGeneration 直接启动，避免 handleAutoGenerateClick 弹窗。
      // 返回 Promise：本地离线端会同步完成拆分并落库后再 resolve，
      // 供 AI 助手 agent 循环 await，避免「未真正完成就宣称完成」。
      onProgress?.('已校验剧本绑定，正在读取剧本正文…');
      const { startGeneration } = autoStoryboard as any;
      if (startGeneration) {
        let splitCount: number | undefined;
        return Promise.resolve(startGeneration(state.textModel, true, false, {
          conflictStrategy: 'skip',
          referenceScriptContent: state.scriptContent || undefined,
          referenceScriptTitle: state.currentProject?.name || undefined,
          // 拆分关键阶段回报到对话栏步骤
          onSplitProgress: (label: string) => onProgress?.(label),
          onSplitDone: (count?: number) => {
            splitCount = count;
            onProgress?.(count != null ? `拆分完成，写入 ${count} 个分镜` : '拆分完成，已同步分镜列表');
          },
          onSplitError: (msg: string) => onProgress?.(`拆分失败：${msg}`),
        })).then(() => {
          // 拆分时会自动沉淀重复出现的道具，刷新资源面板「道具」页与 AI 上下文
          resourceActions.fetchProjectProps?.();
          notifyLibraryChanged('props');
          return { sceneCount: splitCount };
        });
      }
      // 回退：调用原来的方法（会弹窗）
      autoStoryboard.handleAutoGenerateClick();
    } else if (action === 'optimize_prompt' || action === 'upload_material') {
      showToast(`请在分镜卡片上手动${action === 'optimize_prompt' ? '触发提示词优化' : '上传素材'}`, 'info');
    }
    // 分镜 CRUD
    else if (action === 'insert_scene') {
      const atIndex = typeof actionParams?.atIndex === 'number' ? actionParams.atIndex : scenes.length;
      sceneActions.insertScene(Math.max(0, Math.min(atIndex, scenes.length)))
        .then(() => {
          toastOk(`已在位置 ${atIndex + 1} 插入新分镜`);
          // AI 驱动的新增走全局侧边栏树，乐观更新可能与服务端回写竞态导致列表不即时刷新；
          // 完成后从服务端重新拉取权威列表，保证分镜列表及时同步。
          sceneActions.refreshScenes?.();
        })
        .catch(toastErr('插入失败'));
    } else if (action === 'delete_scene') {
      const sceneId = sceneIdFrom(actionParams);
      if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
      sceneActions.deleteScene(sceneId)
        .then(() => { toastOk('分镜已删除'); sceneActions.refreshScenes?.(); })
        .catch(toastErr('删除失败'));
    } else if (action === 'update_scene') {
      const sceneId = sceneIdFrom(actionParams);
      const field = String(actionParams?.field || '');
      const rawValue = actionParams?.value;
      if (!sceneId || !field) { showToast('缺少 sceneId 或 field', 'warning'); return; }
      if (field === 'voiceover') {
        Promise.resolve(sceneActions.updateVoiceover(sceneId, String(rawValue ?? '')))
          .then(() => toastOk('旁白已更新')).catch(toastErr('更新失败'));
      } else if (field === 'duration') {
        const d = Number(rawValue);
        if (!Number.isFinite(d) || d <= 0) { showToast('duration 必须为正数秒', 'warning'); return; }
        Promise.resolve(sceneActions.updateDuration(sceneId, d))
          .then(() => toastOk(`时长已更新为 ${d}s`)).catch(toastErr('更新失败'));
      } else {
        const fieldMap: Record<string, (id: number, v: string) => any> = {
          description: sceneActions.updateDescription,
          base_description: sceneActions.updateBaseDescription,
          first_frame_prompt: sceneActions.updateFirstFramePrompt,
          last_frame_prompt: sceneActions.updateLastFramePrompt,
          video_prompt: sceneActions.updateVideoPrompt,
        };
        const fn = fieldMap[field];
        if (!fn) { showToast(`不支持的字段: ${field}`, 'warning'); return; }
        Promise.resolve(fn(sceneId, String(rawValue ?? '')))
          .then(() => toastOk(`已更新 ${field}`)).catch(toastErr('更新失败'));
      }
    } else if (action === 'update_scene_dialogues') {
      const sceneId = sceneIdFrom(actionParams);
      if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
      const raw = actionParams?.dialogues;
      const list = Array.isArray(raw) ? raw.map((d: any, i: number) => typeof d === 'string'
        ? { character: '', line: d, order: i }
        : { character: String(d.character || ''), line: String(d.line || d.text || ''), order: i })
        : [];
      Promise.resolve(sceneActions.updateDialogues(sceneId, list as any))
        .then(() => toastOk('对白已更新')).catch(toastErr('更新失败'));
    } else if (action === 'update_scene_characters_location') {
      const sceneId = sceneIdFrom(actionParams);
      if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
      const characters: string[] = Array.isArray(actionParams?.characters) ? actionParams.characters.map(String) : [];
      const location: string = String(actionParams?.location || '');
      const characterIds: number[] | undefined = Array.isArray(actionParams?.characterIds) ? actionParams.characterIds.map(Number) : undefined;
      const locationId: number | undefined = actionParams?.locationId != null ? Number(actionParams.locationId) : undefined;
      Promise.resolve(sceneActions.updateCharactersAndLocation(sceneId, characters, location, characterIds, locationId))
        .then(() => toastOk('角色/影棚绑定已更新')).catch(toastErr('更新失败'));
    } else if (action === 'update_scene_props') {
      const sceneId = sceneIdFrom(actionParams);
      if (!sceneId) return { success: false, error: '缺少 sceneId' };
      // 道具按名称绑定（与资源面板「道具」页同一套名称），需与 scene.props 的存储形态一致
      const props: string[] = Array.isArray(actionParams?.props)
        ? actionParams.props.map((v: any) => String(v).trim()).filter(Boolean)
        : [];
      const unique = Array.from(new Set(props));
      return Promise.resolve(sceneActions.updateProps(sceneId, unique))
        .then(() => `分镜 #${sceneId} 道具已更新：${unique.length ? unique.join('、') : '（已清空）'}`)
        .catch(fail('更新分镜道具失败'));
    } else if (action === 'move_scene') {
      const sceneId = sceneIdFrom(actionParams);
      const direction = actionParams?.direction === 'down' ? 'down' : 'up';
      if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
      sceneActions.moveScene(sceneId, direction as 'up' | 'down');
      toastOk(`已${direction === 'up' ? '上移' : '下移'}分镜`);
    } else if (action === 'reorder_scenes') {
      const ids: number[] = Array.isArray(actionParams?.sceneIds) ? actionParams.sceneIds.map(Number) : [];
      if (ids.length === 0) { showToast('sceneIds 为空', 'warning'); return; }
      const byId = new Map(scenes.map((s) => [s.id, s]));
      const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof scenes;
      if (reordered.length !== scenes.length) { showToast('sceneIds 与当前分镜不匹配', 'warning'); return; }
      sceneActions.reorderScenes(reordered);
      toastOk('分镜顺序已更新');
    }
    // 角色 CRUD（资源库）
    else if (action === 'create_character') {
      if (!ensureProject()) return;
      const payload: Record<string, unknown> = {
        project_id: state.currentProjectId!,
        name: String(actionParams?.name || '新角色').trim() || '新角色',
        description: actionParams?.description,
        appearance: actionParams?.appearance,
        base_appearance: actionParams?.base_appearance,
        outfit_appearance: actionParams?.outfit_appearance,
        personality: actionParams?.personality,
        gender: actionParams?.gender,
        tags: actionParams?.tags,
      };
      Object.keys(payload).forEach((k) => { if (payload[k] === undefined) delete payload[k]; });
      return resourceActions.createCharacter(payload)
        .then((c: any) => {
          toastOk(`已创建角色「${c.name}」（ID:${c.id}）`);
          resourceActions.fetchProjectCharacters();
          notifyLibraryChanged('characters');
          return `已创建角色「${c.name}」（ID:${c.id}）`;
        })
        .catch(fail('创建角色失败'));
    } else if (action === 'update_character') {
      const id = Number(actionParams?.characterId);
      if (!id) return { success: false, error: '缺少 characterId' };
      return resourceActions.updateCharacter(id, actionParams?.fields || {})
        .then(() => {
          toastOk(`角色 #${id} 已更新`);
          resourceActions.fetchProjectCharacters();
          notifyLibraryChanged('characters');
          return `角色 #${id} 已更新`;
        })
        .catch(fail('更新角色失败'));
    } else if (action === 'create_character_state') {
      const cid = Number(actionParams?.characterId);
      if (!cid) return { success: false, error: '缺少 characterId' };
      if (!state.currentProjectId) return { success: false, error: '未选择项目' };
      return (async () => {
        try {
          // 拍戏流程硬约束：白膜三视图是基础网格，未完成前不允许派生状态。
          const states = await fetchCharacterStates(cid);
          const base = states.find((s: any) => s.is_base_model);
          if (!(base?.front_view_url && base?.side_view_url && base?.back_view_url)) {
            return { success: false, error: '白膜三视图未完成：请先生成白膜三视图，再创建角色状态。' };
          }
          const created = await createCharacterState(cid, {
            project_id: state.currentProjectId,
            name: String(actionParams?.name || '新状态'),
            description: actionParams?.description || '',
            state_category: actionParams?.state_category || 'daily',
            outfit: actionParams?.outfit || '',
            age_stage: actionParams?.age_stage || '',
            hairstyle: actionParams?.hairstyle || '',
            accessories: actionParams?.accessories || '',
            body_elements: actionParams?.body_elements || '',
            held_props: actionParams?.held_props || '',
            costume_id: actionParams?.costume_id ?? null,
            tags: actionParams?.tags || '[]',
          } as any);
          toastOk(`已创建角色状态「${created.name}」`);
          resourceActions.fetchProjectCharacters?.();
          notifyLibraryChanged('characters');
          return `已创建角色状态「${created.name}」（ID:${created.id}）。状态由白膜基础 + 服装 + 道具 + 状态属性组合而成。`;
        } catch (e: any) {
          showToast(e?.message || '创建角色状态失败', 'error');
          return { success: false, error: e?.message || '创建角色状态失败' };
        }
      })();
    } else if (action === 'update_character_state') {
      const cid = Number(actionParams?.characterId);
      const sid = Number(actionParams?.stateId);
      if (!cid || !sid) return { success: false, error: '缺少 characterId 或 stateId' };
      if (!state.currentProjectId) return { success: false, error: '未选择项目' };
      return (async () => {
        try {
          const states = await fetchCharacterStates(cid);
          const target = states.find((s: any) => s.id === sid);
          if (!target) return { success: false, error: `角色状态 #${sid} 不存在` };
          if (!target.is_base_model) {
            const base = states.find((s: any) => s.is_base_model);
            if (!(base?.front_view_url && base?.side_view_url && base?.back_view_url)) {
              return { success: false, error: '白膜三视图未完成：请先补齐白膜三视图，再修改派生状态。' };
            }
          }
          const fields = actionParams?.fields && typeof actionParams.fields === 'object' ? actionParams.fields : {};
          await updateCharacterState(cid, sid, { project_id: state.currentProjectId, ...fields } as any);
          toastOk(`角色状态 #${sid} 已更新`);
          resourceActions.fetchProjectCharacters?.();
          notifyLibraryChanged('characters');
          return `角色状态 #${sid} 已更新`;
        } catch (e: any) {
          showToast(e?.message || '更新角色状态失败', 'error');
          return { success: false, error: e?.message || '更新角色状态失败' };
        }
      })();
    } else if (action === 'delete_character') {
      const id = Number(actionParams?.characterId);
      if (!id) return { success: false, error: '缺少 characterId' };
      return resourceActions.deleteCharacter(id)
        .then(() => {
          toastOk(`角色 #${id} 已删除`);
          resourceActions.fetchProjectCharacters();
          notifyLibraryChanged('characters');
          return `角色 #${id} 已删除`;
        })
        .catch(fail('删除角色失败'));
    }
    // 场景库（Studio）CRUD：资源面板「场景」页的真实数据源
    else if (action === 'create_studio') {
      if (!ensureProject()) return;
      const name = String(actionParams?.name || '').trim();
      if (!name) return { success: false, error: '缺少场景名称' };
      return createStudio({
        projectId: state.currentProjectId!,
        name,
        description: actionParams?.description,
        coverImageUrl: actionParams?.coverImageUrl,
      })
        .then((s) => {
          toastOk(`已创建场景「${s.name}」（ID:${s.id}）`);
          loadStudios();
          notifyLibraryChanged('studios');
          return `已创建场景「${s.name}」（ID:${s.id}）`;
        })
        .catch(fail('创建场景失败'));
    } else if (action === 'update_studio') {
      const id = Number(actionParams?.studioId ?? actionParams?.locationId);
      if (!id) return { success: false, error: '缺少 studioId' };
      const fields = actionParams?.fields || {};
      const payload: Record<string, any> = {};
      if (fields.name !== undefined) payload.name = String(fields.name);
      if (fields.description !== undefined) payload.description = fields.description == null ? null : String(fields.description);
      const cover = fields.coverImageUrl ?? fields.cover_image_url;
      if (cover !== undefined) payload.coverImageUrl = cover == null ? null : String(cover);
      if (typeof fields.sortOrder === 'number') payload.sortOrder = fields.sortOrder;
      return updateStudio(id, payload)
        .then((s) => {
          toastOk(`场景「${s.name}」已更新`);
          loadStudios();
          notifyLibraryChanged('studios');
          return `场景「${s.name}」（ID:${s.id}）已更新`;
        })
        .catch(fail('更新场景失败'));
    } else if (action === 'delete_studio') {
      const id = Number(actionParams?.studioId ?? actionParams?.locationId);
      if (!id) return { success: false, error: '缺少 studioId' };
      return deleteStudio(id)
        .then(() => {
          toastOk(`场景 #${id} 已删除`);
          loadStudios();
          notifyLibraryChanged('studios');
          return `场景 #${id} 已删除`;
        })
        .catch(fail('删除场景失败'));
    }
    // 道具库（资源面板「道具」页，data/props.json）
    else if (action === 'create_prop') {
      if (!ensureProject()) return;
      const name = String(actionParams?.name || '').trim();
      if (!name) return { success: false, error: '缺少道具名称 name' };
      // 道具按名称唯一：已有同名道具时改为补全字段，避免同一件物品在道具库里重复
      const existing = (state.projectProps || []).find(
        (p: any) => String(p?.name || '').trim().toLowerCase() === name.toLowerCase(),
      );
      if (existing) {
        const fields: any = {};
        if (actionParams?.description) fields.description = actionParams.description;
        if (actionParams?.category) fields.category = actionParams.category;
        if (Object.keys(fields).length === 0) {
          return `道具库已有「${existing.name}」（ID:${existing.id}），无需重复创建`;
        }
        return updateProp(existing.id, fields)
          .then(() => {
            resourceActions.fetchProjectProps?.();
            notifyLibraryChanged('props');
            return `道具库已有「${existing.name}」（ID:${existing.id}），已补全字段而非重复创建`;
          })
          .catch(fail('更新道具失败'));
      }
      return createProp({
        project_id: state.currentProjectId!,
        name,
        description: actionParams?.description || '',
        category: actionParams?.category || '',
      } as any)
        .then((created: any) => {
          resourceActions.fetchProjectProps?.();
          notifyLibraryChanged('props');
          return `已创建道具「${created.name}」（ID:${created.id}）`;
        })
        .catch(fail('创建道具失败'));
    } else if (action === 'update_prop') {
      const id = Number(actionParams?.propId);
      if (!id) return { success: false, error: '缺少 propId' };
      const fields = actionParams?.fields || {};
      return updateProp(id, fields)
        .then((p: any) => {
          resourceActions.fetchProjectProps?.();
          notifyLibraryChanged('props');
          return `道具「${p?.name ?? `#${id}`}」（ID:${id}）已更新`;
        })
        .catch(fail('更新道具失败'));
    } else if (action === 'delete_prop') {
      const id = Number(actionParams?.propId);
      if (!id) return { success: false, error: '缺少 propId' };
      return deleteProp(id)
        .then(() => {
          resourceActions.fetchProjectProps?.();
          notifyLibraryChanged('props');
          return `道具 #${id} 已删除`;
        })
        .catch(fail('删除道具失败'));
    }
    // 分镜地点（Scenes，用于分镜绑定；与场景库 Studio 独立）
    else if (action === 'create_location') {
      if (!ensureProject()) return;
      const name = String(actionParams?.name || '').trim() || '新地点';
      return resourceActions.createLocation({ project_id: state.currentProjectId!, name, description: actionParams?.description })
        .then((s: any) => {
          toastOk(`已创建分镜地点「${s.name}」（ID:${s.id}）`);
          resourceActions.fetchProjectScenes();
          return `已创建分镜地点「${s.name}」（ID:${s.id}）`;
        })
        .catch(fail('创建分镜地点失败'));
    } else if (action === 'update_location') {
      const id = Number(actionParams?.locationId);
      if (!id) return { success: false, error: '缺少 locationId' };
      return resourceActions.updateLocation(id, actionParams?.fields || {})
        .then(() => {
          toastOk(`分镜地点 #${id} 已更新`);
          resourceActions.fetchProjectScenes();
          return `分镜地点 #${id} 已更新`;
        })
        .catch(fail('更新分镜地点失败'));
    } else if (action === 'delete_location') {
      const id = Number(actionParams?.locationId);
      if (!id) return { success: false, error: '缺少 locationId' };
      return resourceActions.deleteLocation(id)
        .then(() => {
          toastOk(`分镜地点 #${id} 已删除`);
          resourceActions.fetchProjectScenes();
          return `分镜地点 #${id} 已删除`;
        })
        .catch(fail('删除分镜地点失败'));
    }
    // 剧本
    else if (action === 'create_script') {
      if (!ensureProject()) return;
      const content = String(actionParams?.content || '');
      if (!content.trim()) { showToast('剧本内容不能为空', 'warning'); return; }
      createScriptApi({
        projectId: state.currentProjectId!,
        title: actionParams?.title || '新剧本',
        content,
        episodeNumber: actionParams?.episodeNumber || 1,
      })
        .then((res) => {
          toastOk(`已创建剧本「${actionParams?.title || '新剧本'}」`);
          // 刷新 scripts 列表
          setState('currentScriptId' as any, res.scriptId);
        })
        .catch(toastErr('创建剧本失败'));
    } else if (action === 'update_script') {
      // 写入/更新剧本正文：活动栏「大纲」面板由正文实时解析渲染（无独立大纲存储），
      // AI 编写/修订每一集的大纲都落在这里；content 为该集全文整体替换。
      const content = String(actionParams?.content ?? '');
      if (!content.trim()) return { success: false, error: 'content 不能为空：写入大纲需提供该集完整正文' };
      const scriptId = Number(actionParams?.scriptId);
      const episodeNumber = Number(actionParams?.episodeNumber);
      const scripts = Array.isArray(state.scripts) ? state.scripts : [];
      let target: any = null;
      if (Number.isFinite(scriptId) && scriptId > 0) target = scripts.find((sc: any) => Number(sc.id) === scriptId);
      if (!target && Number.isFinite(episodeNumber) && episodeNumber > 0) {
        target = scripts.find((sc: any) => Number(sc.episode_number) === episodeNumber);
      }
      if (!target && state.currentScriptId) {
        target = scripts.find((sc: any) => Number(sc.id) === Number(state.currentScriptId));
      }
      if (!target) {
        const epHint = Number.isFinite(episodeNumber) && episodeNumber > 0 ? `第 ${episodeNumber} 集` : '当前集';
        return { success: false, error: `未找到${epHint}绑定的剧本。请先用 create_script（带 episodeNumber）新建该集剧本再写入大纲。` };
      }
      const title = actionParams?.title != null ? String(actionParams.title) : (target.title || `第${target.episode_number || 1}集`);
      return Promise.resolve(updateScriptApi(target.id, title, content))
        .then(() => {
          // 当前集：同步工作台状态使大纲面板即时刷新；并通知剧本列表重新加载
          if (Number(target.id) === Number(state.currentScriptId)) {
            setState('scriptContent', content);
            setState('scriptTitle', title);
          }
          window.dispatchEvent(new CustomEvent('reload-scripts', { detail: { projectId: state.currentProjectId } }));
          return `已更新${title}（#${target.id}，第${target.episode_number || 1}集）正文 ${content.length} 字，大纲面板已同步渲染`;
        })
        .catch((e: any) => ({ success: false, error: e?.message || '更新剧本正文失败' }));
    } else if (action === 'delete_script') {
      const id = Number(actionParams?.scriptId);
      if (!id) { showToast('缺少 scriptId', 'warning'); return; }
      deleteScriptApi(id)
        .then(() => toastOk('剧本已删除'))
        .catch(toastErr('删除剧本失败'));
    } else if (action === 'generate_base_model') {
      const cid = Number(actionParams?.characterId);
      if (!cid) { showToast('缺少 characterId', 'warning'); return; }
      if (!state.currentProjectId) { showToast('未选择项目', 'warning'); return; }
      if (!state.currentImageModel) { showToast('请先选择图像生成模型', 'warning'); return; }
      return (async () => {
        try {
          const char = await fetchCharacter(cid);
          const states = await fetchCharacterStates(cid);
          let base = states.find((s: any) => s.is_base_model);
          if (!base) {
            // 没有白膜状态时先建立基础状态，再生成三视图；设定图只作为参考输入。
            base = await createCharacterState(cid, {
              project_id: state.currentProjectId,
              name: '白膜',
              description: (char as any)?.base_appearance || (char as any)?.appearance || (char as any)?.description || '',
              appearance: (char as any)?.base_appearance || (char as any)?.appearance || '',
              outfit: (char as any)?.outfit_appearance || '',
              is_base_model: true,
              image_url: (char as any)?.image_url || '',
              front_view_url: (char as any)?.front_view_url || '',
              side_view_url: (char as any)?.side_view_url || '',
              back_view_url: (char as any)?.back_view_url || '',
              state_category: 'daily',
              tags: '[]',
              generation_status: 'idle',
            } as any);
          }
          const started = await generateCharacterStateViews(cid, base.id, {
            imageModel: state.currentImageModel,
            textModel: state.textModel || undefined,
          });
          if (started?.jobId) {
            registerLongTask({
              jobId: String(started.jobId),
              title: `白膜三视图 · ${(char as any)?.name || `角色 #${cid}`}`,
              kind: 'image',
              projectId: state.currentProjectId ?? null,
            });
          }
          toastOk('已启动白膜三视图生成；完成前请勿添加服装、道具或状态');
          resourceActions.fetchProjectCharacters?.();
          return `角色 #${cid} 的白膜状态 #${base.id} 已启动三视图生成（任务 #${started?.jobId || '-'}）。白膜三视图完成前不能创建派生状态；可用 get_task_status 查看进度。`;
        } catch (e: any) {
          showToast(e?.message || '白膜三视图生成失败', 'error');
          return { success: false, error: e?.message || '白膜三视图生成失败' };
        }
      })();
    } else if (action === 'inspect_quality') {
      showToast('请将当前分镜图片发送到 AI 助手，然后询问"检查这个分镜质量"', 'info');
    }
    // 已有剧本操作
    else if (action === 'bind_script') {
      const id = actionParams?.scriptId == null ? null : Number(actionParams.scriptId);
      setState('currentScriptId', id);
      toastOk(id ? `已绑定剧本 #${id}` : '已解绑参考剧本');
    } else if (action === 'switch_episode') {
      const ep = Number(actionParams?.episodeNumber);
      if (!Number.isFinite(ep) || ep <= 0) { showToast('episodeNumber 非法', 'warning'); return; }
      setState('currentEpisode', ep);
      toastOk(`已切换到第 ${ep} 集`);
    }
    // 项目
    else if (action === 'update_project') {
      if (!ensureProject()) return;
      const fields = actionParams?.fields || {};
      updateProjectApi(state.currentProjectId!, fields)
        .then(() => toastOk('项目已更新'))
        .catch(toastErr('项目更新失败'));
    }
    // 工程设置（图片/视频分辨率与画面比例，存工程 data/project_settings.json）
    else if (action === 'get_project_settings') {
      if (!ensureProject()) return { success: false, error: '未选择项目' };
      return loadProjectGenerationSettings(state.currentProjectId).then((s) => {
        const label = (v?: string) => (v && v.trim() ? v : '自动（跟随模型默认）');
        const styleLabel = findArtStylePreset(s.artStyle)?.label || '未设置';
        const tempLine = s.tempArtStylePrompt?.trim()
          ? `- 临时风格覆盖: ${s.tempArtStylePrompt.trim()}${s.tempArtStyleNote?.trim() ? `（来源：${s.tempArtStyleNote.trim()}）` : ''}（生效中，优先生成）`
          : '- 临时风格覆盖: 未启用';
        return [
          `当前工程「${state.currentProject?.name ?? state.currentProjectId}」生成设置：`,
          `- 图片分辨率: ${label(s.imageResolution)}`,
          `- 图片画面比例: ${label(s.imageAspectRatio)}`,
          `- 视频分辨率: ${label(s.videoResolution)}`,
          `- 视频画面比例: ${label(s.videoAspectRatio)}`,
          `- 美术风格: ${styleLabel}`,
          `- 风格限定: ${s.artStylePrompt?.trim() || '未设置'}`,
          tempLine,
        ].join('\n');
      });
    }
    // 临时风格覆盖：用户临时意图优先于工程锁定风格，不动工程设置
    else if (action === 'set_temp_art_style') {
      if (!ensureProject()) return { success: false, error: '未选择项目' };
      const prompt = String(actionParams?.artStylePrompt || actionParams?.prompt || '').trim().slice(0, 300);
      if (!prompt) return { success: false, error: '缺少 artStylePrompt（临时风格描述）' };
      const note = String(actionParams?.note || '').trim().slice(0, 120);
      return setTempArtStyle(state.currentProjectId!, prompt, note).then(() => {
        toastOk('临时风格已生效，工程锁定风格不变');
        return `临时风格覆盖已生效：${prompt}${note ? `（来源：${note}）` : ''}。后续所有图片/视频生成改用该风格；工程锁定风格保持不变，调用 clear_temp_art_style 可恢复。`;
      }).catch((e: any) => ({ success: false, error: e?.message || '设置临时风格失败' }));
    } else if (action === 'clear_temp_art_style') {
      if (!ensureProject()) return { success: false, error: '未选择项目' };
      return clearTempArtStyle(state.currentProjectId!).then(() => {
        toastOk('已恢复工程锁定风格');
        return '临时风格覆盖已清除，后续生成恢复使用工程锁定风格。';
      }).catch((e: any) => ({ success: false, error: e?.message || '清除临时风格失败' }));
    }
    // 智能体记忆：记录 / 遗忘 / 自查
    else if (action === 'remember') {
      // 遵循「开启自动生成」总开关：关闭时 AI 不得主动记录，提示用户手动添加
      if (!loadMemoryFlags().autoLearn) {
        return { success: false, error: '用户已关闭记忆自动生成。如需记录，请引导用户在记忆面板手动添加，或请用户打开「开启自动生成」开关。' };
      }
      const content = String(actionParams?.content || '').trim();
      if (!content) return { success: false, error: '缺少 content（记忆内容）' };
      const scope: MemoryScope = actionParams?.scope === 'user' ? 'user' : 'project';
      const impRaw = String(actionParams?.importance || 'normal');
      const importance: MemoryImportance = impRaw === 'high' || impRaw === 'low' ? impRaw : 'normal';
      return addMemory(state.currentProjectId, { content, scope, importance }).then((result) => {
        if (result.status === 'invalid') return { success: false, error: '记忆内容为空' };
        const mem = result.memory;
        const scopeLabel = mem.scope === 'user' ? '用户记忆（跨工程）' : '工程记忆';
        if (result.status === 'duplicate') {
          return {
            success: true,
            memoryId: mem.id,
            message: result.wasDisabled
              ? `已存在相同记忆并重新启用（${scopeLabel}）：${mem.content}`
              : `已有相同记忆，未重复记录（${scopeLabel}）：${mem.content}`,
          };
        }
        return { success: true, memoryId: mem.id, message: `已记住（${scopeLabel}）：${mem.content}` };
      }).catch((e: any) => ({ success: false, error: e?.message || '记录记忆失败' }));
    } else if (action === 'forget') {
      const memoryId = String(actionParams?.memoryId || '').trim();
      const keyword = String(actionParams?.keyword || '').trim();
      if (memoryId) {
        return deleteMemory(state.currentProjectId, memoryId).then((ok) =>
          ok ? `已删除记忆 ${memoryId}` : { success: false, error: `未找到记忆 ${memoryId}` }
        );
      }
      if (keyword) {
        return deleteMemoriesByKeyword(state.currentProjectId, keyword).then((n) =>
          n > 0 ? `已删除 ${n} 条包含「${keyword}」的记忆` : { success: false, error: `没有包含「${keyword}」的记忆` }
        );
      }
      return { success: false, error: '缺少 memoryId 或 keyword' };
    } else if (action === 'list_memories') {
      return listMemories(state.currentProjectId).then((list) => {
        if (!list.length) return '当前没有任何记忆。';
        const scopeLabel = (m: any) => (m.scope === 'user' ? '用户' : '工程');
        const impLabel = (m: any) => (m.importance === 'high' ? '重要' : m.importance === 'low' ? '次要' : '一般');
        const lines = list.map((m) =>
          `- [${m.id}]（${scopeLabel(m)}/${impLabel(m)}${m.enabled ? '' : '/已停用'}/调用${m.useCount}次）${m.content}`
        );
        return `当前记忆（${list.length} 条）：\n${lines.join('\n')}`;
      });
    } else if (action === 'update_project_settings') {
      if (!ensureProject()) return { success: false, error: '未选择项目' };
      const ALLOWED: Partial<Record<keyof ProjectGenerationSettings, string[]>> = {
        imageResolution: ['', '720p', '1080p', '2K', '4K'],
        videoResolution: ['', '480p', '720p', '1080p'],
        imageAspectRatio: ['', '1:1', '16:9', '9:16', '4:3', '3:4', '21:9'],
        videoAspectRatio: ['', '16:9', '9:16', '1:1', '4:3', '3:4'],
      };
      const raw = actionParams?.fields && typeof actionParams.fields === 'object' ? actionParams.fields : actionParams || {};
      const patches: Partial<ProjectGenerationSettings> = {};
      for (const key of Object.keys(ALLOWED) as Array<keyof ProjectGenerationSettings>) {
        if (raw[key] === undefined) continue;
        const v = String(raw[key]).trim();
        const normalized = v === 'auto' || v === '自动' ? '' : v;
        if (!ALLOWED[key]!.includes(normalized)) {
          return { success: false, error: `${key} 取值非法: ${v}（可选: ${ALLOWED[key]!.filter(Boolean).join(' / ')}，或 auto 表示自动）` };
        }
        patches[key] = normalized;
      }
      // 美术风格：预设 key（见 ART_STYLE_PRESETS）与自由文本的风格限定
      if (raw.artStyle !== undefined) {
        const v = String(raw.artStyle).trim();
        if (!ART_STYLE_PRESETS.some((preset) => preset.key === v)) {
          return { success: false, error: `artStyle 取值非法: ${v}（可选: ${ART_STYLE_PRESETS.map((p) => p.key || 'none').join(' / ')}）` };
        }
        patches.artStyle = v;
      }
      if (raw.artStylePrompt !== undefined) {
        patches.artStylePrompt = String(raw.artStylePrompt).trim().slice(0, 300);
      }
      if (Object.keys(patches).length === 0) {
        return { success: false, error: '未提供可识别的设置字段（imageResolution/imageAspectRatio/videoResolution/videoAspectRatio/artStyle/artStylePrompt）' };
      }
      return loadProjectGenerationSettings(state.currentProjectId)
        .then((cur) => saveProjectGenerationSettings(state.currentProjectId!, { ...cur, ...patches }))
        .then(() => {
          const zh: Record<string, string> = {
            imageResolution: '图片分辨率', imageAspectRatio: '图片画面比例',
            videoResolution: '视频分辨率', videoAspectRatio: '视频画面比例',
            artStyle: '美术风格', artStylePrompt: '风格限定',
          };
          const changed = Object.entries(patches)
            .map(([k, v]) => `${zh[k] || k}=${(v && String(v).trim()) ? v : '自动'}`)
            .join('，');
          return `工程设置已更新（${changed}），已打开的工作台生成时实时生效`;
        })
        .catch((e: any) => ({ success: false, error: e?.message || '保存工程设置失败' }));
    }
    // 媒体资源元数据：分辨率 / 文件大小（逐资源探测本地文件，结果回传模型汇总回答）
    else if (action === 'query_media_info') {
      if (!ensureProject()) return { success: false, error: '未选择项目' };
      const scope = String(actionParams?.scope || 'all').trim().toLowerCase();
      const keyword = String(actionParams?.keyword || '').trim().toLowerCase();
      interface Entry { group: string; label: string; src: string; kind?: MediaKind }
      const entries: Entry[] = [];
      const add = (group: string, label: string, src: any, kind?: MediaKind) => {
        if (typeof src === 'string' && src.trim()) entries.push({ group, label, src: src.trim(), kind });
      };
      // 以下清单均为本组件 render 作用域内的 memo/state；handleAction 只在渲染完成后
      // 被事件回调触发，闭包引用已初始化，无需 ref 镜像。
      (aiCharacters as any[]).forEach((c: any) => {
        add('角色', `「${c.name}」主图`, c.image_url, 'image');
      });
      (studios as any[]).forEach((s: any) => {
        add('场景库', `「${s.name}」封面`, s.cover_image_url, 'image');
        add('场景库', `「${s.name}」九宫格`, s.nine_grid_image_url, 'image');
      });
      (aiLocations as any[]).forEach((l: any) => add('分镜地点', `「${l.name}」图`, l.image_url, 'image'));
      (aiProps as any[]).forEach((p: any) => add('道具', `「${p.name}」图`, p.image_url, 'image'));
      (aiScenes as any[]).forEach((s: any) => {
        add('分镜', `#${s.index} 首帧`, s.first_frame_url, 'image');
        add('分镜', `#${s.index} 尾帧`, s.last_frame_url, 'image');
        add('分镜', `#${s.index} 视频`, s.video_url, 'video');
      });
      const SCOPE_ALIAS: Record<string, string> = {
        character: '角色', characters: '角色', studio: '场景库', studios: '场景库', scene: '场景库',
        location: '分镜地点', locations: '分镜地点', prop: '道具', props: '道具',
        storyboard: '分镜', storyboards: '分镜', frames: '分镜', video: '分镜', videos: '分镜',
      };
      const groupFilter = scope && scope !== 'all' ? SCOPE_ALIAS[scope] : undefined;
      let filtered = entries.filter((e) => {
        if (groupFilter && e.group !== groupFilter) return false;
        if (scope === 'video' || scope === 'videos') return e.kind === 'video';
        if (keyword) return `${e.group}${e.label}`.toLowerCase().includes(keyword);
        return true;
      });
      if (filtered.length === 0) {
        return `未找到匹配的媒体资源（scope=${scope || 'all'}${keyword ? `, keyword=${keyword}` : ''}）。可尝试 scope: characters/studios/props/storyboards 或留空查全部。`;
      }
      const MAX_ROWS = 150;
      const truncated = filtered.length > MAX_ROWS;
      if (truncated) filtered = filtered.slice(0, MAX_ROWS);
      onProgress?.(`正在探测 ${filtered.length} 个媒体文件…`);
      return probeMediaBatch(filtered.map((e) => ({ src: e.src, kind: e.kind }))).then((probes) => {
        const lines: string[] = [];
        let totalBytes = 0;
        let counted = 0;
        let missing = 0;
        filtered.forEach((e, i) => {
          const p = probes[i];
          if (p.missing) {
            missing += 1;
            lines.push(`- ${e.group}${e.label}: 文件缺失`);
            return;
          }
          if (p.bytes != null) { totalBytes += p.bytes; counted += 1; }
          const res = formatResolution(p.width, p.height);
          const size = formatBytes(p.bytes);
          const err = p.error ? `（探测异常: ${p.error}）` : '';
          lines.push(`- ${e.group}${e.label}: ${res} · ${size}${err}`);
        });
        const head = `媒体元数据（${filtered.length} 项${truncated ? `，已截断，共 ${entries.length} 项` : ''}）：已探测到大小 ${counted} 项，合计 ${formatBytes(totalBytes)}；缺失 ${missing} 项。分辨率/格式列为“未知”表示元素探测失败或视频元数据未加载。`;
        return `${head}\n${lines.join('\n')}`;
      });
    }
    else {
      console.log('[AI Assistant] 未处理的 action:', action, actionParams);
      showToast(`未识别的 action: ${action}`, 'warning');
    }
  };

  // ===== 数据映射（注册到全局 AI 助手上下文） =====
  const frame: AIAssistantFrameContext | null = selectedSceneData ? {
    id: selectedSceneData.id,
    index: scenes.findIndex((s) => s.id === selectedSceneData.id) + 1,
    first_frame_url: selectedSceneData.startFrame,
    last_frame_url: selectedSceneData.endFrame,
    video_url: selectedSceneData.videoUrl,
    scene_description: selectedSceneData.description,
    first_frame_prompt: selectedSceneData.firstFramePrompt,
    last_frame_prompt: selectedSceneData.lastFramePrompt,
    video_prompt: selectedSceneData.videoPrompt,
  } : null;

  const aiScenes: AIAssistantSceneSummary[] = useMemo(() => scenes.map((s, idx) => ({
    id: s.id!,
    index: idx + 1,
    description: s.description,
    props: Array.isArray(s.props) && s.props.length > 0 ? s.props : undefined,
    first_frame_url: s.startFrame,
    last_frame_url: s.endFrame,
    video_url: s.videoUrl,
    first_frame_prompt: s.firstFramePrompt,
    last_frame_prompt: s.lastFramePrompt,
    video_prompt: s.videoPrompt,
  })), [scenes]);

  const aiCharacters = useMemo(() =>
    (state.projectCharacters || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      description: c.description || c.base_appearance || c.outfit_appearance,
      appearance: c.appearance || c.base_appearance || undefined,
      base_appearance: c.base_appearance,
      outfit_appearance: c.outfit_appearance,
      active_state_name: c.active_state_name,
      active_state_outfit: c.active_state_outfit,
      states_count: c.states_count,
      has_base_model_views: !!c.has_base_model_views,
      image_url: c.image_url || c.active_state_image_url || c.base_model_image_url || c.first_state_front_view_url,
    })),
    [state.projectCharacters]
  );
  const aiLocations = useMemo(() =>
    (state.projectScenes || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      image_url: l.image_url,
      environment: l.environment,
      buildings: Array.isArray(l.buildings)
        ? l.buildings.map((b: any) => (typeof b === 'string' ? b : b?.name)).filter(Boolean)
        : undefined,
    })),
    [state.projectScenes]
  );
  // 道具库清单：工作台已随工程加载 projectProps（data/props.json），直接映射注入 AI 上下文
  const aiProps = useMemo(() =>
    (state.projectProps || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description || undefined,
      category: p.category || undefined,
      image_url: p.image_url || undefined,
    })),
    [state.projectProps]
  );

  const aiScripts = useMemo(() =>
    (state.scripts || []).map((sc: any) => ({
      id: sc.id,
      episode_number: sc.episode_number,
      title: sc.title,
      // 关键：把剧本正文一并注入，否则智能体只能看到标题、读不到剧情。
      // 当前绑定剧本优先用工作台已加载的完整正文（state.scriptContent），
      // 其余剧本用列表自带正文（若有）。
      content: (sc.id === state.currentScriptId && state.scriptContent)
        ? state.scriptContent
        : sc.content,
    })),
    [state.scripts, state.currentScriptId, state.scriptContent]
  );

  useAIAssistantWorkbenchContext({
    frame,
    scenes: aiScenes,
    characters: aiCharacters,
    locations: aiLocations,
    studios,
    props: aiProps,
    scripts: aiScripts,
    onAction: handleAction,
    projectName: state.currentProject?.name ?? null,
    projectDescription: state.currentProject?.description ?? null,
  });
}
