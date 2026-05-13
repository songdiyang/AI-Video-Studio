import React, { useState, useEffect } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Select, SelectItem, Slider, Tabs, Tab } from '@heroui/react';
import { Mic, User, Save, X, Volume2, Sparkles } from 'lucide-react';
import { getAuthToken } from '../../../services/auth';
import { useToast } from '../../../contexts/ToastContext';

export interface VoiceConfig {
  voiceId: string;
  voiceName: string;
  gender: 'male' | 'female' | 'neutral';
  age: 'child' | 'young' | 'adult' | 'senior';
  pitch: number;       // -100 到 100
  speed: number;       // 0.5 到 2.0
  volume: number;      // 0 到 1
  style?: string;      // cheerful, sad, angry, etc.
  emotion?: string;    // neutral, happy, sad, etc.
  description?: string;
}

export interface SpeakerVoice {
  id: number;
  name: string;
  speakerId: string;
  gender: string;
  language: string;
  status: string;
  provider: string;
}

interface CharacterVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterId: number;
  characterName: string;
  characterImageUrl?: string;
  initialVoiceConfig?: VoiceConfig | null;
  initialSpeakerVoiceId?: number | null;
  initialSpeakerVoice?: SpeakerVoice | null;
  onSave?: (voiceConfig: VoiceConfig | null, speakerVoiceId: number | null) => void;
}

// 预设声音选项
const VOICE_PRESETS = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', gender: 'female', age: 'young', description: '年轻女性，温柔甜美' },
  { id: 'zh-CN-YunxiNeural', name: '云希', gender: 'male', age: 'young', description: '年轻男性，阳光开朗' },
  { id: 'zh-CN-YunjianNeural', name: '云健', gender: 'male', age: 'adult', description: '成熟男性，稳重有力' },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊', gender: 'female', age: 'adult', description: '成熟女性，知性优雅' },
  { id: 'zh-CN-YunyangNeural', name: '云扬', gender: 'male', age: 'young', description: '年轻男性，新闻播报' },
  { id: 'zh-CN-XiaochenNeural', name: '晓辰', gender: 'female', age: 'child', description: '儿童女声，天真可爱' },
  { id: 'zh-CN-XiaohanNeural', name: '晓涵', gender: 'female', age: 'young', description: '年轻女性，活泼俏皮' },
  { id: 'zh-CN-XiaomengNeural', name: '晓梦', gender: 'female', age: 'young', description: '年轻女性，梦幻柔美' },
  { id: 'zh-CN-XiaomoNeural', name: '晓墨', gender: 'female', age: 'adult', description: '成熟女性，沉稳大气' },
  { id: 'zh-CN-XiaoruiNeural', name: '晓睿', gender: 'female', age: 'senior', description: '年长女性，慈祥温和' },
  { id: 'zh-CN-XiaoshuangNeural', name: '晓双', gender: 'female', age: 'child', description: '儿童女声，清脆明亮' },
  { id: 'zh-CN-XiaoxuanNeural', name: '晓萱', gender: 'female', age: 'young', description: '年轻女性，知性文艺' },
  { id: 'zh-CN-XiaoyanNeural', name: '晓颜', gender: 'female', age: 'young', description: '年轻女性，甜美可人' },
  { id: 'zh-CN-XiaoyouNeural', name: '晓悠', gender: 'female', age: 'child', description: '儿童女声，童真稚嫩' },
  { id: 'zh-CN-XiaozhenNeural', name: '晓甄', gender: 'female', age: 'adult', description: '成熟女性，专业严谨' },
  { id: 'zh-CN-YunfengNeural', name: '云枫', gender: 'male', age: 'adult', description: '成熟男性，低沉磁性' },
  { id: 'zh-CN-YunhaoNeural', name: '云皓', gender: 'male', age: 'adult', description: '成熟男性，浑厚有力' },
  { id: 'zh-CN-YunxiaNeural', name: '云夏', gender: 'male', age: 'child', description: '儿童男声，活泼好动' },
  { id: 'zh-CN-YunyeNeural', name: '云野', gender: 'male', age: 'young', description: '年轻男性，清新自然' },
  { id: 'zh-CN-YunzeNeural', name: '云泽', gender: 'male', age: 'adult', description: '成熟男性，沉稳睿智' },
  { id: 'custom', name: '自定义', gender: 'neutral', age: 'adult', description: '自定义声音配置' },
];

