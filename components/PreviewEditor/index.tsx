import React, { useState, useEffect, useCallback, useMemo } from 'react';
import TabBar, { TabItem } from '../TabBar';
import TabContent from '../TabContent';
import BottomPanel from '../BottomPanel';
import ScenePreviewPanel from '../../views/StoryBoard/ScenePreviewPanel';
import DirectorSpace from '../DirectorSpace';
import { AnimaticPreview } from '../../views/StoryBoard/AnimaticPreview';
import AssetEditor from '../AssetEditor';
import AssetSceneRelations from '../AssetSceneRelations';
import Settings from '../../views/Settings';
import { ExtensionDetailView } from '../../views/Extensions';
import ScriptGenerateTab from '../ScriptGenerateTab';
import { StoryboardScene } from '../../views/StoryBoard/useSceneManager';
import { useAIAssistantUI } from '../../contexts/AIAssistantContext';

interface PreviewEditorProps {
  scenes: StoryboardScene[];
  selectedScene: number | null;
  onSelectScene: (sceneId: number | null) => void;
  scenePreviewProps: any;
  directorSpaceProps: {
    projectId: number | null;
    scriptId: number | null;
    onUpdateDescription?: (description: string) => Promise<boolean>;
    onUpdateBaseDescription?: (description: string) => Promise<boolean>;
    onUpdateVideoPrompt?: (prompt: string) => Promise<boolean>;
    onUpdateFirstFramePrompt?: (prompt: string) => Promise<boolean>;
    onUpdateLastFramePrompt?: (prompt: string) => Promise<boolean>;
    onUpdateDialogues?: (dialogues: any[]) => Promise<boolean>;
    onUpdateVoiceover?: (voiceover: any) => Promise<boolean>;
    onGenerateImage?: (id: number, prompt: string, regenerateTarget?: 'first' | 'last' | 'both', forceRegenerate?: boolean) => Promise<{ success: boolean; error?: string }>;
    models?: { name: string; type?: string; category?: string; description?: string; priceSummary?: string }[];
    imageModel?: string;
    onImageModelChange?: (model: string) => void;
    multimodalModel?: string;
    onMultimodalModelChange?: (model: string) => void;
    // 项目资源数据，避免 DirectorSpace 重复加载
    projectCharacters?: any[];
    projectScenes?: any[];
    projectProps?: any[];
  };
  scriptId?: number | null; // 当前集数ID，用于标签隔离
  episodeNumber?: number | null; // 当前集数编号（如第1集则传1），用于标签显示
  onEpisodeChange?: (episodeNumber: number) => void; // 标签页跨集点击时的集数切换回调
  // 剧本生成标签页所需数据
  projects?: any[]; // 项目列表
  textModel?: string; // 当前文本模型
  onTextModelChange?: (model: string) => void; // 文本模型变更回调
  onScriptGenerated?: (payload: any) => void; // 剧本生成成功回调
  projectId?: number | null; // 当前项目ID，用于标签页状态按项目隔离持久化
}

const CURRENT_TABS_VERSION = 4; // 版本4：标签页状态按projectId隔离持久化

// localStorage key 生成函数（按 projectId 隔离）
const getStorageKey = (base: string, projectId: number | null | undefined) =>
  projectId ? `${base}_${projectId}` : base;

// 分镜标签页
const getTabsStorageKey = (projectId: number | null | undefined) => getStorageKey('preview_editor_tabs', projectId);
const getActiveTabStorageKey = (projectId: number | null | undefined) => getStorageKey('preview_editor_active_tab', projectId);
const getTabsVersionKey = (projectId: number | null | undefined) => getStorageKey('preview_editor_tabs_version', projectId);

// 资产编辑标签页持久化
const getAssetTabsStorageKey = (projectId: number | null | undefined) => getStorageKey('preview_editor_asset_tabs', projectId);
const getAssetActiveTabStorageKey = (projectId: number | null | undefined) => getStorageKey('preview_editor_asset_active_tab', projectId);
const getAssetTabDataStorageKey = (projectId: number | null | undefined) => getStorageKey('preview_editor_asset_tab_data', projectId);

// 扩展详情标签页持久化
const getExtensionTabsStorageKey = (projectId: number | null | undefined) => getStorageKey('preview_editor_extension_tabs', projectId);
const getExtensionActiveTabStorageKey = (projectId: number | null | undefined) => getStorageKey('preview_editor_extension_active_tab', projectId);

// 设置标签页持久化
const getSettingsTabStorageKey = (projectId: number | null | undefined) => getStorageKey('preview_editor_settings_open', projectId);

// 剧本生成标签页持久化
const getScriptGenerateStorageKey = (projectId: number | null | undefined) => getStorageKey('preview_editor_script_generate', projectId);

// 旧版本 key（用于迁移和清理）
const LEGACY_TABS_STORAGE_KEY = 'preview_editor_tabs';
const LEGACY_ACTIVE_TAB_STORAGE_KEY = 'preview_editor_active_tab';
const LEGACY_TABS_VERSION_KEY = 'preview_editor_tabs_version';
const LEGACY_ASSET_TABS_STORAGE_KEY = 'preview_editor_asset_tabs';
const LEGACY_ASSET_ACTIVE_TAB_STORAGE_KEY = 'preview_editor_asset_active_tab';
const LEGACY_ASSET_TAB_DATA_STORAGE_KEY = 'preview_editor_asset_tab_data';

