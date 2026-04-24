import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Textarea, Select, SelectItem, Switch, Chip, Spinner } from '@heroui/react';
import { ArrowLeft, Sparkles, Upload, FileText, Wand2, X, File } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import AIModelSelector, { AIModel } from '../../components/AIModelSelector';
import { getAuthToken } from '../../services/auth';
import {
  RecipeType,
  createMarketplaceTemplate,
  analyzeRecipeText,
} from '../../services/marketplace';

// 配方类型配置
const RECIPE_TYPE_CONFIG: Record<RecipeType, { label: string; desc: string; icon: React.ReactNode; color: string }> = {
  character: {
    label: '角色配方',
    desc: '卖角色的提示词配方，买家购买后用AI重新生成',
    icon: <span className="text-2xl">👤</span>,
    color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/40',
  },
  scene: {
    label: '场景配方',
    desc: '卖场景的提示词配方，买家购买后用AI重新生成',
    icon: <span className="text-2xl">🏔️</span>,
    color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/40',
  },
  script: {
    label: '剧本配方',
    desc: '卖完整的剧本文件，买家获取后可导入项目使用',
    icon: <span className="text-2xl">📖</span>,
    color: 'from-amber-500/20 to-orange-500/20 border-amber-500/40',
  },
};

const inputClassNames = {
  input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
  label: "text-[var(--text-secondary)] font-medium",
  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-violet-500/40 shadow-sm",
};

const selectClassNames = {
  trigger: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-violet-500/40 shadow-sm data-[hover=true]:bg-[var(--bg-card)]",
  value: "text-[var(--text-primary)]",
  label: "text-[var(--text-secondary)] font-medium",
  popoverContent: "bg-[var(--bg-elevated)] border border-[var(--border-color)]",
};

