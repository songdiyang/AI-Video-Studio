import React from 'react';
import { Select, SelectItem } from '@heroui/react';
import { Film, Blocks, Plus } from 'lucide-react';

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
 * 集数/自由分镜选择器
 *  - 顶部固定提供"自由分镜"条目（对应 scriptId=null）
 *  - 后接全部剧集项
 *  - 底部可选提供"+ 新建下一集"入口（点击创建一集空白剧集）
 *  - 即使 scripts 为空，也会渲染"自由分镜"入口
 */
const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  scripts,
  currentEpisode,
  currentScriptId,
  onSelect,
  onCreateNextEpisode
}) => {
  const isStandalone = currentScriptId == null || currentScriptId === STANDALONE_SCRIPT_ID;
  const currentScript = !isStandalone ? scripts.find(s => s.episode_number === currentEpisode) : null;
  const selectedKey = isStandalone
    ? String(STANDALONE_SCRIPT_ID)
    : (currentScript ? String(currentScript.id) : String(STANDALONE_SCRIPT_ID));

  const handleSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = parseInt(e.target.value, 10);
    if (selectedId === CREATE_NEXT_EPISODE_ID) {
      // 点击"新建下一集"不改变当前选中，交给父组件处理
      onCreateNextEpisode?.();
      return;
    }
    if (selectedId === STANDALONE_SCRIPT_ID) {
      onSelect(null);
      return;
    }
    const script = scripts.find(s => s.id === selectedId);
    if (script) {
      onSelect(script);
    }
  };

  const items: React.ReactNode[] = [
    <SelectItem key={String(STANDALONE_SCRIPT_ID)} textValue="未绑定剧本">
      <div className="flex items-center gap-1.5">
        <Blocks className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span className="font-medium">未绑定剧本</span>
      </div>
    </SelectItem>,
    ...scripts.map((s) => (
      <SelectItem key={String(s.id)} textValue={`第${s.episode_number}集`}>
        <div className="flex items-center justify-between w-full">
          <span className="font-medium">第{s.episode_number}集</span>
          {s.title && <span className="text-xs text-[var(--text-muted)] truncate ml-2 max-w-[80px]">{s.title}</span>}
        </div>
      </SelectItem>
    ))
  ];
  if (onCreateNextEpisode) {
    items.push(
      <SelectItem key={String(CREATE_NEXT_EPISODE_ID)} textValue="新建下一集">
        <div className="flex items-center gap-1.5 text-[var(--accent)]">
          <Plus className="w-3.5 h-3.5" />
          <span className="font-medium">新建下一集</span>
        </div>
      </SelectItem>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select
        size="sm"
        aria-label="选择集数或未绑定剧本"
        selectedKeys={[selectedKey]}
        onChange={handleSelectionChange}
        className="w-40"
        startContent={isStandalone
          ? <Blocks className="w-3.5 h-3.5 text-[var(--accent)]" />
          : <Film className="w-3.5 h-3.5 text-[var(--accent)]" />
        }
        classNames={{
          trigger: "h-8 min-h-8 bg-[var(--accent)]/8 border-[var(--accent)]/20 hover:border-[var(--accent)]/50 data-[open=true]:border-[var(--accent)]/50",
          value: "text-sm font-semibold text-[var(--accent)]",
          selectorIcon: "text-[var(--accent)]"
        }}
      >
        {items as any}
      </Select>
    </div>
  );
};

export default EpisodeSelector;
