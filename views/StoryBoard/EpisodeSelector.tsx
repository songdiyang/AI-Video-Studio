import React from 'react';
import { Select, SelectItem } from '@heroui/react';
import { Film } from 'lucide-react';

interface Script {
  id: number;
  episode_number: number;
  title: string;
  status: string;
}

interface EpisodeSelectorProps {
  scripts: Script[];
  currentEpisode: number;
  onSelect: (script: Script) => void;
}

const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  scripts,
  currentEpisode,
  onSelect
}) => {
  if (scripts.length === 0) return null;

  const currentScript = scripts.find(s => s.episode_number === currentEpisode);
  const selectedKey = currentScript ? String(currentScript.id) : undefined;

  const handleSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = parseInt(e.target.value, 10);
    const script = scripts.find(s => s.id === selectedId);
    if (script) {
      onSelect(script);
    }
  };

  // 只有一集时直接显示标签，不需要下拉
  if (scripts.length === 1) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--accent)]/10 border border-[var(--accent)]/20">
        <Film className="w-3.5 h-3.5 text-[var(--accent)]" />
        <span className="text-sm font-semibold text-[var(--accent)]">第{currentEpisode}集</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Select
        size="sm"
        aria-label="选择集数"
        selectedKeys={selectedKey ? [selectedKey] : []}
        onChange={handleSelectionChange}
        className="w-36"
        startContent={<Film className="w-3.5 h-3.5 text-[var(--accent)]" />}
        classNames={{
          trigger: "h-8 min-h-8 bg-[var(--accent)]/8 border-[var(--accent)]/20 hover:border-[var(--accent)]/50 data-[open=true]:border-[var(--accent)]/50",
          value: "text-sm font-semibold text-[var(--accent)]",
          selectorIcon: "text-[var(--accent)]"
        }}
      >
        {scripts.map((s) => (
          <SelectItem key={String(s.id)} textValue={`第${s.episode_number}集`}>
            <div className="flex items-center justify-between w-full">
              <span className="font-medium">第{s.episode_number}集</span>
              {s.title && <span className="text-xs text-[var(--text-muted)] truncate ml-2 max-w-[80px]">{s.title}</span>}
            </div>
          </SelectItem>
        ))}
      </Select>
    </div>
  );
};

export default EpisodeSelector;