const VOICE_STYLES = [
  { value: 'general', label: '默认' },
  { value: 'cheerful', label: '开心' },
  { value: 'sad', label: '悲伤' },
  { value: 'angry', label: '愤怒' },
  { value: 'fearful', label: '恐惧' },
  { value: 'gentle', label: '温柔' },
  { value: 'serious', label: '严肃' },
  { value: 'affectionate', label: '深情' },
  { value: 'lyrical', label: '抒情' },
  { value: 'newscast', label: '新闻' },
];

const CharacterVoiceModal: React.FC<CharacterVoiceModalProps> = ({
  isOpen,
  onClose,
  characterId,
  characterName,
  characterImageUrl,
  initialVoiceConfig,
  initialSpeakerVoiceId,
  initialSpeakerVoice,
  onSave
}) => {
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'preset' | 'custom'>('preset');

  // 预设声音配置
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({
    voiceId: '',
    voiceName: '',
    gender: 'neutral',
    age: 'adult',
    pitch: 0,
    speed: 1.0,
    volume: 1.0,
    style: 'general',
    emotion: 'neutral',
    description: ''
  });

  // 自定义音色
  const [speakerVoices, setSpeakerVoices] = useState<SpeakerVoice[]>([]);
  const [selectedSpeakerVoiceId, setSelectedSpeakerVoiceId] = useState<number | null>(null);
  const [loadingVoices, setLoadingVoices] = useState(false);

  // 初始化配置
  useEffect(() => {
    if (isOpen) {
      if (initialSpeakerVoiceId && initialSpeakerVoice) {
        // 有自定义音色，切换到自定义tab
        setActiveTab('custom');
        setSelectedSpeakerVoiceId(initialSpeakerVoiceId);
        setVoiceConfig({
          voiceId: '', voiceName: '', gender: 'neutral', age: 'adult',
          pitch: 0, speed: 1.0, volume: 1.0, style: 'general', emotion: 'neutral', description: ''
        });
      } else if (initialVoiceConfig) {
        // 有预设声音配置
        setActiveTab('preset');
        setVoiceConfig(initialVoiceConfig);
        setSelectedSpeakerVoiceId(null);
      } else {
        // 无配置，重置
        setActiveTab('preset');
        setVoiceConfig({
          voiceId: '', voiceName: '', gender: 'neutral', age: 'adult',
          pitch: 0, speed: 1.0, volume: 1.0, style: 'general', emotion: 'neutral', description: ''
        });
        setSelectedSpeakerVoiceId(null);
      }

      // 加载用户自定义音色列表
      fetchSpeakerVoices();
    }
  }, [initialVoiceConfig, initialSpeakerVoiceId, initialSpeakerVoice, isOpen]);

  // 加载用户自定义音色
  const fetchSpeakerVoices = async () => {
    setLoadingVoices(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/speaker-voices?status=ready', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSpeakerVoices(data.voices || []);
      }
    } catch (err) {
      console.error('加载自定义音色失败:', err);
    } finally {
      setLoadingVoices(false);
    }
  };

  // 选择预设声音
  const handlePresetSelect = (presetId: string) => {
    const preset = VOICE_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setVoiceConfig(prev => ({
        ...prev,
        voiceId: preset.id,
        voiceName: preset.name,
        gender: preset.gender as VoiceConfig['gender'],
        age: preset.age as VoiceConfig['age'],
        description: preset.description
      }));
    }
  };

  // 保存配置
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const token = getAuthToken();

      if (activeTab === 'custom' && selectedSpeakerVoiceId) {
        // 保存自定义音色绑定
        const res = await fetch(`/api/characters/${characterId}/voice`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            speakerVoiceId: selectedSpeakerVoiceId,
            voiceConfig: null
          })
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || '保存失败');
        }

        showToast('自定义音色已绑定', 'success');
        onSave?.(null, selectedSpeakerVoiceId);
        onClose();
      } else if (activeTab === 'preset' && voiceConfig.voiceId) {
        // 保存预设声音配置
        const res = await fetch(`/api/characters/${characterId}/voice`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            speakerVoiceId: null,
            ...voiceConfig
          })
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || '保存失败');
        }

        showToast('声音配置已保存', 'success');
        onSave?.(voiceConfig, null);
        onClose();
      } else {
        showToast('请选择一种声音', 'warning');
      }
    } catch (error: any) {
      console.error('[CharacterVoiceModal] 保存失败:', error);
      showToast(error.message || '保存声音配置失败', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 清除配置
  const handleClear = async () => {
    setIsSaving(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/characters/${characterId}/voice`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ speakerVoiceId: null })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '清除失败');
      }

      showToast('声音配置已清除', 'success');
      onSave?.(null, null);
      onClose();
    } catch (error: any) {
      showToast(error.message || '清除失败', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      classNames={{
        base: "bg-[var(--bg-card)] border border-[var(--border-color)]",
        header: "border-b border-[var(--border-color)]",
        body: "py-4",
        footer: "border-t border-[var(--border-color)]"
      }}
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
            {characterImageUrl ? (
              <img src={characterImageUrl} alt={characterName} className="w-full h-full rounded-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-purple-400" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{characterName} - 声音设置</h3>
            <p className="text-xs text-[var(--text-muted)]">配置角色的专属声音</p>
          </div>
        </ModalHeader>

        <ModalBody className="space-y-4">
          {/* 声音来源选择 */}
          <Tabs
            selectedKey={activeTab}
            onSelectionChange={(key) => setActiveTab(key as 'preset' | 'custom')}
            classNames={{
              tabList: "bg-[var(--bg-app)]",
              tab: "text-[var(--text-secondary)]",
              tabContent: "text-[var(--text-primary)]"
            }}
          >
            <Tab key="preset" title={
              <div className="flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5" />
                <span>预设声音</span>
              </div>
            }>
              <div className="space-y-4 pt-2">
                {/* 声音选择 */}
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                    选择声音
                  </label>
                  <Select
                    aria-label="选择声音"
                    placeholder="选择预设声音"
                    selectedKeys={voiceConfig.voiceId ? [voiceConfig.voiceId] : []}
                    onChange={(e) => handlePresetSelect(e.target.value)}
                    classNames={{
                      trigger: "bg-[var(--bg-app)] border-[var(--border-color)]",
                      value: "text-[var(--text-primary)]"
                    }}
                  >
                    {VOICE_PRESETS.map((preset) => (
                      <SelectItem key={preset.id} textValue={preset.name}>
                        <div className="flex items-center gap-2">
                          <Mic className={`w-4 h-4 ${preset.gender === 'female' ? 'text-pink-400' : preset.gender === 'male' ? 'text-blue-400' : 'text-gray-400'}`} />
                          <div>
                            <p className="font-medium">{preset.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">{preset.description}</p>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </Select>
                </div>

                {/* 当前选中的声音信息 */}
                {voiceConfig.voiceId && (
                  <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <Volume2 className="w-4 h-4 text-purple-400" />
                      <span className="font-medium text-purple-300">{voiceConfig.voiceName}</span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">{voiceConfig.description}</p>
                  </div>
                )}

                {/* 声音风格 */}
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                    说话风格
                  </label>
                  <Select
                    aria-label="说话风格"
                    placeholder="选择说话风格"
                    selectedKeys={voiceConfig.style ? [voiceConfig.style] : ['general']}
                    onChange={(e) => setVoiceConfig(prev => ({ ...prev, style: e.target.value }))}
                    classNames={{
                      trigger: "bg-[var(--bg-app)] border-[var(--border-color)]",
                      value: "text-[var(--text-primary)]"
                    }}
                  >
                    {VOICE_STYLES.map((style) => (
                      <SelectItem key={style.value}>{style.label}</SelectItem>
                    ))}
                  </Select>
                </div>

                {/* 语调参数 */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                      语调 ({voiceConfig.pitch > 0 ? '+' : ''}{voiceConfig.pitch}%)
                    </label>
                    <Slider
                      size="sm"
                      step={5}
                      minValue={-50}
                      maxValue={50}
                      value={voiceConfig.pitch}
                      onChange={(value) => setVoiceConfig(prev => ({ ...prev, pitch: value as number }))}
                      className="max-w-full"
                      classNames={{
                        track: "bg-[var(--bg-app)]",
                        filler: "bg-purple-500"
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                      语速 ({voiceConfig.speed.toFixed(1)}x)
                    </label>
                    <Slider
                      size="sm"
                      step={0.1}
                      minValue={0.5}
                      maxValue={2.0}
                      value={voiceConfig.speed}
                      onChange={(value) => setVoiceConfig(prev => ({ ...prev, speed: value as number }))}
                      className="max-w-full"
                      classNames={{
                        track: "bg-[var(--bg-app)]",
                        filler: "bg-blue-500"
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                      音量 ({Math.round(voiceConfig.volume * 100)}%)
                    </label>
                    <Slider
                      size="sm"
                      step={0.05}
                      minValue={0}
                      maxValue={1}
                      value={voiceConfig.volume}
                      onChange={(value) => setVoiceConfig(prev => ({ ...prev, volume: value as number }))}
                      className="max-w-full"
                      classNames={{
                        track: "bg-[var(--bg-app)]",
                        filler: "bg-green-500"
                      }}
                    />
                  </div>
                </div>

                {/* 自定义描述 */}
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                    声音描述（可选）
                  </label>
                  <Input
                    placeholder="描述这个角色声音的特点，如：低沉磁性、活泼可爱..."
                    value={voiceConfig.description || ''}
                    onChange={(e) => setVoiceConfig(prev => ({ ...prev, description: e.target.value }))}
                    classNames={{
                      inputWrapper: "bg-[var(--bg-app)] border-[var(--border-color)]",
                      input: "text-[var(--text-primary)]"
                    }}
                  />
                </div>
              </div>
            </Tab>

            <Tab key="custom" title={
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>我的音色</span>
              </div>
            }>
              <div className="space-y-4 pt-2">
                {loadingVoices ? (
                  <div className="text-center py-8 text-[var(--text-muted)]">
                    <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2" />
                    <p className="text-sm">加载音色中...</p>
                  </div>
                ) : speakerVoices.length === 0 ? (
                  <div className="text-center py-8">
                    <Volume2 className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
                    <p className="text-sm text-[var(--text-muted)] mb-2">暂无自定义音色</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      您可以通过声音复刻功能创建自己的专属音色
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                      选择自定义音色
                    </label>
                    <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                      {speakerVoices.map((voice) => (
                        <button
                          key={voice.id}
                          onClick={() => setSelectedSpeakerVoiceId(voice.id)}
                          className={`flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                            selectedSpeakerVoiceId === voice.id
                              ? 'bg-purple-500/10 border-purple-500/30'
                              : 'bg-[var(--bg-app)] border-[var(--border-color)] hover:border-purple-500/20'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            selectedSpeakerVoiceId === voice.id ? 'bg-purple-500/20' : 'bg-[var(--bg-card)]'
                          }`}>
                            <Sparkles className={`w-5 h-5 ${
                              selectedSpeakerVoiceId === voice.id ? 'text-purple-400' : 'text-[var(--text-muted)]'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                              {voice.name}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {voice.gender === 'male' ? '男' : voice.gender === 'female' ? '女' : '中性'}
                              {' · '}
                              {voice.language === 'zh-CN' ? '中文' : voice.language}
                              {' · '}
                              <span className="text-green-400">可用</span>
                            </p>
                          </div>
                          {selectedSpeakerVoiceId === voice.id && (
                            <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Tab>
          </Tabs>
        </ModalBody>

        <ModalFooter className="flex justify-between">
          <div>
            {(initialVoiceConfig || initialSpeakerVoiceId) && (
              <Button
                variant="flat"
                onPress={handleClear}
                isLoading={isSaving}
                className="bg-transparent text-red-400 hover:text-red-300"
              >
                清除配置
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="flat"
              onPress={onClose}
              className="bg-transparent text-[var(--text-muted)]"
              startContent={<X className="w-4 h-4" />}
            >
              取消
            </Button>
            <Button
              className="bg-purple-500 text-white"
              onPress={handleSave}
              isLoading={isSaving}
              startContent={<Save className="w-4 h-4" />}
            >
              保存配置
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CharacterVoiceModal;