const PreviewEditor: React.FC<PreviewEditorProps> = ({
  scenes,
  selectedScene,
  onSelectScene,
  scenePreviewProps,
  directorSpaceProps,
  scriptId,
  episodeNumber,
  onEpisodeChange,
  projects = [],
  textModel,
  onTextModelChange,
  onScriptGenerated,
  projectId,
}) => {
  const { bottomPanelOpen, closeBottomPanel } = useAIAssistantUI();
  const [sceneTabs, setSceneTabs] = useState<TabItem[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [currentScriptId, setCurrentScriptId] = useState<number | null>(scriptId || null);

  // 资产编辑标签页（独立于分镜标签页，不绑定 scriptId）
  const [assetTabs, setAssetTabs] = useState<TabItem[]>([]);
  const [activeAssetTabId, setActiveAssetTabId] = useState<string | null>(null);
  const [assetTabData, setAssetTabData] = useState<Map<string, any>>(new Map());

  // 设置标签页（单例，始终只有一个）
  const [settingsTabOpen, setSettingsTabOpen] = useState(false);

  // 扩展详情标签页（多例，每个扩展独立标签）
  const [extensionDetailTabs, setExtensionDetailTabs] = useState<TabItem[]>([]);
  const [activeExtensionDetailTabId, setActiveExtensionDetailTabId] = useState<string | null>(null);

  // 剧本生成标签页（单例，可关闭）
  const [scriptGenerateTabOpen, setScriptGenerateTabOpen] = useState(false);
  const [scriptGenerateTabEpisode, setScriptGenerateTabEpisode] = useState<number | undefined>(undefined);

  // 获取当前显示的标签列表（合并所有分镜标签、资产标签、扩展详情标签、设置标签和剧本生成标签，全部平铺显示）
  const tabs = useMemo(() => {
    const result = [...sceneTabs, ...assetTabs, ...extensionDetailTabs];
    if (settingsTabOpen) {
      result.push({ id: 'settings', type: 'settings', title: '设置' });
    }
    if (scriptGenerateTabOpen) {
      const episodeTitle = scriptGenerateTabEpisode ? `第${scriptGenerateTabEpisode}集剧本` : '生成剧本';
      result.push({ id: 'script-generate', type: 'script-generate', title: episodeTitle });
    }
    return result;
  }, [sceneTabs, assetTabs, extensionDetailTabs, settingsTabOpen, scriptGenerateTabOpen]);

  // 从 localStorage 恢复所有标签状态（带版本控制，按 projectId 隔离）
  useEffect(() => {
    if (!projectId) return;
    try {
      const versionKey = getTabsVersionKey(projectId);
      const savedVersion = localStorage.getItem(versionKey);

      // 版本不匹配或首次使用新版本，尝试迁移旧数据
      if (savedVersion !== String(CURRENT_TABS_VERSION)) {
        // 先尝试从旧版本全局 key 迁移数据
        const legacyTabs = localStorage.getItem(LEGACY_TABS_STORAGE_KEY);
        const legacyActiveTab = localStorage.getItem(LEGACY_ACTIVE_TAB_STORAGE_KEY);
        const legacyAssetTabs = localStorage.getItem(LEGACY_ASSET_TABS_STORAGE_KEY);
        const legacyAssetActive = localStorage.getItem(LEGACY_ASSET_ACTIVE_TAB_STORAGE_KEY);
        const legacyAssetData = localStorage.getItem(LEGACY_ASSET_TAB_DATA_STORAGE_KEY);

        if (legacyTabs) {
          localStorage.setItem(getTabsStorageKey(projectId), legacyTabs);
          localStorage.removeItem(LEGACY_TABS_STORAGE_KEY);
        }
        if (legacyActiveTab) {
          localStorage.setItem(getActiveTabStorageKey(projectId), legacyActiveTab);
          localStorage.removeItem(LEGACY_ACTIVE_TAB_STORAGE_KEY);
        }
        if (legacyAssetTabs) {
          localStorage.setItem(getAssetTabsStorageKey(projectId), legacyAssetTabs);
          localStorage.removeItem(LEGACY_ASSET_TABS_STORAGE_KEY);
        }
        if (legacyAssetActive) {
          localStorage.setItem(getAssetActiveTabStorageKey(projectId), legacyAssetActive);
          localStorage.removeItem(LEGACY_ASSET_ACTIVE_TAB_STORAGE_KEY);
        }
        if (legacyAssetData) {
          localStorage.setItem(getAssetTabDataStorageKey(projectId), legacyAssetData);
          localStorage.removeItem(LEGACY_ASSET_TAB_DATA_STORAGE_KEY);
        }

        // 清理旧版本按 scriptId 隔离的数据
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(LEGACY_TABS_STORAGE_KEY + '_script_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        localStorage.removeItem(LEGACY_TABS_VERSION_KEY);

        // 设置新版本号
        localStorage.setItem(versionKey, String(CURRENT_TABS_VERSION));
      }

      // 加载分镜标签页（按 projectId 隔离）
      const savedTabs = localStorage.getItem(getTabsStorageKey(projectId));
      let loadedSceneTabs: TabItem[] = [];
      if (savedTabs) {
        const parsedTabs = JSON.parse(savedTabs);
        if (Array.isArray(parsedTabs) && parsedTabs.every(t => t.id && t.type && t.title)) {
          loadedSceneTabs = parsedTabs;
          setSceneTabs(parsedTabs);
        }
      }

      // 加载资产编辑标签页
      const savedAssetTabs = localStorage.getItem(getAssetTabsStorageKey(projectId));
      let parsedAssetTabs: any[] | null = null;
      if (savedAssetTabs) {
        parsedAssetTabs = JSON.parse(savedAssetTabs);
        if (Array.isArray(parsedAssetTabs) && parsedAssetTabs.every((t: any) => t.id && t.type && t.title)) {
          setAssetTabs(parsedAssetTabs);
        }
      }

      // 加载资产标签页数据
      const savedAssetTabData = localStorage.getItem(getAssetTabDataStorageKey(projectId));
      if (savedAssetTabData) {
        try {
          const parsed = JSON.parse(savedAssetTabData);
          if (Array.isArray(parsed)) {
            setAssetTabData(new Map(parsed));
          }
        } catch {
          // ignore
        }
      }

      // 加载扩展详情标签页
      const savedExtensionTabs = localStorage.getItem(getExtensionTabsStorageKey(projectId));
      if (savedExtensionTabs) {
        const parsed = JSON.parse(savedExtensionTabs);
        if (Array.isArray(parsed) && parsed.every((t: any) => t.id && t.type && t.title)) {
          setExtensionDetailTabs(parsed);
        }
      }

      // 加载设置标签页状态
      const savedSettingsOpen = localStorage.getItem(getSettingsTabStorageKey(projectId));
      if (savedSettingsOpen === 'true') {
        setSettingsTabOpen(true);
      }

      // 加载剧本生成标签页状态
      const savedScriptGenerate = localStorage.getItem(getScriptGenerateStorageKey(projectId));
      if (savedScriptGenerate) {
        try {
          const parsed = JSON.parse(savedScriptGenerate);
          if (parsed.open) {
            setScriptGenerateTabOpen(true);
            setScriptGenerateTabEpisode(parsed.episode);
          }
        } catch {
          // ignore
        }
      }

      // 加载活跃标签（按 projectId 隔离）
      const savedActiveTab = localStorage.getItem(getActiveTabStorageKey(projectId));
      const allSceneTabs = loadedSceneTabs;
      if (savedActiveTab) {
        if (savedActiveTab === 'settings') {
          setSettingsTabOpen(true);
          setActiveTabId(null);
          setActiveAssetTabId(null);
          setActiveExtensionDetailTabId(null);
        } else if (savedActiveTab === 'script-generate') {
          setScriptGenerateTabOpen(true);
          setActiveTabId(null);
          setActiveAssetTabId(null);
          setActiveExtensionDetailTabId(null);
          setSettingsTabOpen(false);
        } else if (parsedAssetTabs && parsedAssetTabs.some((t: any) => t.id === savedActiveTab)) {
          setActiveAssetTabId(savedActiveTab);
          setActiveTabId(null);
          setActiveExtensionDetailTabId(null);
          setSettingsTabOpen(false);
        } else if (extensionDetailTabs.some((t: TabItem) => t.id === savedActiveTab)) {
          setActiveExtensionDetailTabId(savedActiveTab);
          setActiveTabId(null);
          setActiveAssetTabId(null);
          setSettingsTabOpen(false);
        } else if (allSceneTabs.some((t: TabItem) => t.id === savedActiveTab)) {
          setActiveTabId(savedActiveTab);
          setActiveAssetTabId(null);
          setActiveExtensionDetailTabId(null);
          setSettingsTabOpen(false);
          if (savedActiveTab.startsWith('scene-')) {
            const sceneId = parseInt(savedActiveTab.replace('scene-', ''), 10);
            onSelectScene(sceneId);
          }
        } else if (allSceneTabs.length > 0) {
          setActiveTabId(allSceneTabs[0].id);
        }
      } else if (allSceneTabs.length > 0) {
        setActiveTabId(allSceneTabs[0].id);
      }
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // 当 scriptId 变化时，优先恢复上次在该集数下打开的标签
  useEffect(() => {
    if (scriptId === undefined || scriptId === currentScriptId) return;

    setCurrentScriptId(scriptId);

    // 尝试从 localStorage 恢复该集数上次活跃的标签（按 projectId 隔离）
    if (!projectId) return;
    const savedActiveTab = localStorage.getItem(getActiveTabStorageKey(projectId));
    // 检查保存的标签是否属于当前集数
    const savedTabBelongsToCurrentScript = savedActiveTab && sceneTabs.some(
      t => t.id === savedActiveTab && t.scriptId === scriptId
    );

    if (savedTabBelongsToCurrentScript) {
      // 恢复上次打开的标签
      setActiveTabId(savedActiveTab);
      setActiveAssetTabId(null);
      if (savedActiveTab.startsWith('scene-')) {
        const sceneId = parseInt(savedActiveTab.replace('scene-', ''), 10);
        onSelectScene(sceneId);
      }
    } else {
      // 找到当前集数的第一个分镜标签并激活
      const firstSceneTab = sceneTabs.find(t => t.type === 'scene' && t.scriptId === scriptId);
      if (firstSceneTab) {
        setActiveTabId(firstSceneTab.id);
        setActiveAssetTabId(null);
        const sceneId = parseInt(firstSceneTab.id.replace('scene-', ''), 10);
        onSelectScene(sceneId);
      }
    }
  }, [scriptId, currentScriptId, sceneTabs, onSelectScene, projectId]);

  // 保存标签状态到 localStorage（按 projectId 隔离）
  useEffect(() => {
    if (!projectId) return;
    try {
      // 保存所有分镜标签（平铺存储）
      if (sceneTabs.length > 0) {
        localStorage.setItem(getTabsStorageKey(projectId), JSON.stringify(sceneTabs));
      } else {
        localStorage.removeItem(getTabsStorageKey(projectId));
      }
      localStorage.setItem(getTabsVersionKey(projectId), String(CURRENT_TABS_VERSION));

      // 确定当前活跃标签ID（综合所有类型）
      const currentActiveId = activeExtensionDetailTabId || activeAssetTabId || activeTabId
        || (settingsTabOpen ? 'settings' : null)
        || (scriptGenerateTabOpen ? 'script-generate' : null);
      if (currentActiveId) {
        localStorage.setItem(getActiveTabStorageKey(projectId), currentActiveId);
      } else {
        localStorage.removeItem(getActiveTabStorageKey(projectId));
      }
    } catch {
      // ignore
    }
  }, [sceneTabs, activeTabId, activeAssetTabId, activeExtensionDetailTabId, settingsTabOpen, scriptGenerateTabOpen, projectId]);

  // 保存资产编辑标签状态到 localStorage（按 projectId 隔离）
  useEffect(() => {
    if (!projectId) return;
    try {
      if (assetTabs.length > 0) {
        localStorage.setItem(getAssetTabsStorageKey(projectId), JSON.stringify(assetTabs));
      } else {
        localStorage.removeItem(getAssetTabsStorageKey(projectId));
      }
      if (activeAssetTabId && assetTabs.length > 0) {
        localStorage.setItem(getAssetActiveTabStorageKey(projectId), activeAssetTabId);
      } else {
        localStorage.removeItem(getAssetActiveTabStorageKey(projectId));
      }
      // 保存资产标签页数据（将 Map 转为可序列化的数组）
      if (assetTabData.size > 0) {
        localStorage.setItem(getAssetTabDataStorageKey(projectId), JSON.stringify(Array.from(assetTabData.entries())));
      } else {
        localStorage.removeItem(getAssetTabDataStorageKey(projectId));
      }
    } catch {
      // ignore
    }
  }, [assetTabs, activeAssetTabId, assetTabData, projectId]);

  // 保存扩展详情标签状态到 localStorage（按 projectId 隔离）
  useEffect(() => {
    if (!projectId) return;
    try {
      if (extensionDetailTabs.length > 0) {
        localStorage.setItem(getExtensionTabsStorageKey(projectId), JSON.stringify(extensionDetailTabs));
      } else {
        localStorage.removeItem(getExtensionTabsStorageKey(projectId));
      }
      if (activeExtensionDetailTabId && extensionDetailTabs.length > 0) {
        localStorage.setItem(getExtensionActiveTabStorageKey(projectId), activeExtensionDetailTabId);
      } else {
        localStorage.removeItem(getExtensionActiveTabStorageKey(projectId));
      }
    } catch {
      // ignore
    }
  }, [extensionDetailTabs, activeExtensionDetailTabId, projectId]);

  // 保存设置标签页状态到 localStorage（按 projectId 隔离）
  useEffect(() => {
    if (!projectId) return;
    try {
      localStorage.setItem(getSettingsTabStorageKey(projectId), String(settingsTabOpen));
    } catch {
      // ignore
    }
  }, [settingsTabOpen, projectId]);

  // 保存剧本生成标签页状态到 localStorage（按 projectId 隔离）
  useEffect(() => {
    if (!projectId) return;
    try {
      if (scriptGenerateTabOpen) {
        localStorage.setItem(getScriptGenerateStorageKey(projectId), JSON.stringify({
          open: true,
          episode: scriptGenerateTabEpisode,
        }));
      } else {
        localStorage.removeItem(getScriptGenerateStorageKey(projectId));
      }
    } catch {
      // ignore
    }
  }, [scriptGenerateTabOpen, scriptGenerateTabEpisode, projectId]);

  // 更新当前scriptId的标签列表
  const updateCurrentTabs = useCallback((updater: (prev: TabItem[]) => TabItem[]) => {
    setSceneTabs(prev => updater(prev));
  }, []);

  // 当 selectedScene 变化时，打开或切换到对应标签
  useEffect(() => {
    if (!selectedScene || !currentScriptId) return;

    const existingTab = sceneTabs.find(t => t.id === `scene-${selectedScene}`);
    if (existingTab) {
      // 标签已存在，切换过去
      setActiveTabId(existingTab.id);
    } else {
      // 创建新标签
      const sceneIndex = scenes.findIndex(s => s.id === selectedScene) + 1;
      const displayEpisode = episodeNumber || currentScriptId || 1;
      const newTab: TabItem = {
        id: `scene-${selectedScene}`,
        type: 'scene',
        title: `分镜 #${sceneIndex}`,
        sceneIndex,
        scriptId: displayEpisode,
      };
      updateCurrentTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScene, scenes, currentScriptId]);

  // 监听打开分镜标签页事件（从关联分镜等入口跳转）
  useEffect(() => {
    const handleOpenSceneTab = (e: CustomEvent<{ sceneId: number }>) => {
      const sceneId = e.detail?.sceneId;
      if (!sceneId) return;

      // 查找分镜数据
      const scene = scenes.find(s => s.id === sceneId);
      if (!scene) return;

      const tabId = `scene-${sceneId}`;
      const existingTab = sceneTabs.find(t => t.id === tabId);

      if (existingTab) {
        // 标签已存在，直接切换激活
        setActiveAssetTabId(null);
        setActiveTabId(tabId);
        setSettingsTabOpen(false);
      } else {
        // 创建新标签
        const sceneIndex = scenes.findIndex(s => s.id === sceneId) + 1;
        const displayEpisode = episodeNumber || currentScriptId || 1;
        const newTab: TabItem = {
          id: tabId,
          type: 'scene',
          title: `分镜 #${sceneIndex}`,
          sceneIndex,
          scriptId: displayEpisode,
        };
        updateCurrentTabs(prev => [...prev, newTab]);
        setActiveTabId(tabId);
        setActiveAssetTabId(null);
        setSettingsTabOpen(false);
      }

      // 同时通知外部选中分镜
      onSelectScene(sceneId);
    };

    window.addEventListener('openSceneTab', handleOpenSceneTab as EventListener);
    return () => {
      window.removeEventListener('openSceneTab', handleOpenSceneTab as EventListener);
    };
  }, [scenes, sceneTabs, episodeNumber, currentScriptId, onSelectScene, updateCurrentTabs]);

  // 监听打开 Animatic 标签页事件
  useEffect(() => {
    const handleOpenAnimaticTab = (e: CustomEvent<{ scriptId: number | null }>) => {
      const targetScriptId = e.detail?.scriptId || currentScriptId;
      if (!targetScriptId) return;

      // 切换到对应 scriptId
      if (targetScriptId !== currentScriptId) {
        setCurrentScriptId(targetScriptId);
      }

      const existingTab = sceneTabs.find(t => t.id === 'animatic');
      if (existingTab) {
        setActiveTabId(existingTab.id);
      } else {
        const newTab: TabItem = {
          id: 'animatic',
          type: 'animatic',
          title: 'Animatic',
        };
        updateCurrentTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
      }
    };

    window.addEventListener('openAnimaticTab', handleOpenAnimaticTab as EventListener);
    return () => {
      window.removeEventListener('openAnimaticTab', handleOpenAnimaticTab as EventListener);
    };
  }, [currentScriptId, sceneTabs, updateCurrentTabs]);

  // 监听打开资产编辑标签页事件
  useEffect(() => {
    const handleOpenAssetEditTab = (e: CustomEvent<{
      assetType: string;
      assetId: number;
      assetName: string;
      initialData?: any;
    }>) => {
      const { assetType, assetId, assetName, initialData } = e.detail;
      const tabId = `asset-${assetType}-${assetId}`;

      setAssetTabs(prev => {
        const existingTab = prev.find(t => t.id === tabId);
        if (existingTab) {
          // 标签已存在，更新数据并激活
          if (initialData) {
            setAssetTabData(prevData => {
              const newMap = new Map(prevData);
              newMap.set(tabId, initialData);
              return newMap;
            });
          }
          setActiveAssetTabId(tabId);
          setActiveTabId(null);
          setSettingsTabOpen(false);
          return prev;
        } else {
          // 创建新标签
          const newTab: TabItem = {
            id: tabId,
            type: 'asset',
            title: assetName,
            assetType,
          };
          if (initialData) {
            setAssetTabData(prevData => {
              const newMap = new Map(prevData);
              newMap.set(tabId, initialData);
              return newMap;
            });
          }
          setActiveAssetTabId(tabId);
          setActiveTabId(null);
          setSettingsTabOpen(false);
          return [...prev, newTab];
        }
      });
    };

    window.addEventListener('openAssetEditTab', handleOpenAssetEditTab as EventListener);
    return () => {
      window.removeEventListener('openAssetEditTab', handleOpenAssetEditTab as EventListener);
    };
  }, []);

  // 监听打开设置标签页事件
  useEffect(() => {
    const handleOpenSettingsTab = () => {
      setSettingsTabOpen(true);
      setActiveAssetTabId(null);
      setActiveTabId(null);
    };

    window.addEventListener('openSettingsTab', handleOpenSettingsTab as EventListener);
    return () => {
      window.removeEventListener('openSettingsTab', handleOpenSettingsTab as EventListener);
    };
  }, []);

  // 监听打开剧本生成标签页事件（支持传递集数信息）
  useEffect(() => {
    const handleOpenScriptGenerateTab = (event: CustomEvent<{ episodeNumber?: number }>) => {
      console.log('[PreviewEditor] 收到 openScriptGenerateTab 事件', event.detail);
      setScriptGenerateTabOpen(true);
      setScriptGenerateTabEpisode(event.detail?.episodeNumber);
      setActiveAssetTabId(null);
      setActiveTabId(null);
      setActiveExtensionDetailTabId(null);
      setSettingsTabOpen(false);
      console.log('[PreviewEditor] 已打开剧本生成标签页');
    };

    window.addEventListener('openScriptGenerateTab', handleOpenScriptGenerateTab as EventListener);
    return () => {
      window.removeEventListener('openScriptGenerateTab', handleOpenScriptGenerateTab as EventListener);
    };
  }, []);

  // 监听打开扩展详情标签页事件
  useEffect(() => {
    const handleOpenExtensionDetailTab = (e: CustomEvent<{ extId: number; extName: string }>) => {
      const { extId, extName } = e.detail;
      if (!extId) return;

      const tabId = `extension-detail-${extId}`;
      const existingTab = extensionDetailTabs.find(t => t.id === tabId);

      if (existingTab) {
        // 标签已存在，直接切换激活
        setActiveExtensionDetailTabId(tabId);
        setActiveTabId(null);
        setActiveAssetTabId(null);
        setSettingsTabOpen(false);
      } else {
        // 创建新标签
        const newTab: TabItem = {
          id: tabId,
          type: 'extension-detail',
          title: extName || '扩展详情',
          extId,
        };
        setExtensionDetailTabs(prev => [...prev, newTab]);
        setActiveExtensionDetailTabId(tabId);
        setActiveTabId(null);
        setActiveAssetTabId(null);
        setSettingsTabOpen(false);
      }
    };

    window.addEventListener('openExtensionDetailTab', handleOpenExtensionDetailTab as EventListener);
    return () => {
      window.removeEventListener('openExtensionDetailTab', handleOpenExtensionDetailTab as EventListener);
    };
  }, [extensionDetailTabs]);

  // 点击标签切换
  const handleTabClick = useCallback((tabId: string) => {
    // 判断是否为设置标签
    if (tabId === 'settings') {
      setActiveAssetTabId(null);
      setActiveExtensionDetailTabId(null);
      setActiveTabId(null);
      // 确保设置标签页是打开的
      setSettingsTabOpen(true);
      return;
    }
    // 判断是否为剧本生成标签
    if (tabId === 'script-generate') {
      setActiveAssetTabId(null);
      setActiveTabId(null);
      setActiveExtensionDetailTabId(null);
      setSettingsTabOpen(false);
      // 确保剧本生成标签页是打开的
      setScriptGenerateTabOpen(true);
      return;
    }

    // 判断是否为资产标签
    const isAssetTab = assetTabs.some(t => t.id === tabId);
    if (isAssetTab) {
      setActiveAssetTabId(tabId);
      setActiveTabId(null);
      setActiveExtensionDetailTabId(null);
      setSettingsTabOpen(false);
      return;
    }
    // 判断是否为扩展详情标签
    const isExtensionDetailTab = extensionDetailTabs.some(t => t.id === tabId);
    if (isExtensionDetailTab) {
      setActiveExtensionDetailTabId(tabId);
      setActiveTabId(null);
      setActiveAssetTabId(null);
      setSettingsTabOpen(false);
      return;
    }
    setActiveTabId(tabId);
    setActiveAssetTabId(null);
    setActiveExtensionDetailTabId(null);
    setSettingsTabOpen(false);
    if (tabId.startsWith('scene-')) {
      // 检测是否点击了其他集数的分镜标签，如果是则先切换集数
      const clickedTab = sceneTabs.find(t => t.id === tabId);
      if (clickedTab && clickedTab.scriptId !== undefined && episodeNumber !== undefined && episodeNumber !== null && clickedTab.scriptId !== episodeNumber) {
        onEpisodeChange?.(clickedTab.scriptId);
      }
      const sceneId = parseInt(tabId.replace('scene-', ''), 10);
      onSelectScene(sceneId);
    }
  }, [onSelectScene, assetTabs, extensionDetailTabs, sceneTabs, episodeNumber, onEpisodeChange]);

  // 关闭标签（暴露给外部）
  const handleCloseTab = useCallback((tabId: string) => {
    // 检查是否为剧本生成标签
    if (tabId === 'script-generate') {
      setScriptGenerateTabOpen(false);
      setScriptGenerateTabEpisode(undefined);
      // 关闭剧本后，尝试激活其他标签
      if (settingsTabOpen) {
        setActiveTabId(null);
        setActiveAssetTabId(null);
        setActiveExtensionDetailTabId(null);
      } else if (extensionDetailTabs.length > 0) {
        setActiveExtensionDetailTabId(extensionDetailTabs[extensionDetailTabs.length - 1].id);
      } else if (assetTabs.length > 0) {
        setActiveAssetTabId(assetTabs[assetTabs.length - 1].id);
      } else if (sceneTabs.length > 0) {
        setActiveTabId(sceneTabs[sceneTabs.length - 1].id);
      } else {
        setActiveTabId(null);
      }
      return;
    }
    
    // 先检查是否为设置标签
    if (tabId === 'settings') {
      setSettingsTabOpen(false);
      // 关闭设置后，尝试激活其他标签
      if (extensionDetailTabs.length > 0) {
        setActiveExtensionDetailTabId(extensionDetailTabs[extensionDetailTabs.length - 1].id);
      } else if (assetTabs.length > 0) {
        setActiveAssetTabId(assetTabs[assetTabs.length - 1].id);
      } else if (sceneTabs.length > 0) {
        setActiveTabId(sceneTabs[sceneTabs.length - 1].id);
      } else {
        setActiveTabId(null);
      }
      return;
    }

    // 检查是否为扩展详情标签
    const isExtensionDetailTab = extensionDetailTabs.some(t => t.id === tabId);
    if (isExtensionDetailTab) {
      setExtensionDetailTabs(prev => {
        const newTabs = prev.filter(t => t.id !== tabId);
        if (tabId === activeExtensionDetailTabId && newTabs.length > 0) {
          const currentIndex = prev.findIndex(t => t.id === tabId);
          const newActiveIndex = Math.max(0, currentIndex - 1);
          setActiveExtensionDetailTabId(newTabs[newActiveIndex].id);
        } else if (newTabs.length === 0) {
          setActiveExtensionDetailTabId(null);
        }
        return newTabs;
      });
      return;
    }
    // 检查是否为资产标签
    const isAssetTab = assetTabs.some(t => t.id === tabId);
    if (isAssetTab) {
      setAssetTabs(prev => {
        const newTabs = prev.filter(t => t.id !== tabId);
        if (tabId === activeAssetTabId && newTabs.length > 0) {
          const currentIndex = prev.findIndex(t => t.id === tabId);
          const newActiveIndex = Math.max(0, currentIndex - 1);
          setActiveAssetTabId(newTabs[newActiveIndex].id);
        } else if (newTabs.length === 0) {
          setActiveAssetTabId(null);
          // 用户关闭了所有资产标签页，清除 localStorage 中的持久化数据
          if (projectId) {
            localStorage.removeItem(getAssetTabsStorageKey(projectId));
            localStorage.removeItem(getAssetActiveTabStorageKey(projectId));
            localStorage.removeItem(getAssetTabDataStorageKey(projectId));
          }
        }
        return newTabs;
      });
      setAssetTabData(prev => {
        const newMap = new Map(prev);
        newMap.delete(tabId);
        return newMap;
      });
      return;
    }
    updateCurrentTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      if (tabId === activeTabId && newTabs.length > 0) {
        const currentIndex = prev.findIndex(t => t.id === tabId);
        const newActiveIndex = Math.max(0, currentIndex - 1);
        setActiveTabId(newTabs[newActiveIndex].id);
      } else if (newTabs.length === 0) {
        setActiveTabId(null);
        setActiveAssetTabId(null);
        setActiveExtensionDetailTabId(null);
        // 用户关闭了所有标签页，清除 localStorage 中的持久化数据
        if (projectId) {
          localStorage.removeItem(getTabsStorageKey(projectId));
          localStorage.removeItem(getActiveTabStorageKey(projectId));
          localStorage.removeItem(getAssetTabsStorageKey(projectId));
          localStorage.removeItem(getAssetActiveTabStorageKey(projectId));
          localStorage.removeItem(getAssetTabDataStorageKey(projectId));
          localStorage.removeItem(getExtensionTabsStorageKey(projectId));
          localStorage.removeItem(getExtensionActiveTabStorageKey(projectId));
          localStorage.removeItem(getSettingsTabStorageKey(projectId));
          localStorage.removeItem(getScriptGenerateStorageKey(projectId));
        }
      }
      return newTabs;
    });
  }, [activeTabId, activeAssetTabId, activeExtensionDetailTabId, updateCurrentTabs, assetTabs, extensionDetailTabs, sceneTabs, settingsTabOpen]);

  // 关闭标签
  const handleTabClose = useCallback((tabId: string) => {
    handleCloseTab(tabId);
  }, [handleCloseTab]);

  // 关闭其他标签
  const handleCloseOthers = useCallback((tabId: string) => {
    // 检查是否为设置标签
    if (tabId === 'settings') {
      setSettingsTabOpen(true);
      setActiveAssetTabId(null);
      setActiveExtensionDetailTabId(null);
      setActiveTabId('settings');
      return;
    }
    updateCurrentTabs(prev => prev.filter(t => t.id === tabId));
    setAssetTabs([]);
    setActiveAssetTabId(null);
    setExtensionDetailTabs([]);
    setActiveExtensionDetailTabId(null);
    setSettingsTabOpen(false);
    setActiveTabId(tabId);
  }, [updateCurrentTabs]);

  // 关闭右侧标签
  const handleCloseRight = useCallback((tabId: string) => {
    // 检查是否为设置标签
    if (tabId === 'settings') {
      setSettingsTabOpen(true);
      setActiveAssetTabId(null);
      setActiveExtensionDetailTabId(null);
      setActiveTabId('settings');
      return;
    }
    updateCurrentTabs(prev => {
      const currentIndex = prev.findIndex(t => t.id === tabId);
      const newTabs = prev.slice(0, currentIndex + 1);
      if (currentIndex < prev.length - 1 && activeTabId && !newTabs.find(t => t.id === activeTabId)) {
        setActiveTabId(tabId);
      }
      return newTabs;
    });
  }, [activeTabId, updateCurrentTabs]);

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+W / Cmd+W 关闭当前标签
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        // 获取当前激活的标签ID
        const currentActiveId = activeExtensionDetailTabId || activeAssetTabId || activeTabId || (settingsTabOpen ? 'settings' : null);
        if (currentActiveId) {
          handleTabClose(currentActiveId);
        }
      }
      // Ctrl+Tab / Cmd+Tab 切换到下一个标签
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        const currentActiveId = activeExtensionDetailTabId || activeAssetTabId || activeTabId || (settingsTabOpen ? 'settings' : null);
        if (tabs.length > 1 && currentActiveId) {
          const currentIndex = tabs.findIndex(t => t.id === currentActiveId);
          const nextIndex = e.shiftKey
            ? (currentIndex - 1 + tabs.length) % tabs.length
            : (currentIndex + 1) % tabs.length;
          handleTabClick(tabs[nextIndex].id);
        }
      }
      // Ctrl+1~9 切换到对应标签
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key, 10) - 1;
        if (index < tabs.length) {
          handleTabClick(tabs[index].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, activeAssetTabId, activeExtensionDetailTabId, settingsTabOpen, tabs, handleTabClose, handleTabClick]);

  // 拖拽排序
  const handleTabReorder = useCallback((newTabs: TabItem[]) => {
    updateCurrentTabs(() => newTabs);
  }, [updateCurrentTabs]);

  // 获取当前激活的标签（优先扩展详情标签，然后资产标签，然后检查设置单例标签，然后剧本生成标签）
  const activeTab = tabs.find(t => t.id === activeExtensionDetailTabId)
    || tabs.find(t => t.id === activeAssetTabId)
    || tabs.find(t => t.id === activeTabId)
    || (settingsTabOpen ? tabs.find(t => t.id === 'settings') : null)
    || (scriptGenerateTabOpen ? tabs.find(t => t.id === 'script-generate') : null)
    || null;

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)] min-h-0">
      {/* 标签栏 */}
      <TabBar
        tabs={tabs}
        activeTabId={activeExtensionDetailTabId || activeAssetTabId || activeTabId || (settingsTabOpen ? 'settings' : null) || (scriptGenerateTabOpen ? 'script-generate' : null)}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onCloseOthers={handleCloseOthers}
        onCloseRight={handleCloseRight}
        onTabReorder={handleTabReorder}
      />

      {/* 主内容区：TabContent + BottomPanel */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* 标签内容区 */}
        <TabContent activeTab={activeTab}>
          {activeTab?.type === 'scene' && (() => {
            const sceneId = parseInt(activeTab.id.replace('scene-', ''), 10);
            const scene = scenes.find(s => s.id === sceneId);
            const sceneIndex = scenes.findIndex(s => s.id === sceneId);
            return scene && sceneIndex !== -1 ? (
              <ScenePreviewPanel
                key={sceneId}
                scene={scene}
                sceneIndex={sceneIndex}
                hideDirectorSpace={true}
                {...scenePreviewProps}
              />
            ) : null;
          })()}
          {activeTab?.type === 'animatic' && (
            <div className="w-full h-full">
              <AnimaticPreview
                key="animatic-tab"
                isOpen={true}
                onClose={() => handleCloseTab(activeTab.id)}
                storyboards={scenes}
                inlineMode={true}
              />
            </div>
          )}
          {activeTab?.type === 'asset' && (
            <div className="w-full h-full overflow-hidden">
              <AssetEditor
                key={activeTab.id}
                tabId={activeTab.id}
                assetType={activeTab.assetType || 'character'}
                initialData={assetTabData.get(activeTab.id)}
                onClose={() => handleCloseTab(activeTab.id)}
                scenes={scenes}
                onSelectScene={(sceneId) => {
                  onSelectScene(sceneId);
                }}
              />
            </div>
          )}
          {activeTab?.type === 'settings' && (
            <div className="w-full h-full overflow-hidden">
              <Settings />
            </div>
          )}
          {activeTab?.type === 'extension-detail' && activeTab.extId && (
            <div className="w-full h-full overflow-hidden">
              <ExtensionDetailView extId={activeTab.extId} />
            </div>
          )}
          {activeTab?.type === 'script-generate' && (
            <div className="w-full h-full overflow-hidden">
              <ScriptGenerateTab
                projects={projects}
                aiModels={directorSpaceProps.models || []}
                defaultTextModel={textModel}
                lockProjectId={directorSpaceProps.projectId || undefined}
                lockEpisodeNumber={scriptGenerateTabEpisode || episodeNumber || undefined}
                onSuccess={(payload) => {
                  onScriptGenerated?.(payload);
                  // 生成成功后关闭标签页
                  setScriptGenerateTabOpen(false);
                  setScriptGenerateTabEpisode(undefined);
                }}
                onError={(msg) => {
                  // 错误处理由 ScriptGenerateTab 内部处理
                }}
                onClose={() => {
                  setScriptGenerateTabOpen(false);
                  setScriptGenerateTabEpisode(undefined);
                }}
              />
            </div>
          )}
        </TabContent>

        {/* 底部面板（导演空间 / 资产关联分镜） */}
        <BottomPanel
          collapsed={!bottomPanelOpen}
          onCollapsedChange={(collapsed) => {
            if (collapsed) closeBottomPanel();
          }}
          allowFullExpand={true}
        >
          {activeTab?.type === 'scene' ? (
            // 分镜标签页：显示导演空间
            (() => {
              const sceneId = parseInt(activeTab.id.replace('scene-', ''), 10);
              const scene = scenes.find(s => s.id === sceneId);
              return scene ? (
                <DirectorSpace
                  key={`director-${sceneId}`}
                  scene={scene}
                  {...directorSpaceProps}
                />
              ) : null;
            })()
          ) : activeTab?.type === 'asset' && activeTab.assetType !== 'script' ? (
            // 资产标签页：显示资产关联分镜
            (() => {
              const assetData = assetTabData.get(activeTab.id);
              const assetName = assetData?.name || activeTab.title || '';
              const parts = activeTab.id.split('-');
              const assetId = parseInt(parts[parts.length - 1], 10);
              return assetName ? (
                <AssetSceneRelations
                  key={`relations-${activeTab.id}`}
                  scenes={scenes}
                  assetType={activeTab.assetType || 'character'}
                  assetName={assetName}
                  assetId={!isNaN(assetId) ? assetId : undefined}
                  onSelectScene={(sceneId) => {
                    onSelectScene(sceneId);
                  }}
                />
              ) : null;
            })()
          ) : (
            // 其他标签页（设置、扩展、剧本生成等）：显示提示信息
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <svg
                className="w-12 h-12 mb-3 text-[var(--text-muted)] opacity-30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm text-[var(--text-muted)] mb-1">
                无可用的工作区域
              </p>
              <p className="text-xs text-[var(--text-muted)] opacity-60">
                切换到分镜标签页可使用导演空间
              </p>
            </div>
          )}
        </BottomPanel>
      </div>
    </div>
  );
};

export default PreviewEditor;