const CreateRecipe: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 基本字段
  const [recipeType, setRecipeType] = useState<RecipeType>('character');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  // 角色配方字段
  const [appearance, setAppearance] = useState('');
  const [personality, setPersonality] = useState('');

  // 场景配方字段
  const [environment, setEnvironment] = useState('');
  const [lighting, setLighting] = useState('');
  const [mood, setMood] = useState('');

  // 剧本配方字段
  const [scriptContent, setScriptContent] = useState('');
  const [scriptFileName, setScriptFileName] = useState('');
  const [scriptFormat, setScriptFormat] = useState<'md' | 'txt'>('md');

  // AI 分析
  const [analyzeText, setAnalyzeText] = useState('');
  const [selectedTextModel, setSelectedTextModel] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiModels, setAiModels] = useState<AIModel[]>([]);

  // 加载 AI 模型列表
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch('/api/ai-models', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setAiModels(data.models || []);
        }
      } catch (err) {
        console.error('[CreateRecipe] 加载模型列表失败:', err);
      }
    };
    fetchModels();
  }, []);

  // 定价
  const [price, setPrice] = useState('0');
  const [isFree, setIsFree] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 切换配方类型时重置字段
  const handleRecipeTypeChange = (type: RecipeType) => {
    setRecipeType(type);
    setAnalyzeText('');
  };

  // AI 分析
  const handleAnalyze = useCallback(async () => {
    if (!analyzeText.trim()) {
      showToast('请先粘贴待分析的文本', 'error');
      return;
    }
    if (!selectedTextModel) {
      showToast('请先选择文本模型', 'error');
      return;
    }
    setIsAnalyzing(true);
    try {
      const { result } = await analyzeRecipeText({
        text: analyzeText,
        recipeType: recipeType as 'character' | 'scene',
        textModel: selectedTextModel,
      });

      // 填充表单
      if (result.name) setName(result.name);
      if (result.description) setDescription(result.description);
      if (result.tags) setTags(result.tags);

      if (recipeType === 'character') {
        if (result.appearance) setAppearance(result.appearance);
        if (result.personality) setPersonality(result.personality);
      } else if (recipeType === 'scene') {
        if (result.environment) setEnvironment(result.environment);
        if (result.lighting) setLighting(result.lighting);
        if (result.mood) setMood(result.mood);
      }
      showToast('AI 分析完成，已填充表单', 'success');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'AI 分析失败', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [analyzeText, recipeType, selectedTextModel, showToast]);

  // 剧本文件上传
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'md' && ext !== 'txt' && ext !== 'markdown') {
      showToast('仅支持 .md 或 .txt 文件', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      setScriptContent(content);
      setScriptFileName(file.name);
      setScriptFormat(ext === 'txt' ? 'txt' : 'md');
      if (!name) {
        setName(file.name.replace(/\.(md|txt|markdown)$/i, ''));
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // 提交
  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast('请输入配方名称', 'error');
      return;
    }

    // 构建配方数据
    let recipeData: any = { type: recipeType };

    if (recipeType === 'character') {
      if (!appearance.trim()) {
        showToast('请填写外观特征，这是AI生成角色的核心参数', 'error');
        return;
      }
      recipeData = {
        type: 'character',
        appearance,
        personality,
        description,
        name,
      };
    } else if (recipeType === 'scene') {
      if (!environment.trim() && !description.trim()) {
        showToast('请填写环境描述或场景描述', 'error');
        return;
      }
      recipeData = {
        type: 'scene',
        environment,
        lighting,
        mood,
        description,
        name,
      };
    } else if (recipeType === 'script') {
      if (!scriptContent.trim()) {
        showToast('请上传或粘贴剧本内容', 'error');
        return;
      }
      recipeData = {
        type: 'script',
        content: scriptContent,
        fileName: scriptFileName,
        format: scriptFormat,
      };
    }

    setSubmitting(true);
    try {
      const result = await createMarketplaceTemplate({
        name: name.trim(),
        description: description.trim(),
        recipeType,
        tags: tags.trim(),
        price: isFree ? 0 : parseInt(price, 10) || 0,
        isFree,
        thumbnailUrl: thumbnailUrl.trim() || undefined,
        isPublic,
        recipeData,
        templateData: {},
      });
      showToast(result.message || '发布成功', 'success');
      navigate('/marketplace/seller');
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : '发布失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full bg-[var(--bg-app)] overflow-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* 头部 */}
        <div className="flex items-center gap-3">
          <Button variant="light" isIconOnly onPress={() => navigate(-1)} className="text-[var(--text-secondary)]">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">发布提示词配方</h1>
            <p className="text-sm text-[var(--text-muted)]">创建配方并上架到模板市场</p>
          </div>
        </div>

        {/* 配方类型选择 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h2 className="text-base font-semibold text-[var(--text-primary)]">选择配方类型</h2>
          <div className="grid grid-cols-3 gap-3">
            {(Object.entries(RECIPE_TYPE_CONFIG) as [RecipeType, typeof RECIPE_TYPE_CONFIG.character][]).map(([key, config]) => (
              <button
                key={key}
                onClick={() => handleRecipeTypeChange(key)}
                className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                  recipeType === key
                    ? `bg-gradient-to-br ${config.color} shadow-lg`
                    : 'bg-[var(--bg-card)] border-[var(--border-color)] hover:border-[var(--text-muted)]/40'
                }`}
              >
                {recipeType === key && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
                <div className="mb-2">{config.icon}</div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{config.label}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{config.desc}</p>
              </button>
            ))}
          </div>
        </motion.div>

        {/* ============= 角色配方表单 ============= */}
        {recipeType === 'character' && (
          <>
            {/* AI 智能分析 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="p-5 rounded-2xl bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 border border-violet-500/20 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-violet-400" /> AI 智能分析
                </h2>
                <AIModelSelector
                  models={aiModels}
                  filterType="TEXT"
                  selectedModel={selectedTextModel}
                  onModelChange={setSelectedTextModel}
                  size="sm"
                />
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                粘贴一大段描述文字，AI 将自动提取角色的外观特征、性格等信息并填入表单
              </p>
              <Textarea
                placeholder="在这里粘贴角色的描述文字，越详细越好…&#10;&#10;例如：一个身穿黑色学生制服的短发少女，深蓝色眼睛，右耳戴一枚银色耳钉，背着深红色双肩包，性格内向但善良…"
                value={analyzeText}
                onValueChange={setAnalyzeText}
                minRows={4}
                maxRows={8}
                classNames={{
                  input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                  inputWrapper: "bg-[var(--bg-input)] border border-violet-500/20 hover:border-violet-500/40",
                }}
              />
              <Button
                color="secondary"
                startContent={isAnalyzing ? <Spinner size="sm" color="current" /> : <Wand2 className="w-4 h-4" />}
                onPress={handleAnalyze}
                isLoading={isAnalyzing}
                isDisabled={!analyzeText.trim() || !selectedTextModel}
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white"
              >
                {isAnalyzing ? '分析中...' : 'AI 分析填充'}
              </Button>
            </motion.div>

            {/* 角色基本信息 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4 p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)]"
            >
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <span className="text-lg">👤</span> 角色信息
              </h2>

              <Input
                label="角色名称"
                placeholder="输入角色名称"
                value={name}
                onValueChange={setName}
                isRequired
                classNames={inputClassNames}
              />

              <Textarea
                label="角色描述"
                placeholder="输入角色简介（背景、身份、在故事中的作用等）"
                value={description}
                onValueChange={setDescription}
                minRows={3}
                classNames={inputClassNames}
              />

              {/* 外观特征 - 核心参数，高亮 */}
              <div className="space-y-1.5">
                <Textarea
                  label="外观特征（AI生成核心参数）"
                  placeholder={"请详细描述角色的固定外观特征，AI 将以此识别角色。\n示例：穿黑色西装的短发男生、扎高马尾穿白衬衫的女生\n\n建议包含：发型发色、服装款式颜色、配饰、体型、肤色、年龄特征等"}
                  value={appearance}
                  onValueChange={setAppearance}
                  isRequired
                  minRows={3}
                  maxRows={8}
                  classNames={{
                    input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                    label: "text-amber-400 font-medium",
                    inputWrapper: "bg-[var(--bg-input)] border border-amber-500/30 hover:border-amber-500/50 shadow-sm",
                  }}
                />
                <p className="text-[10px] text-amber-400/70 px-1">
                  此字段是 AI 识别角色的核心依据，请确保描述唯一、具体且固定
                </p>
              </div>

              <Input
                label="性格"
                placeholder="性格特点"
                value={personality}
                onValueChange={setPersonality}
                classNames={inputClassNames}
              />

              <Input
                label="标签（逗号分隔）"
                placeholder="如：动漫,少女,日系"
                value={tags}
                onValueChange={setTags}
                classNames={inputClassNames}
              />
            </motion.div>
          </>
        )}

        {/* ============= 场景配方表单 ============= */}
        {recipeType === 'scene' && (
          <>
            {/* AI 智能分析 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/5 to-teal-500/5 border border-emerald-500/20 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-emerald-400" /> AI 智能分析
                </h2>
                <AIModelSelector
                  models={aiModels}
                  filterType="TEXT"
                  selectedModel={selectedTextModel}
                  onModelChange={setSelectedTextModel}
                  size="sm"
                />
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                粘贴一大段场景描述文字，AI 将自动提取环境、光线、氛围等信息并填入表单
              </p>
              <Textarea
                placeholder="在这里粘贴场景的描述文字，越详细越好…&#10;&#10;例如：深夜的废弃工厂，铁锈斑驳的钢梁在月光下泛着冷光，地面上散落着碎玻璃和废旧零件，远处一盏摇摇欲坠的灯泡发出昏黄的微光…"
                value={analyzeText}
                onValueChange={setAnalyzeText}
                minRows={4}
                maxRows={8}
                classNames={{
                  input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)]",
                  inputWrapper: "bg-[var(--bg-input)] border border-emerald-500/20 hover:border-emerald-500/40",
                }}
              />
              <Button
                color="secondary"
                startContent={isAnalyzing ? <Spinner size="sm" color="current" /> : <Wand2 className="w-4 h-4" />}
                onPress={handleAnalyze}
                isLoading={isAnalyzing}
                isDisabled={!analyzeText.trim() || !selectedTextModel}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white"
              >
                {isAnalyzing ? '分析中...' : 'AI 分析填充'}
              </Button>
            </motion.div>

            {/* 场景基本信息 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4 p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)]"
            >
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <span className="text-lg">🏔️</span> 场景信息
              </h2>

              <Input
                label="场景名称"
                placeholder="输入场景名称"
                value={name}
                onValueChange={setName}
                isRequired
                classNames={inputClassNames}
              />

              <Textarea
                label="场景描述"
                placeholder="输入详细描述"
                value={description}
                onValueChange={setDescription}
                minRows={3}
                classNames={inputClassNames}
              />

              <Input
                label="环境"
                placeholder="环境描述（建筑结构、空间布局、物品摆设等）"
                value={environment}
                onValueChange={setEnvironment}
                classNames={inputClassNames}
              />

              <Input
                label="光线"
                placeholder="光线效果（光线来源、明暗对比、色调等）"
                value={lighting}
                onValueChange={setLighting}
                classNames={inputClassNames}
              />

              <Input
                label="氛围"
                placeholder="氛围感觉（紧张、温馨、诡异等）"
                value={mood}
                onValueChange={setMood}
                classNames={inputClassNames}
              />

              <Input
                label="缩略图URL"
                placeholder="可选，输入缩略图链接"
                value={thumbnailUrl}
                onValueChange={setThumbnailUrl}
                classNames={inputClassNames}
              />

              <Input
                label="标签（逗号分隔）"
                placeholder="如：室内,夜晚,温馨"
                value={tags}
                onValueChange={setTags}
                classNames={inputClassNames}
              />
            </motion.div>
          </>
        )}

        {/* ============= 剧本配方表单 ============= */}
        {recipeType === 'script' && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="space-y-4 p-5 rounded-2xl bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/20"
            >
              <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <span className="text-lg">📖</span> 剧本内容
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                剧本是一个完整的故事，不是一个分镜。买家购买后可以获得完整剧本，导入自己的项目中使用。支持上传 .md 或 .txt 文件。
              </p>

              {/* 文件上传区 */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-amber-500/30 rounded-xl p-6 text-center cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt,.markdown"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Upload className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-sm text-[var(--text-secondary)] font-medium">
                  点击上传剧本文件
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  支持 .md 或 .txt 格式
                </p>
              </div>

              {/* 已上传文件提示 */}
              {scriptFileName && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--bg-card)] border border-amber-500/20">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-[var(--text-primary)] flex-1 truncate">{scriptFileName}</span>
                  <span className="text-xs text-[var(--text-muted)]">{scriptContent.length} 字</span>
                  <button onClick={() => { setScriptContent(''); setScriptFileName(''); }} className="text-[var(--text-muted)] hover:text-red-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* 或直接粘贴 */}
              <div className="relative">
                <div className="absolute inset-x-0 top-0 flex items-center justify-center -mt-3">
                  <span className="bg-[var(--bg-app)] px-3 text-xs text-[var(--text-muted)]">或者直接粘贴剧本内容</span>
                </div>
              </div>
              <Textarea
                placeholder="在这里粘贴完整剧本内容…"
                value={scriptContent}
                onValueChange={setScriptContent}
                minRows={6}
                maxRows={20}
                classNames={{
                  input: "bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-mono text-sm",
                  inputWrapper: "bg-[var(--bg-input)] border border-amber-500/20 hover:border-amber-500/40",
                }}
              />

              <Input
                label="剧本名称"
                placeholder="给你的剧本起个名字"
                value={name}
                onValueChange={setName}
                isRequired
                classNames={inputClassNames}
              />

              <Textarea
                label="剧本简介"
                placeholder="简要描述这个剧本的故事类型、风格、适用场景等..."
                value={description}
                onValueChange={setDescription}
                minRows={2}
                classNames={inputClassNames}
              />

              <Input
                label="标签（逗号分隔）"
                placeholder="如：悬疑,校园,短篇"
                value={tags}
                onValueChange={setTags}
                classNames={inputClassNames}
              />

              <Input
                label="缩略图URL"
                placeholder="可选，输入缩略图链接"
                value={thumbnailUrl}
                onValueChange={setThumbnailUrl}
                classNames={inputClassNames}
              />
            </motion.div>
          </>
        )}

        {/* ============= 定价设置（通用） ============= */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="space-y-4 p-5 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)]"
        >
          <h2 className="text-base font-semibold text-[var(--text-primary)]">定价设置</h2>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">免费配方</p>
              <p className="text-xs text-[var(--text-muted)]">免费配方享有更高曝光率，且不收取平台服务费</p>
            </div>
            <Switch isSelected={isFree} onValueChange={setIsFree} color="secondary" />
          </div>

          {!isFree && (
            <Input
              type="number"
              label="售价（积分）"
              placeholder="输入积分价格"
              value={price}
              onValueChange={setPrice}
              min={1}
              description="平台收取30%手续费，最低1积分"
              classNames={{ inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)]" }}
            />
          )}

          {!isFree && price && parseInt(price, 10) > 0 && (
            <div className="p-3 rounded-lg bg-[var(--bg-input)] text-xs text-[var(--text-muted)] space-y-1">
              <div className="flex justify-between"><span>售价</span><span>{price} 积分</span></div>
              <div className="flex justify-between"><span>平台手续费 (30%)</span><span>{Math.max(1, Math.ceil(parseInt(price, 10) * 0.3))} 积分</span></div>
              <div className="flex justify-between font-medium text-[var(--text-primary)]"><span>你的收入</span><span>{parseInt(price, 10) - Math.max(1, Math.ceil(parseInt(price, 10) * 0.3))} 积分</span></div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">公开可见</p>
              <p className="text-xs text-[var(--text-muted)]">关闭后仅自己可见</p>
            </div>
            <Switch isSelected={isPublic} onValueChange={setIsPublic} color="secondary" />
          </div>
        </motion.div>

        {/* 提交按钮 */}
        <div className="flex items-center gap-3 pt-2 pb-6">
          <Button variant="flat" onPress={() => navigate(-1)} className="flex-1">取消</Button>
          <Button
            color="primary"
            isLoading={submitting}
            onPress={handleSubmit}
            className="flex-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25"
          >
            发布配方
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CreateRecipe;
