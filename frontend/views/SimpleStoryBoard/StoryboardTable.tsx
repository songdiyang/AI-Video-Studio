import React, { useState } from 'react';
import { Button } from '@heroui/react';
import { Plus, Wand2 } from 'lucide-react';
import { StoryboardScene } from '../StoryBoard/useSceneManager';
import { Character } from '../StoryBoard/ResourcePanel/types';
import { Scene } from '../StoryBoard/ResourcePanel/useSceneData';
import { TaskState } from '../../hooks/useTaskRunner';
import StoryboardRow from './StoryboardRow';

interface StoryboardTableProps {
  scenes: StoryboardScene[];
  dbCharacters: Character[];
  dbScenes: Scene[];
  tasks: Record<string, TaskState>;
  onAddScene: () => void;
  onDeleteScene: (id: number) => void;
  onUpdateDescription: (id: number, desc: string) => Promise<boolean>;
  onGenerateVideo: (id: number) => Promise<{ success: boolean; error?: string }>;
  onGenerateImage: (id: number, prompt: string) => Promise<{ success: boolean; error?: string }>;
  onCharacterClick: (name: string) => void;
  onSceneClick: (name: string) => void;
  onPropClick: (name: string) => void;
  onAddCharacterToScene: (sceneId: number) => void;
  onAddSceneToScene: (sceneId: number) => void;
  onReorderScenes: (newScenes: StoryboardScene[]) => void;
  onAutoGenerate?: () => void;
  isAutoGenerating?: boolean;
}

const COLUMNS = [
  { key: 'idx', label: '序号', width: 'w-16' },
  { key: 'desc', label: '分镜描述', width: 'min-w-[240px]' },
  { key: 'frames', label: '首/尾帧', width: 'w-[140px]' },
  { key: 'chars', label: '出场人物', width: 'min-w-[120px]' },
  { key: 'scene', label: '场景', width: 'w-[80px]' },
  { key: 'props', label: '道具', width: 'w-[80px]' },
  { key: 'director', label: '导演', width: 'w-16' },
  { key: 'video', label: '视频', width: 'w-20' },
  { key: 'actions', label: '操作', width: 'w-12' },
];

const StoryboardTable: React.FC<StoryboardTableProps> = ({
  scenes,
  dbCharacters,
  dbScenes,
  tasks,
  onAddScene,
  onDeleteScene,
  onUpdateDescription,
  onGenerateVideo,
  onGenerateImage,
  onCharacterClick,
  onSceneClick,
  onPropClick,
  onAddCharacterToScene,
  onAddSceneToScene,
  onReorderScenes,
  onAutoGenerate,
  isAutoGenerating,
}) => {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) setOverIdx(idx);
  };
  const handleDrop = (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== dropIdx) {
      const next = [...scenes];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dropIdx, 0, moved);
      onReorderScenes(next);
    }
    setDragIdx(null);
    setOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 工具栏 */}
      <div 
        className="px-4 py-2.5 border-b flex items-center justify-between"
        style={{ 
          backgroundColor: 'var(--bg-card)', 
          borderColor: 'var(--border-color)' 
        }}
      >
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          共 <span className="font-semibold" style={{ color: 'var(--accent-primary)' }}>{scenes.length}</span> 个分镜
        </span>
        <div className="flex items-center gap-2">
          {onAutoGenerate && (
            <Button
              size="sm"
              isLoading={isAutoGenerating}
              isDisabled={isAutoGenerating}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold"
              startContent={<Wand2 className="w-3.5 h-3.5" />}
              onPress={onAutoGenerate}
            >
              {isAutoGenerating ? '生成中...' : '智能生成'}
            </Button>
          )}
          <Button
            size="sm"
            className="text-xs font-medium"
            style={{
              backgroundColor: 'var(--bg-input)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
            }}
            startContent={<Plus className="w-3.5 h-3.5" />}
            onPress={onAddScene}
          >
            添加分镜
          </Button>
        </div>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
              {COLUMNS.map(col => (
                <th key={col.key} className={`px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider ${col.width}`} style={{ color: 'var(--text-muted)' }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenes.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
                  <Wand2 className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm">暂无分镜</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>点击「智能生成」自动创建，或手动添加</p>
                </td>
              </tr>
            ) : (
              scenes.map((scene, idx) => (
                <StoryboardRow
                  key={scene.id}
                  scene={scene}
                  index={idx}
                  dbCharacters={dbCharacters}
                  dbScenes={dbScenes}
                  onUpdateDescription={onUpdateDescription}
                  onDelete={onDeleteScene}
                  onCharacterClick={onCharacterClick}
                  onSceneClick={onSceneClick}
                  onPropClick={onPropClick}
                  onAddCharacter={onAddCharacterToScene}
                  onAddScene={onAddSceneToScene}
                  onGenerateVideo={(id) => onGenerateVideo(id)}
                  onGenerateImage={(id) => onGenerateImage(id, scene.description || '')}
                  isGeneratingImage={tasks[`img_${scene.id}`]?.status === 'pending' || tasks[`img_${scene.id}`]?.status === 'running'}
                  isGeneratingVideo={tasks[`vid_${scene.id}`]?.status === 'pending' || tasks[`vid_${scene.id}`]?.status === 'running'}
                  isDragOver={overIdx === idx}
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragLeave={() => setOverIdx(null)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StoryboardTable;
