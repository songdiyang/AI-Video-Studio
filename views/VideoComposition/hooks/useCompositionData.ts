/**
 * 合成数据 Hook
 * 加载项目所有集的分镜视频数据
 */

import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '../../../services/auth';
import type { CompositionClip, EpisodeGroup } from '../types';

interface Script {
  id: number;
  episode_number: number;
  title: string;
}

interface Storyboard {
  id: number;
  idx: number;
  prompt_template: string;
  variables_json: string;
  image_ref: string | null;
  video_url: string | null;
  generation_status: string | null;
}

export function useCompositionData(projectId: number | null) {
  const [episodes, setEpisodes] = useState<EpisodeGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);

  // 加载所有集及其分镜
  const loadAllEpisodes = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const token = getAuthToken();

      // 1. 获取所有剧本
      const scriptsRes = await fetch(`/api/scripts/project/${projectId}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      if (!scriptsRes.ok) throw new Error('加载剧本失败');
      const scriptsData = await scriptsRes.json();
      const scripts: Script[] = scriptsData.scripts || [];

      // 2. 并行加载每集的分镜
      const episodeGroups: EpisodeGroup[] = await Promise.all(
        scripts.map(async (script) => {
          const sbRes = await fetch(`/api/storyboards/${script.id}`, {
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
          });
          let storyboards: Storyboard[] = [];
          if (sbRes.ok) {
            const sbData = await sbRes.json();
            storyboards = sbData.storyboards || sbData || [];
          }

          const clips: CompositionClip[] = storyboards
            .filter((sb) => sb.video_url)
            .map((sb, i) => {
              let dialogue = '';
              try {
                const vars = JSON.parse(sb.variables_json || '{}');
                // 优先使用结构化台词
                if (Array.isArray(vars.dialogues) && vars.dialogues.length > 0) {
                  dialogue = vars.dialogues.map((d: any) => `${d.character}：${d.line}`).join('\n');
                } else {
                  dialogue = vars.dialogue || '';
                }
              } catch { /* ignore */ }

              return {
                id: `clip-${script.id}-${sb.id}`,
                storyboardId: sb.id,
                scriptId: script.id,
                episodeNumber: script.episode_number,
                order: sb.idx ?? i,
                videoUrl: sb.video_url!,
                description: sb.prompt_template || '',
                dialogue,
                duration: 0, // 实际时长由 video 元素获取
                trimStart: 0,
                trimEnd: 0,
                transition: 'none' as const,
                volume: 1
              };
            })
            .sort((a, b) => a.order - b.order);

          return {
            scriptId: script.id,
            episodeNumber: script.episode_number,
            title: script.title || `第 ${script.episode_number} 集`,
            clips,
            expanded: false
          };
        })
      );

      episodeGroups.sort((a, b) => a.episodeNumber - b.episodeNumber);
      setEpisodes(episodeGroups);

      // 默认选中第一集
      if (episodeGroups.length > 0 && !selectedEpisode) {
        setSelectedEpisode(episodeGroups[0].episodeNumber);
      }
    } catch (err) {
      console.error('[useCompositionData] 加载失败:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadAllEpisodes();
  }, [loadAllEpisodes]);

  // 切换集数展开/折叠
  const toggleEpisode = useCallback((episodeNumber: number) => {
    setEpisodes(prev =>
      prev.map(ep =>
        ep.episodeNumber === episodeNumber
          ? { ...ep, expanded: !ep.expanded }
          : ep
      )
    );
  }, []);

  // 获取当前选中集的片段
  const currentClips = episodes.find(ep => ep.episodeNumber === selectedEpisode)?.clips || [];

  return {
    episodes,
    loading,
    selectedEpisode,
    setSelectedEpisode,
    currentClips,
    toggleEpisode,
    reload: loadAllEpisodes
  };
}
