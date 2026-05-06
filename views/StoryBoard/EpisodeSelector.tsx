import React from 'react';
import { Select, SelectItem, Divider } from '@heroui/react';
import { Film, Blocks, Plus, BookOpen, Pencil } from 'lucide-react';

interface Script {
  id: number;
  episode_number: number;
  title: string;
  status: string;
}

// 「无参考剧本」虚拟项 id（保证与真实 script id 不冲突）
export const STANDALONE_SCRIPT_ID = 0;
// 「+ 新建下一集」虚拟项 id（与真实 script id 不冲突）
export const CREATE_NEXT_EPISODE_ID = -1;

interface EpisodeSelectorProps {
  scripts: Script[];
  currentEpisode: number;
  /** 当前选中的 scriptId，null 表示未绑定任何参考剧本 */
  currentScriptId?: number | null;
  onSelect: (script: Script | null) => void;
  /**
   * 未绑定参考剧本时直接输入「当前进度的集数标签」。
   * 集数仅作为用户侧的工作量标记（方便识别做到第几集），不参与数据归档。
   * 未提供时不渲染标签输入框。
   */
  onStandaloneEpisodeChange?: (episode: number) => void;
  /**
   * 无参考剧本模式下用户已使用的最大集数标签（localStorage 持久化）。
   * 用于在集数下拉里列出 1..max 供用户自由切换。
   * 未提供时退回纯数字输入框。
   */
  standaloneMaxEpisode?: number;
  /**
   * 点击"+ 新建下一集"时回调。
   * 由父组件负责调用后端创建空白剧集（episodeNumber = max+1）并刷新列表。
   * 未提供时不渲染该入口。
   */
  onCreateNextEpisode?: () => void;
}

/**
 * 参考剧本与集数选择器
 *  - 左侧：参考剧本选择（无 / 某剧本，剧本仅作为 prompt 注入参考）
 *  - 右侧：集数进度标签
 *      - 未绑剧本时：数字输入框，保存在本地，方便用户识别「做到第几集」
 *      - 已绑剧本且有多集时：剧本集数切换 + 「新建下一集」入口
 */
