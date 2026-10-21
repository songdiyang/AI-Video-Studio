import React from 'react';

interface Script {
  id: number;
  episode_number: number;
  title: string;
  status: string;
}

interface DarkEpisodeSelectorProps {
  scripts: Script[];
  currentEpisode: number;
  onSelect: (script: Script) => void;
}

const DarkEpisodeSelector: React.FC<DarkEpisodeSelectorProps> = ({ scripts, currentEpisode, onSelect }) => {
  if (scripts.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>集数</span>
      <div className="flex gap-1">
        {scripts.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
            style={{
              backgroundColor: currentEpisode === s.episode_number 
                ? 'var(--accent-primary)' 
                : 'var(--bg-input)',
              color: currentEpisode === s.episode_number 
                ? 'white' 
                : 'var(--text-secondary)',
              border: `1px solid ${currentEpisode === s.episode_number ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            }}
          >
            {s.episode_number}
          </button>
        ))}
      </div>
    </div>
  );
};

export default DarkEpisodeSelector;
