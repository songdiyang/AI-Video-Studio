/**
 * AI 助手插件
 * 原 AIAssistantPanel 组件的插件化包装
 */

import React, { lazy, Suspense } from 'react';
import { useStoryboardContext } from '../../core/StoryboardContext';
import { createScript as createScriptApi, deleteScript as deleteScriptApi } from '../../../../services/scripts';
import { generateCharacterViews } from '../../../../services/assets';
import { updateProject as updateProjectApi } from '../../../../services/projects';
import { getAuthToken } from '../../../../services/auth';

const AIAssistantPanel = lazy(() => import('../../../../components/AIAssistantPanel'));

const AIAssistantPlugin: React.FC = () => {
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
  } = useStoryboardContext();

  const selectedSceneData = scenes.find(s => s.id === selectedScene);

  // AI action 处理器
  const handleAction = (action: string, params?: any) => {
    if (action === 're-open-drawer') {
      // openAssistant();
      return;
    }

    const sceneIdFrom = (p: any) => Number(p?.sceneId || selectedSceneData?.id);
    const toastOk = (m: string) => showToast(m, 'success');
    const toastErr = (prefix: string) => (e: any) => showToast(prefix + ': ' + (e?.message || e), 'error');
    const ensureProject = () => {
      if (!state.currentProjectId) { showToast('未选择项目', 'warning'); return false; }
      return true;
    };

    // 分镜：生成与质检
    if (action === 'generate_frame') {
      const sceneId = sceneIdFrom(params);
      if (!sceneId) { showToast('请先选择分镜', 'warning'); return; }
      const target = scenes.find(s => s.id === sceneId);
      const prompt = params?.prompt || target?.description || selectedSceneData?.description || '';
      generationActions.generateImage(sceneId, prompt);
    } else if (action === 'generate_video') {
      const sceneId = sceneIdFrom(params);
      if (!sceneId) { showToast('请先选择分镜', 'warning'); return; }
      generationActions.generateVideo(sceneId);
    } else if (action === 'auto_storyboard') {
      // AI 自动触发时直接执行，不弹确认框
      if (!state.currentScriptId) {
        showToast('智能分镜需要绑定剧本作为参考', 'warning');
        return;
      }
      // 使用 startGeneration 直接启动，避免 handleAutoGenerateClick 弹窗
      const { startGeneration } = autoStoryboard as any;
      if (startGeneration) {
        startGeneration(state.textModel, true, false, {
          conflictStrategy: 'skip',
          referenceScriptContent: state.scriptContent || undefined,
          referenceScriptTitle: state.currentProject?.name || undefined
        });
      } else {
        // 回退：调用原来的方法（会弹窗）
        autoStoryboard.handleAutoGenerateClick();
      }
    } else if (action === 'optimize_prompt' || action === 'upload_material') {
      showToast(`请在分镜卡片上手动${action === 'optimize_prompt' ? '触发提示词优化' : '上传素材'}`, 'info');
    }
    // 分镜 CRUD
    else if (action === 'insert_scene') {
      const atIndex = typeof params?.atIndex === 'number' ? params.atIndex : scenes.length;
      sceneActions.insertScene(Math.max(0, Math.min(atIndex, scenes.length)))
        .then(() => toastOk(`已在位置 ${atIndex + 1} 插入新分镜`))
        .catch(toastErr('插入失败'));
    } else if (action === 'delete_scene') {
      const sceneId = sceneIdFrom(params);
      if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
      sceneActions.deleteScene(sceneId).then(() => toastOk('分镜已删除')).catch(toastErr('删除失败'));
    } else if (action === 'update_scene') {
      const sceneId = sceneIdFrom(params);
      const field = String(params?.field || '');
      const rawValue = params?.value;
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
      const sceneId = sceneIdFrom(params);
      if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
      const raw = params?.dialogues;
      const list = Array.isArray(raw) ? raw.map((d: any, i: number) => typeof d === 'string'
        ? { character: '', line: d, order: i }
        : { character: String(d.character || ''), line: String(d.line || d.text || ''), order: i })
        : [];
      Promise.resolve(sceneActions.updateDialogues(sceneId, list as any))
        .then(() => toastOk('对白已更新')).catch(toastErr('更新失败'));
    } else if (action === 'update_scene_characters_location') {
      const sceneId = sceneIdFrom(params);
      if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
      const characters: string[] = Array.isArray(params?.characters) ? params.characters.map(String) : [];
      const location: string = String(params?.location || '');
      const characterIds: number[] | undefined = Array.isArray(params?.characterIds) ? params.characterIds.map(Number) : undefined;
      const locationId: number | undefined = params?.locationId != null ? Number(params.locationId) : undefined;
      Promise.resolve(sceneActions.updateCharactersAndLocation(sceneId, characters, location, characterIds, locationId))
        .then(() => toastOk('角色/影棚绑定已更新')).catch(toastErr('更新失败'));
    } else if (action === 'move_scene') {
      const sceneId = sceneIdFrom(params);
      const direction = params?.direction === 'down' ? 'down' : 'up';
      if (!sceneId) { showToast('缺少 sceneId', 'warning'); return; }
      sceneActions.moveScene(sceneId, direction as 'up' | 'down');
      toastOk(`已${direction === 'up' ? '上移' : '下移'}分镜`);
    } else if (action === 'reorder_scenes') {
      const ids: number[] = Array.isArray(params?.sceneIds) ? params.sceneIds.map(Number) : [];
      if (ids.length === 0) { showToast('sceneIds 为空', 'warning'); return; }
      const byId = new Map(scenes.map(s => [s.id, s]));
      const reordered = ids.map(id => byId.get(id)).filter(Boolean) as typeof scenes;
      if (reordered.length !== scenes.length) { showToast('sceneIds 与当前分镜不匹配', 'warning'); return; }
      sceneActions.reorderScenes(reordered);
      toastOk('分镜顺序已更新');
    }
    // 角色 CRUD
    else if (action === 'create_character') {
      if (!ensureProject()) return;
      resourceActions.createCharacter({ projectId: state.currentProjectId!, name: String(params?.name || '新角色'), description: params?.description, base_appearance: params?.base_appearance })
        .then((c: any) => { toastOk(`已创建角色「${c.name}」`); resourceActions.fetchProjectCharacters(); })
        .catch(toastErr('创建角色失败'));
    } else if (action === 'update_character') {
      const id = Number(params?.characterId); if (!id) { showToast('缺少 characterId', 'warning'); return; }
      resourceActions.updateCharacter(id, params?.fields || {})
        .then(() => { toastOk('角色已更新'); resourceActions.fetchProjectCharacters(); })
        .catch(toastErr('更新角色失败'));
    } else if (action === 'delete_character') {
      const id = Number(params?.characterId); if (!id) { showToast('缺少 characterId', 'warning'); return; }
      resourceActions.deleteCharacter(id)
        .then(() => { toastOk('角色已删除'); resourceActions.fetchProjectCharacters(); })
        .catch(toastErr('删除角色失败'));
    }
    // 场景 CRUD
    else if (action === 'create_location') {
      if (!ensureProject()) return;
      resourceActions.createLocation({ project_id: state.currentProjectId!, name: String(params?.name || '新影棚'), description: params?.description })
        .then((s: any) => { toastOk(`已创建影棚「${s.name}」`); resourceActions.fetchProjectScenes(); })
        .catch(toastErr('创建影棚失败'));
    } else if (action === 'update_location') {
      const id = Number(params?.locationId); if (!id) { showToast('缺少 locationId', 'warning'); return; }
      resourceActions.updateLocation(id, params?.fields || {})
        .then(() => { toastOk('影棚已更新'); resourceActions.fetchProjectScenes(); })
        .catch(toastErr('更新影棚失败'));
    } else if (action === 'delete_location') {
      const id = Number(params?.locationId); if (!id) { showToast('缺少 locationId', 'warning'); return; }
      resourceActions.deleteLocation(id)
        .then(() => { toastOk('影棚已删除'); resourceActions.fetchProjectScenes(); })
        .catch(toastErr('删除影棚失败'));
    }
    // 剧本
    else if (action === 'create_script') {
      if (!ensureProject()) return;
      const content = String(params?.content || '');
      if (!content.trim()) { showToast('剧本内容不能为空', 'warning'); return; }
      createScriptApi({
        projectId: state.currentProjectId!,
        title: params?.title || '新剧本',
        content,
        episodeNumber: params?.episodeNumber || 1,
      })
        .then((res) => {
          toastOk(`已创建剧本「${params?.title || '新剧本'}」`);
          // 刷新 scripts 列表
          setState('currentScriptId' as any, res.scriptId);
        })
        .catch(toastErr('创建剧本失败'));
    } else if (action === 'delete_script') {
      const id = Number(params?.scriptId);
      if (!id) { showToast('缺少 scriptId', 'warning'); return; }
      deleteScriptApi(id)
        .then(() => toastOk('剧本已删除'))
        .catch(toastErr('删除剧本失败'));
    } else if (action === 'generate_base_model') {
      const cid = Number(params?.characterId);
      if (!cid) { showToast('缺少 characterId', 'warning'); return; }
      generateCharacterViews(cid, { imageModel: state.currentImageModel })
        .then(() => toastOk('已启动角色三视图生成（可能需要几分钟）'))
        .catch(toastErr('三视图生成失败'));
    } else if (action === 'inspect_quality') {
      showToast('请将当前分镜图片发送到 AI 助手，然后询问"检查这个分镜质量"', 'info');
    }
    // 已有剧本操作
    else if (action === 'bind_script') {
      const id = params?.scriptId == null ? null : Number(params.scriptId);
      setState('currentScriptId', id);
      toastOk(id ? `已绑定剧本 #${id}` : '已解绑参考剧本');
    } else if (action === 'switch_episode') {
      const ep = Number(params?.episodeNumber);
      if (!Number.isFinite(ep) || ep <= 0) { showToast('episodeNumber 非法', 'warning'); return; }
      setState('currentEpisode', ep);
      toastOk(`已切换到第 ${ep} 集`);
    }
    // 项目
    else if (action === 'update_project') {
      if (!ensureProject()) return;
      const fields = params?.fields || {};
      updateProjectApi(state.currentProjectId!, fields)
        .then(() => toastOk('项目已更新'))
        .catch(toastErr('项目更新失败'));
    }
    // 协作
    else if (action === 'invite_member') {
      if (!ensureProject()) return;
      const email = params?.username || params?.email;
      if (!email) { showToast('缺少邀请邮箱', 'warning'); return; }
      const token = getAuthToken();
      fetch('/api/collaboration/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ projectId: state.currentProjectId!, email, role: params?.role || 'viewer' }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.message || '邀请失败');
          toastOk(`已邀请 ${email}`);
        })
        .catch(toastErr('邀请成员失败'));
    }
    else {
      console.log('[AI Assistant] 未处理的 action:', action, params);
      showToast(`未识别的 action: ${action}`, 'warning');
    }
  };

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full text-sm text-(--text-muted)">
        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
        加载中...
      </div>
    }>
      <AIAssistantPanel
        projectId={state.currentProjectId}
        projectName={state.currentProject?.name}
        projectDescription={state.currentProject?.description}
        currentFrame={selectedSceneData ? {
          id: selectedSceneData.id,
          index: scenes.findIndex(s => s.id === selectedSceneData.id) + 1,
          first_frame_url: (selectedSceneData as any).startFrame,
          last_frame_url: (selectedSceneData as any).endFrame,
          video_url: (selectedSceneData as any).videoUrl,
          scene_description: selectedSceneData.description
        } : null}
        scenes={scenes.map((s, idx) => ({
          id: s.id!,
          index: idx + 1,
          description: s.description,
          first_frame_url: (s as any).startFrame,
          last_frame_url: (s as any).endFrame,
          video_url: (s as any).videoUrl,
          first_frame_prompt: (s as any).firstFramePrompt,
          last_frame_prompt: (s as any).lastFramePrompt,
          video_prompt: (s as any).videoPrompt,
        }))}
        characters={state.projectCharacters.map((c: any) => ({ id: c.id, name: c.name, description: c.base_appearance || c.outfit_appearance }))}
        locations={state.projectScenes.map((l: any) => ({ id: l.id, name: l.name, description: l.description }))}
        scripts={state.scripts.map((sc: any) => ({ id: sc.id, episode_number: sc.episode_number, title: sc.title }))}
        onClose={() => {}}
        onAction={handleAction}
      />
    </Suspense>
  );
};

export default AIAssistantPlugin;
