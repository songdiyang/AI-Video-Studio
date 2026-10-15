import React, { useState, useEffect } from 'react';
import { Button, Textarea, Select, SelectItem } from '@heroui/react';
import { ArrowLeft, Upload, Mic, Sparkles, ZoomIn, Layers } from 'lucide-react';
import { Character, CharacterState } from '../../StoryBoard/ResourcePanel/types';
import { usePreview } from '../../../components/PreviewProvider';
import { fetchCharacterStates } from '../../../services/assets';

interface CharacterDetailViewProps {
  character: Character;
  onBack: () => void;
  onGenerateImage?: (characterId: number, imageModel: string) => void;
  imageModel?: string;
}

const CharacterDetailView: React.FC<CharacterDetailViewProps> = ({ character, onBack, onGenerateImage, imageModel }) => {
  const [description, setDescription] = useState(
    character.description || character.appearance || ''
  );
  const [states, setStates] = useState<CharacterState[]>([]);
  const [selectedStateId, setSelectedStateId] = useState<number | null>(null);
  const { openPreview } = usePreview();

  // 加载角色状态
  useEffect(() => {
    if (character?.id) {
      fetchCharacterStates(character.id)
        .then(setStates)
        .catch(err => console.error('加载角色状态失败:', err));
    } else {
      setStates([]);
      setSelectedStateId(null);
    }
  }, [character?.id]);

  // 获取当前选中的状态
  const currentState = selectedStateId ? states.find(s => s.id === selectedStateId) : null;

  const mainImage = currentState?.image_url || character.imageUrl || character.frontViewUrl || character.characterSheetUrl;

  // 构建三视图 slides 用于灯箱预览
  const buildViewSlides = (startIndex: number = 0) => {
    const slides: { src: string; alt?: string }[] = [];
    const views = [
      { url: character.frontViewUrl, label: '正面视图' },
      { url: character.sideViewUrl, label: '侧面视图' },
      { url: character.backViewUrl, label: '背面视图' },
    ];
    views.forEach(v => {
      if (v.url) slides.push({ src: v.url, alt: v.label });
    });
    return { slides, index: Math.min(startIndex, slides.length - 1) };
  };

  const hasThreeViews = character.frontViewUrl || character.sideViewUrl || character.backViewUrl;

  return (
    <div className="flex flex-col h-full">
      {/* 顶部导航 */}
      <div 
        className="px-4 py-3 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <button onClick={onBack} className="p-1 transition-colors" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>返回角色列表</span>
        <span className="ml-auto text-sm font-semibold" style={{ color: 'var(--accent-primary)' }}>角色详情</span>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 状态选择器 */}
        {states.length > 0 && (
          <div className="rounded-lg p-3" style={{ backgroundColor: 'rgba(147, 51, 234, 0.1)', border: '1px solid rgba(147, 51, 234, 0.2)' }}>
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-3 h-3" style={{ color: '#a855f7' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>角色状态</span>
              <span className="text-[10px]" style={{ color: '#a855f7' }}>{states.length}</span>
            </div>
            <Select
              size="sm"
              placeholder="选择状态"
              selectedKeys={selectedStateId ? [selectedStateId.toString()] : []}
              onSelectionChange={(keys) => {
                const key = Array.from(keys)[0] as string;
                setSelectedStateId(key ? parseInt(key) : null);
              }}
              classNames={{
                trigger: "h-8",
                value: "text-xs"
              }}
            >
              {[
                <SelectItem key="default" textValue="默认状态">
                  默认状态
                </SelectItem>,
                ...states.map((state) => (
                  <SelectItem key={state.id.toString()} textValue={state.name}>
                    {state.name}
                  </SelectItem>
                ))
              ]}
            </Select>
          </div>
        )}

        {/* 角色图片 */}
        <div
          className="rounded-xl border-2 border-dashed overflow-hidden aspect-square flex items-center justify-center group relative cursor-pointer"
          style={{ 
            borderColor: 'var(--border-color)', 
            backgroundColor: 'var(--bg-input)' 
          }}
          onClick={() => {
            if (mainImage) {
              const { slides, index } = buildViewSlides(0);
              if (slides.length > 0) {
                openPreview(slides, index);
              } else {
                openPreview([{ src: mainImage, alt: character.name }], 0);
              }
            }
          }}
        >
          {mainImage ? (
            <>
              <img src={mainImage} alt={character.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ZoomIn className="w-6 h-6 text-white" />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-input)' }}>
                <span className="text-3xl">👤</span>
              </div>
              <p className="text-xs">暂无角色图片</p>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>编辑下方描述后点击生成</p>
            </div>
          )}
        </div>

        {/* 三视图预览 */}
        {hasThreeViews && (
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>三视图</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { url: character.frontViewUrl, label: '正面', idx: 0 },
                { url: character.sideViewUrl, label: '侧面', idx: 1 },
                { url: character.backViewUrl, label: '背面', idx: 2 },
              ].map(view => (
                <div key={view.label} className="relative group">
                  <p className="text-[10px] mb-1 text-center" style={{ color: 'var(--text-muted)' }}>{view.label}</p>
                  {view.url ? (
                    <div
                      className="aspect-[3/4] rounded-lg overflow-hidden cursor-pointer"
                      style={{ border: '1px solid var(--border-color)' }}
                      onClick={() => {
                        const { slides, index } = buildViewSlides(view.idx);
                        openPreview(slides, index);
                      }}
                    >
                      <img src={view.url} alt={view.label} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 mt-4 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ZoomIn className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="aspect-[3/4] rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
                    >
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>未生成</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 名字 + 语音 + 本地图 */}
        <div className="flex items-center gap-2">
          <div 
            className="flex-1 px-3 py-2 rounded-lg"
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{character.name}</span>
          </div>
          <button 
            className="p-2 rounded-lg transition-colors" 
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
            title="语音"
          >
            <Mic className="w-4 h-4" />
          </button>
          <button 
            className="px-3 py-2 rounded-lg text-xs transition-colors" 
            style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
            title="上传本地图片"
          >
            <Upload className="w-4 h-4" />
          </button>
        </div>

        {/* 参考图上传 */}
        <div className="flex items-center gap-3">
          <button 
            className="flex flex-col items-center gap-1 p-3 rounded-lg border border-dashed transition-all w-20"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
          >
            <Upload className="w-5 h-5" />
            <span className="text-[10px]">上传AI</span>
            <span className="text-[10px]">参考图</span>
          </button>
          <div className="flex-1">
            <Textarea
              value={description}
              onValueChange={setDescription}
              minRows={5}
              maxRows={10}
              placeholder="角色外貌、性格、服装等描述..."
              classNames={{
                input: 'text-xs',
                inputWrapper: '',
              }}
            />
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div 
        className="px-4 py-3 flex items-center gap-2"
        style={{ borderTop: '1px solid var(--border-color)' }}
      >
        <button 
          className="p-2 rounded-lg" 
          style={{ backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
          title="设置"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        </button>
        <Button
          className="flex-1 bg-gradient-to-r from-yellow-500 via-orange-500 to-pink-500 text-white font-semibold text-sm"
          startContent={<Sparkles className="w-4 h-4" />}
          onPress={() => {
            if (character.id && imageModel && onGenerateImage) {
              onGenerateImage(character.id, imageModel);
            }
          }}
          isDisabled={!imageModel || !character.id}
        >
          AI 生图
        </Button>
      </div>
    </div>
  );
};

export default CharacterDetailView;
