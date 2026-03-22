import React, { useState, useEffect } from 'react';
import { Textarea, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Tooltip } from '@heroui/react';
import { Check, Edit2, Trash2, Play, Lock, Unlock, Image, Clapperboard, Pencil, Edit3 } from 'lucide-react';
import { StoryboardScene } from '../StoryBoard/useSceneManager';
import { Character } from '../StoryBoard/ResourcePanel/types';
import { Scene } from '../StoryBoard/ResourcePanel/useSceneData';
import AvatarSlot, { AddSlot } from './AvatarSlot';
import { DirectorAssistantModal, DirectorParams, DEFAULT_DIRECTOR_PARAMS } from './DirectorAssistant';

interface StoryboardRowProps {
  scene: StoryboardScene;
  index: number;
  dbCharacters: Character[];
  dbScenes: Scene[];
  onUpdateDescription: (id: number, desc: string) => Promise<boolean>;
  onDelete: (id: number) => void;
  onCharacterClick: (charName: string) => void;
  onSceneClick: (sceneName: string) => void;
  onPropClick: (propName: string) => void;
  onAddCharacter: (sceneId: number) => void;
  onAddScene: (sceneId: number) => void;
  onGenerateVideo: (id: number) => void;
  onGenerateImage: (id: number) => void;
  onUpdateDirectorParams?: (id: number, params: DirectorParams) => void;
  onOpenSketchEditor?: (id: number) => void;
  isGeneratingImage?: boolean;
  isGeneratingVideo?: boolean;
  isDragOver?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

const StoryboardRow: React.FC<StoryboardRowProps> = ({
  scene,
  index,
  dbCharacters,
  dbScenes,
  onUpdateDescription,
  onDelete,
  onCharacterClick,
  onSceneClick,
  onPropClick,
  onAddCharacter,
  onAddScene,
  onGenerateVideo,
  onGenerateImage,
  onUpdateDirectorParams,
  onOpenSketchEditor,
  isGeneratingImage,
  isGeneratingVideo,
  isDragOver,
  draggable,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(scene.description);
  const [isSaving, setIsSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [showDirectorAssistant, setShowDirectorAssistant] = useState(false);

  useEffect(() => {
    if (!editing) {
      setDraft(scene.description);
    }
  }, [scene.description, editing]);

  // 获取当前分镜的导演参数
  const currentDirectorParams: DirectorParams = scene.directorParams || DEFAULT_DIRECTOR_PARAMS;
  const hasDirectorParams = !!scene.directorParams;

  const save = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    const success = await onUpdateDescription(scene.id, draft);
    setIsSaving(false);

    if (success) {
      setEditing(false);
    }
  };

  // 匹配角色图片（优先用 linkedCharacters，回退到名字匹配）
  const getCharImage = (name: string) => {
    const linked = scene.linkedCharacters?.find(lc => lc.name === name);
    if (linked?.image_url) return linked.image_url;
    const c = dbCharacters.find(ch => ch.name === name);
    return c?.imageUrl || c?.frontViewUrl || undefined;
  };

  // 匹配场景图片（优先用 linkedScenes，回退到名字匹配）
  const getSceneImage = (name: string) => {
    const linked = scene.linkedScenes?.find(ls => ls.name === name);
    if (linked?.image_url) return linked.image_url;
    const s = dbScenes.find(sc => sc.name === name);
    return s?.image_url || undefined;
  };

  return (
    <>
    <tr
      className={`group transition-colors ${isDragOver ? 'bg-blue-100 dark:bg-cyan-900/20' : ''}`}
      style={{
        borderBottom: '1px solid var(--border-color)',
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <td className="px-3 py-3 w-16 text-center">
        <div className="flex flex-col items-center gap-1">
          <span 
            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold"
            style={{ 
              backgroundColor: 'var(--bg-input)', 
              color: 'var(--accent-primary)' 
            }}
          >
            {index + 1}
          </span>
          <button
            onClick={() => setLocked(!locked)}
            className="transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title={locked ? '解锁' : '锁定'}
          >
            {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 opacity-0 group-hover:opacity-100" />}
          </button>
        </div>
      </td>

      {/* 描述 */}
      <td className="px-3 py-3 min-w-[240px] max-w-[360px]">
        {editing ? (
          <div className="space-y-1.5">
            <Textarea
              value={draft}
              onValueChange={setDraft}
              minRows={2}
              maxRows={5}
              classNames={{
                input: 'text-xs',
                inputWrapper: 'min-h-0',
              }}
              style={{ 
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-input)',
              }}
            />
            <button
              onClick={save}
              disabled={isSaving}
              className="px-2 py-0.5 text-white text-[10px] rounded flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Check className="w-3 h-3" /> {isSaving ? '保存中...' : '保存'}
            </button>
          </div>
        ) : (
          <div className="relative group/desc">
            <p className="text-xs leading-relaxed line-clamp-4" style={{ color: 'var(--text-primary)' }}>
              {scene.description || '暂无描述'}
            </p>
            {scene.dialogue && (
              <p className="text-[10px] mt-1 italic truncate" style={{ color: 'var(--text-muted)' }}>💬 {scene.dialogue}</p>
            )}
            <button
              onClick={() => { setDraft(scene.description); setEditing(true); }}
              className="absolute top-0 right-0 p-1 opacity-0 group-hover/desc:opacity-100 transition-opacity"
              style={{ color: 'var(--text-muted)' }}
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </td>

      {/* 首/尾帧 */}
      <td className="px-3 py-3 w-[180px]">
        <div className="flex gap-1.5 items-center">
          {scene.startFrame ? (
            <div className="relative">
              <img src={scene.startFrame} alt="首帧" className="w-16 h-10 object-cover rounded" style={{ border: '1px solid var(--border-color)' }} />
              <span className="absolute bottom-0 left-0 bg-emerald-600/80 text-[8px] text-white px-1 rounded-tr">首</span>
              {/* 草图指示 */}
              {scene.sketchUrl && (
                <Tooltip content="已有草图">
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-500/90 flex items-center justify-center">
                    <Pencil className="w-2.5 h-2.5 text-white" />
                  </div>
                </Tooltip>
              )}
            </div>
          ) : (
            <div className="relative w-16 h-10 rounded border-dashed flex items-center justify-center text-[10px]" style={{ borderWidth: '1px', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
              首帧
              {/* 无首帧时的草图指示 */}
              {scene.sketchUrl && (
                <Tooltip content="已有草图">
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-500/90 flex items-center justify-center">
                    <Pencil className="w-2.5 h-2.5 text-white" />
                  </div>
                </Tooltip>
              )}
            </div>
          )}
          {scene.endFrame ? (
            <div className="relative">
              <img src={scene.endFrame} alt="尾帧" className="w-16 h-10 object-cover rounded" style={{ border: '1px solid var(--border-color)' }} />
              <span className="absolute bottom-0 left-0 bg-rose-600/80 text-[8px] text-white px-1 rounded-tr">尾</span>
            </div>
          ) : (
            <div className="w-16 h-10 rounded border-dashed flex items-center justify-center text-[10px]" style={{ borderWidth: '1px', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>尾帧</div>
          )}
          {/* 草图/生成按钮 */}
          <div className="flex flex-col gap-1">
            {!scene.startFrame && !scene.endFrame && (
              <button
                onClick={() => onGenerateImage(scene.id)}
                disabled={isGeneratingImage}
                className="w-8 h-5 rounded border-dashed flex items-center justify-center transition-all disabled:opacity-40"
                style={{ borderWidth: '1px', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                title="生成首尾帧"
              >
                {isGeneratingImage ? <span className="text-[10px]">...</span> : <Image className="w-3 h-3" />}
              </button>
            )}
            <Tooltip content={scene.sketchUrl ? "编辑草图" : "添加草图"}>
              <button
                onClick={() => onOpenSketchEditor?.(scene.id)}
                className={`w-8 h-5 rounded border flex items-center justify-center transition-all ${
                  scene.sketchUrl 
                    ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' 
                    : 'border-dashed border-purple-400/50 text-purple-400 hover:bg-purple-500/10'
                }`}
                title={scene.sketchUrl ? "编辑草图" : "添加草图"}
              >
                {scene.sketchUrl ? <Edit3 className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
              </button>
            </Tooltip>
          </div>
        </div>
      </td>

      {/* 出场人物 */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(scene.characters || []).map((name, i) => (
            <AvatarSlot key={i} type="character" name={name} imageUrl={getCharImage(name)} onClick={() => onCharacterClick(name)} />
          ))}
          <AddSlot type="character" onClick={() => onAddCharacter(scene.id)} />
        </div>
      </td>

      {/* 场景 */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          {scene.location ? (
            <AvatarSlot type="scene" name={scene.location} imageUrl={getSceneImage(scene.location)} onClick={() => onSceneClick(scene.location)} />
          ) : (
            <AddSlot type="scene" onClick={() => onAddScene(scene.id)} />
          )}
        </div>
      </td>

      {/* 道具 */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(scene.props || []).length > 0 ? (
            scene.props.map((p, i) => (
              <AvatarSlot key={i} type="prop" name={p} onClick={() => onPropClick(p)} />
            ))
          ) : (
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>—</span>
          )}
        </div>
      </td>

      {/* 导演参数 */}
      <td className="px-3 py-3 w-16 text-center">
        <Tooltip content={hasDirectorParams ? '编辑导演参数' : '添加导演参数'}>
          <button
            onClick={() => setShowDirectorAssistant(true)}
            className="p-2 rounded-lg transition-all"
            style={{
              backgroundColor: hasDirectorParams ? 'rgba(217, 119, 6, 0.2)' : 'var(--bg-input)',
              color: hasDirectorParams ? '#d97706' : 'var(--text-muted)',
            }}
            title="导演助手"
          >
            <Clapperboard className="w-4 h-4" />
          </button>
        </Tooltip>
      </td>

      {/* 视频 */}
      <td className="px-3 py-3 w-20 text-center">
        {scene.videoUrl ? (
          <button 
            onClick={() => setShowVideoPreview(true)} 
            className="inline-flex p-2 rounded-lg transition-all" 
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}
            title="播放视频"
          >
            <Play className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => onGenerateVideo(scene.id)}
            disabled={isGeneratingVideo}
            className="px-2 py-1.5 text-[10px] rounded-lg transition-all disabled:opacity-40"
            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)' }}
            title="生成视频"
          >
            {isGeneratingVideo ? '...' : '生成'}
          </button>
        )}
      </td>

      {/* 操作 */}
      <td className="px-3 py-3 w-12 text-center">
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="p-1.5 hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-all opacity-0 group-hover:opacity-100"
          style={{ color: 'var(--text-muted)' }}
          title="删除分镜"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>

    {/* 视频预览 */}
    <Modal isOpen={showVideoPreview} onOpenChange={setShowVideoPreview} size="2xl" classNames={{ base: "bg-slate-900/95 backdrop-blur-xl border border-slate-700/50" }}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex items-center gap-2 text-slate-100">
              <Play className="w-5 h-5 text-blue-400" />
              视频预览 - 分镜 {index + 1}
            </ModalHeader>
            <ModalBody>
              {scene.videoUrl ? (
                <video
                  src={scene.videoUrl}
                  controls
                  autoPlay
                  className="w-full rounded-lg"
                  style={{ maxHeight: '60vh' }}
                />
              ) : (
                <div className="text-center py-10 text-slate-500">暂无视频</div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" className="bg-slate-800/80 text-slate-300" onPress={onClose}>关闭</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>

    {/* 删除确认 */}
    <Modal isOpen={showDeleteConfirm} onOpenChange={setShowDeleteConfirm} size="sm">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="text-red-500">删除分镜</ModalHeader>
            <ModalBody>
              <p className="text-sm text-slate-600">确定要删除分镜 <span className="font-bold">#{index + 1}</span> 吗？此操作不可撤销。</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="flat" size="sm" onPress={onClose}>取消</Button>
              <Button size="sm" className="bg-red-500 text-white font-semibold" onPress={() => { onClose(); onDelete(scene.id); }}>确认删除</Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>

    {/* 导演助手 */}
    <DirectorAssistantModal
      isOpen={showDirectorAssistant}
      onClose={() => setShowDirectorAssistant(false)}
      initialParams={currentDirectorParams}
      sceneDescription={scene.description}
      onSave={(params) => {
        if (onUpdateDirectorParams) {
          onUpdateDirectorParams(scene.id, params);
        }
      }}
    />
    </>
  );
};

export default StoryboardRow;