const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  scripts,
  currentEpisode,
  currentScriptId,
  onSelect,
  onStandaloneEpisodeChange,
  standaloneMaxEpisode,
  onCreateNextEpisode
}) => {
  const isStandalone = currentScriptId == null || currentScriptId === STANDALONE_SCRIPT_ID;

  // 当前选中的剧本（按 scriptId 匹配）
  const currentScript = !isStandalone
    ? scripts.find(s => s.id === currentScriptId)
    : null;

  // ---- 剧本绑定选择 ----
  const bindSelectedKey = isStandalone
    ? String(STANDALONE_SCRIPT_ID)
    : (currentScript ? String(currentScript.id) : String(STANDALONE_SCRIPT_ID));

  const handleBindChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = parseInt(e.target.value, 10);
    if (selectedId === STANDALONE_SCRIPT_ID) {
      onSelect(null);
      return;
    }
    const script = scripts.find(s => s.id === selectedId);
    if (script) {
      onSelect(script);
    }
  };

  // ---- 集数切换选择 ----
  const handleEpisodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = parseInt(e.target.value, 10);
    if (selectedId === CREATE_NEXT_EPISODE_ID) {
      onCreateNextEpisode?.();
      return;
    }
    const script = scripts.find(s => s.id === selectedId);
    if (script) {
      onSelect(script);
    }
  };

  // 按剧本标题分组（同一 title 的多集只显示一次 + 集数）
  const scriptGroups = React.useMemo(() => {
    const groupMap = new Map<string, Script[]>();
    for (const s of scripts) {
      const key = s.title || `剧本 #${s.id}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(s);
    }
    return groupMap;
  }, [scripts]);

  return (
    <div className="flex items-center gap-2">
      {/* 剧本绑定状态 */}
      <Select
        size="sm"
        aria-label="剧本绑定"
        selectedKeys={[bindSelectedKey]}
        onChange={handleBindChange}
        className="w-40"
        startContent={isStandalone
          ? <Pencil className="w-3.5 h-3.5 text-amber-400" />
          : <BookOpen className="w-3.5 h-3.5 text-violet-400" />
        }
        classNames={{
          trigger: "h-8 min-h-8 bg-[var(--accent)]/8 border-[var(--accent)]/20 hover:border-[var(--accent)]/50 data-[open=true]:border-[var(--accent)]/50",
          value: "text-sm font-semibold text-[var(--accent)] truncate",
          selectorIcon: "text-[var(--accent)]"
        }}
      >
        {[
          <SelectItem key={String(STANDALONE_SCRIPT_ID)} textValue="无参考剧本">
            <div className="flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-medium">无参考剧本</span>
            </div>
          </SelectItem>,
          ...Array.from(scriptGroups.entries()).map(([title, episodes]) => {
            // 每组取第一个 episode 的 id 作为 key（选中后切换到该剧本的第1集）
            const firstEp = episodes[0];
            return (
              <SelectItem key={String(firstEp.id)} textValue={title}>
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                  <span className="font-medium truncate">{title}</span>
                  {episodes.length > 1 && (
                    <span className="text-xs text-[var(--text-muted)] shrink-0">({episodes.length}集)</span>
                  )}
                </div>
              </SelectItem>
            );
          })
        ]}
      </Select>

      {/* 未绑剧本时：集数作为「进度标签」，纯前端 localStorage 持久化，不参与数据归档 */}
      {isStandalone && onStandaloneEpisodeChange && (() => {
        // 读取父组件传入的最大集数，确保 Select 保留所有已到达的集数选项，用户可自由前后切换
        const maxEp = Math.max(standaloneMaxEpisode || 0, currentEpisode || 1, 1);
        const options = Array.from({ length: maxEp }, (_, i) => i + 1);
        return (
          <>
            <div className="w-px h-5 bg-(--border-color)" />
            <Select
              size="sm"
              aria-label="切换进度集数"
              selectedKeys={[String(currentEpisode || 1)]}
              onChange={(e) => {
                const v = parseInt((e.target as HTMLSelectElement).value, 10);
                if (v === CREATE_NEXT_EPISODE_ID) {
                  // 无参考剧本模式下直接推进进度标签，不创建 DB 剧本
                  onStandaloneEpisodeChange(maxEp + 1);
                  return;
                }
                if (!isNaN(v) && v >= 1) onStandaloneEpisodeChange(v);
              }}
              className="w-28"
              startContent={<Film className="w-3.5 h-3.5 text-[var(--accent)]" />}
              classNames={{
                trigger: "h-8 min-h-8 bg-white/5 border-[var(--border-color)] hover:border-[var(--accent)]/40 data-[open=true]:border-[var(--accent)]/40",
                value: "text-sm font-medium text-[var(--text-primary)]",
              }}
            >
              {[
                ...options.map((ep) => (
                  <SelectItem key={String(ep)} textValue={`第${ep}集`}>
                    <span>第{ep}集</span>
                  </SelectItem>
                )),
                <SelectItem key={String(CREATE_NEXT_EPISODE_ID)} textValue="新建下一集">
                  <div className="flex items-center gap-1.5 text-[var(--accent)]">
                    <Plus className="w-3.5 h-3.5" />
                    <span className="font-medium">新建第{maxEp + 1}集</span>
                  </div>
                </SelectItem>
              ]}
            </Select>
            <button
              type="button"
              onClick={() => onStandaloneEpisodeChange(maxEp + 1)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[var(--border-color)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/10 text-[var(--accent)] transition-colors"
              title={`新建第${maxEp + 1}集`}
              aria-label="新建下一集"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </>
        );
      })()}

      {/* 集数切换器（绑定剧本后始终显示，包含「新建下一集」） */}
      {!isStandalone && (
        <>
          <div className="w-px h-5 bg-(--border-color)" />
          <Select
            size="sm"
            aria-label="切换集数"
            selectedKeys={currentScript ? [String(currentScript.id)] : [String(scripts[0]?.id)]}
            onChange={handleEpisodeChange}
            className="w-28"
            startContent={<Film className="w-3.5 h-3.5 text-[var(--accent)]" />}
            classNames={{
              trigger: "h-8 min-h-8 bg-white/5 border-[var(--border-color)] hover:border-[var(--accent)]/40 data-[open=true]:border-[var(--accent)]/40",
              value: "text-sm font-medium text-[var(--text-primary)]",
            }}
          >
            {[
              ...scripts.map((s) => (
                <SelectItem key={String(s.id)} textValue={`第${s.episode_number}集`}>
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <span className="shrink-0">第{s.episode_number}集</span>
                    {s.title && (
                      <span className="text-xs text-[var(--text-muted)] truncate">
                        {s.title}
                      </span>
                    )}
                  </div>
                </SelectItem>
              )),
              ...(onCreateNextEpisode ? [(
                <SelectItem key={String(CREATE_NEXT_EPISODE_ID)} textValue="新建下一集">
                  <div className="flex items-center gap-1.5 text-[var(--accent)]">
                    <Plus className="w-3.5 h-3.5" />
                    <span className="font-medium">新建下一集</span>
                  </div>
                </SelectItem>
              )] : [])
            ]}
          </Select>
        </>
      )}
    </div>
  );
};

export default EpisodeSelector;
