import React from 'react';
import { Select, SelectItem, Divider } from '@heroui/react';
import { Film, Blocks, Plus, BookOpen, Pencil } from 'lucide-react';

interface Script {
  id: number;
  episode_number: number;
  title: string;
  status: string;
}

// "自由分镜"虚拟项 id（保证与真实 script id 不冲突）
export const STANDALONE_SCRIPT_ID = 0;
// "+ 新建下一集" 虚拟项 id（与真实 script id 不冲突）
export const CREATE_NEXT_EPISODE_ID = -1;

interface EpisodeSelectorProps {
  scripts: Script[];
  currentEpisode: number;
  /** 当前选中的 scriptId，null 表示自由分镜 */
  currentScriptId?: number | null;
  onSelect: (script: Script | null) => void;
  /**
   * 点击"+ 新建下一集"时回调。
   * 由父组件负责调用后端创建空白剧集（episodeNumber = max+1）并刷新列表。
   * 未提供时不渲染该入口。
   */
  onCreateNextEpisode?: () => void;
}

/**
 * 集数/剧本绑定选择器
 *  - 左侧：剧本绑定状态，可选择绑定哪个剧本（或未绑定）
 *  - 右侧：集数切换器（第1集、第2集...）+ "新建下一集"按钮
 */
const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  scripts,
  currentEpisode,
  currentScriptId,
  onSelect,
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
        <SelectItem key={String(STANDALONE_SCRIPT_ID)} textValue="自由创作">
          <div className="flex items-center gap-1.5">
            <Pencil className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-medium">自由创作</span>
          </div>
        </SelectItem>
        {scriptGroups.size > 0 && Array.from(scriptGroups.entries()).map(([title, episodes]) => {
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
        })}
      </Select>

      {/* 集数切换器（仅绑定了剧本且有多集时显示） */}
      {!isStandalone && scripts.length > 1 && (
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
            {scripts.map((s) => (
              <SelectItem key={String(s.id)} textValue={`第${s.episode_number}集`}>
                <div className="flex items-center justify-between w-full">
                  <span>第{s.episode_number}集</span>
                  {s.title && <span className="text-xs text-[var(--text-muted)] truncate ml-2 max-w-[80px]">{s.title}</span>}
                </div>
              </SelectItem>
            ))}
            {onCreateNextEpisode && (
              <SelectItem key={String(CREATE_NEXT_EPISODE_ID)} textValue="新建下一集">
                <div className="flex items-center gap-1.5 text-[var(--accent)]">
                  <Plus className="w-3.5 h-3.5" />
                  <span className="font-medium">新建下一集</span>
                </div>
              </SelectItem>
            )}
          </Select>
        </>
      )}
    </div>
  );
};

export default EpisodeSelector;
