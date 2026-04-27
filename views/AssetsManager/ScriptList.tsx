import React, { useMemo, useState } from 'react';
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
  Textarea,
  Input,
  Tabs,
  Tab,
  useDisclosure,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@heroui/react';
import {
  FileText,
  Link2,
  Trash2,
  Eye,
  Copy,
  Hash,
  Folder,
  User as UserIcon,
  Film,
  ChevronDown,
  ChevronRight,
  Edit3,
  Plus,
  Layers,
} from 'lucide-react';
import type { ScriptLibraryItem } from '../../services/scripts';
import type { Project } from '../../services/projects';

// 剧本组：同 title 的多集集合
interface ScriptGroup {
  key: string;           // "personal::title" 或 "project::projectId::title"
  title: string;
  episodes: ScriptLibraryItem[];
  isPersonal: boolean;
  projectId: number | null;
  projectName: string | null;
  sourceScriptIds: Set<number | null>;
}

interface ScriptListProps {
  scripts: ScriptLibraryItem[];
  projects: Project[];
  onDelete: (id: number) => void | Promise<void>;
  onDeleteGroup?: (ids: number[]) => void | Promise<void>;
  onBind: (payload: {
    sourceScriptId: number;
    targetProjectId: number;
    titleOverride?: string;
    bindAll?: boolean;   // 整组绑定
    siblingIds?: number[];
  }) => Promise<void>;
  onGenerateStoryboard?: (script: ScriptLibraryItem) => void;
  onCreateEpisode?: (title: string, projectId: number | null, episodeNumber: number) => void;
  onEditScript?: (script: ScriptLibraryItem) => void;
}

const statusLabel: Record<string, string> = {
  draft: '草稿',
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
};

const statusColor: Record<string, string> = {
  draft: 'text-amber-500 bg-amber-500/10',
  generating: 'text-blue-500 bg-blue-500/10',
  completed: 'text-emerald-500 bg-emerald-500/10',
  failed: 'text-rose-500 bg-rose-500/10',
};

const ScriptList: React.FC<ScriptListProps> = ({
  scripts,
  projects,
  onDelete,
  onDeleteGroup,
  onBind,
  onGenerateStoryboard,
  onCreateEpisode,
  onEditScript,
}) => {
  const [viewingGroup, setViewingGroup] = useState<ScriptGroup | null>(null);
  const [viewEpisodeIdx, setViewEpisodeIdx] = useState(0);
  const [bindingGroup, setBindingGroup] = useState<ScriptGroup | null>(null);
  const [bindTargetProjectId, setBindTargetProjectId] = useState<string>('');
  const [bindTitleOverride, setBindTitleOverride] = useState<string>('');
  const [binding, setBinding] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const {
    isOpen: isViewOpen,
    onOpen: onViewOpen,
    onOpenChange: onViewOpenChange,
  } = useDisclosure();
  const {
    isOpen: isBindOpen,
    onOpen: onBindOpen,
    onOpenChange: onBindOpenChange,
  } = useDisclosure();

  const projectNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    projects.forEach((p) => {
      map[p.id] = p.name;
    });
    return map;
  }, [projects]);

  // 副本血缘
  const sourceMap = useMemo(() => {
    const map: Record<number, ScriptLibraryItem> = {};
    scripts.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [scripts]);

  // ---- 分组逻辑 -------------------------------------------------
  const groups = useMemo<ScriptGroup[]>(() => {
    const groupMap = new Map<string, ScriptLibraryItem[]>();

    for (const s of scripts) {
      // 分组 key：个人剧本按 title 分组，项目剧本按 project_id 合并
      const bucket = s.project_id == null
        ? `personal::${s.title || ''}`
        : `project::${s.project_id}`;

      if (!groupMap.has(bucket)) groupMap.set(bucket, []);
      groupMap.get(bucket)!.push(s);
    }

    return Array.from(groupMap.entries()).map(([key, episodes]) => {
      // 按 episode_number 升序
      episodes.sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0));

      const first = episodes[0];
      const isPersonal = first.project_id == null;
      const projectName = !isPersonal
        ? (first as any).project_name || projectNameMap[first.project_id as number] || `项目 #${first.project_id}`
        : null;

      const sourceScriptIds = new Set<number | null>();
      episodes.forEach(e => sourceScriptIds.add(e.source_script_id));

      // 标题：个人剧本用 title，项目剧本用项目名称
      const title = isPersonal
        ? (first.title || `第${first.episode_number}集`)
        : (projectName || `项目 #${first.project_id}`);

      return {
        key,
        title,
        episodes,
        isPersonal,
        projectId: first.project_id,
        projectName,
        sourceScriptIds,
      };
    });
  }, [scripts, projectNameMap]);

  // ---- 事件处理 -------------------------------------------------
  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleViewGroup = (group: ScriptGroup) => {
    setViewingGroup(group);
    setViewEpisodeIdx(0);
    onViewOpen();
  };

  const handleBindGroup = (group: ScriptGroup) => {
    setBindingGroup(group);
    setBindTargetProjectId('');
    setBindTitleOverride('');
    onBindOpen();
  };

  const handleBindConfirm = async () => {
    if (!bindingGroup || !bindTargetProjectId) return;
    setBinding(true);
    try {
      const siblings = bindingGroup.episodes.filter(e => e.id !== bindingGroup.episodes[0].id);
      await onBind({
        sourceScriptId: bindingGroup.episodes[0].id,
        targetProjectId: Number(bindTargetProjectId),
        titleOverride: bindTitleOverride.trim() || undefined,
        bindAll: true,
        siblingIds: siblings.map(e => e.id),
      });
      onBindOpenChange();
    } finally {
      setBinding(false);
    }
  };

  const handleDeleteGroup = (group: ScriptGroup) => {
    if (onDeleteGroup) {
      onDeleteGroup(group.episodes.map(e => e.id));
    } else {
      group.episodes.forEach(e => onDelete(e.id));
    }
  };

  // 获取组的展示状态
  const getGroupStatus = (group: ScriptGroup): string => {
    for (const e of group.episodes) {
      if (e.status && e.status !== 'draft') return e.status;
    }
    return 'draft';
  };

  // 获取组的内容预览（取第一集非空内容）
  const getGroupPreview = (group: ScriptGroup): string => {
    for (const e of group.episodes) {
      if (e.content && e.content.trim()) return e.content.slice(0, 200);
    }
    return '';
  };

  if (scripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-(--text-muted)">
        <FileText className="w-12 h-12 mb-3 opacity-40" />
        <p className="text-sm">暂无剧本，点击右上角"新建剧本"开始创建</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {groups.map((group) => {
          const expanded = expandedKeys.has(group.key);
          const status = getGroupStatus(group);
          const preview = getGroupPreview(group);
          // 血缘信息（取第一个有效的 source_script_id）
          const firstSourceId = group.episodes.find(e => e.source_script_id)?.source_script_id || null;
          const sourceScript = firstSourceId ? sourceMap[firstSourceId] : null;
          const hasSourceDeleted = group.sourceScriptIds.size > 0 && !sourceScript && group.sourceScriptIds.has(firstSourceId);

          return (
            <div
              key={group.key}
              className="group relative bg-(--bg-card) border border-(--border-color) rounded-lg hover:border-(--accent)/40 transition-all shadow-sm"
            >
              <div className="p-4">
                {/* 标题行 */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-(--text-primary) line-clamp-2 flex-1 cursor-pointer"
                    onClick={() => handleViewGroup(group)}
                  >
                    {group.title}
                  </h3>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      statusColor[status] || statusColor.completed
                    }`}
                  >
                    {statusLabel[status] || status}
                  </span>
                </div>

                {/* 元信息 */}
                <div className="space-y-1.5 text-xs text-(--text-muted) mb-2">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3 h-3" />
                    <span>{group.episodes.length} 集</span>
                    <span className="opacity-50">
                      (第{group.episodes[0]?.episode_number || 1}
                      {group.episodes.length > 1 ? ` - ${group.episodes[group.episodes.length - 1].episode_number}` : ''} 集)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {group.isPersonal ? (
                      <>
                        <UserIcon className="w-3 h-3" />
                        <span className="text-(--accent)">个人剧本库</span>
                      </>
                    ) : (
                      <>
                        <Folder className="w-3 h-3" />
                        <span className="truncate">{group.projectName}</span>
                        {/* 原生剧本徐章：项目剧本且无 source_script_id */}
                        {!firstSourceId && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-500/10 text-violet-500 border border-violet-500/20">
                            <FileText className="w-2.5 h-2.5" />
                            原生剧本
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {sourceScript && (
                    <div className="flex items-center gap-1.5">
                      <Copy className="w-3 h-3" />
                      <span className="truncate">
                        源自：{sourceScript.title || `剧本 #${sourceScript.id}`}
                      </span>
                    </div>
                  )}
                  {hasSourceDeleted && (
                    <div className="flex items-center gap-1.5 opacity-60">
                      <Copy className="w-3 h-3" />
                      <span>源剧本已删除</span>
                    </div>
                  )}
                </div>

                {/* 内容预览 */}
                <p className="text-xs text-(--text-secondary) line-clamp-2 mb-3 min-h-[2em]">
                  {preview || <span className="opacity-50">（空）</span>}
                </p>

                {/* 展开的集数列表 */}
                {expanded && (
                  <div className="mb-3 border-t border-(--border-color) pt-2 space-y-1.5">
                    {group.episodes.map((ep) => (
                      <div
                        key={ep.id}
                        className="flex items-center justify-between px-2 py-1 rounded bg-white/5 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Hash className="w-3 h-3 shrink-0 opacity-50" />
                          <span className="truncate">
                            第{ep.episode_number}集
                            {ep.title && ep.title !== group.title && ep.title !== `第${ep.episode_number}集` ? ` · ${ep.title}` : ''}
                          </span>
                          <span className={`shrink-0 text-[9px] px-1 py-0.5 rounded ${
                            statusColor[ep.status || 'draft'] || statusColor.draft
                          }`}>
                            {statusLabel[ep.status || 'draft']}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {onGenerateStoryboard && !group.isPersonal && (
                            <button
                              onClick={() => onGenerateStoryboard(ep)}
                              className="p-1 rounded hover:bg-violet-500/10 text-violet-500/70 hover:text-violet-500 transition-colors"
                              title="生成分镜"
                            >
                              <Film className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={() => onDelete(ep.id)}
                            className="p-1 rounded hover:bg-rose-500/10 text-rose-500/70 hover:text-rose-500 transition-colors"
                            title="删除此集"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {group.isPersonal && onCreateEpisode && (
                      <button
                        onClick={() => {
                          const maxEp = Math.max(...group.episodes.map(e => e.episode_number || 0), 0);
                          onCreateEpisode(group.title, group.projectId, maxEp + 1);
                        }}
                        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded text-[11px] bg-(--accent)/5 hover:bg-(--accent)/10 text-(--accent) transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        添加集数
                      </button>
                    )}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleExpand(group.key)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-white/5 hover:bg-white/10 text-(--text-secondary) transition-colors"
                  >
                    {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {expanded ? '收起' : '展开'}
                  </button>
                  <button
                    onClick={() => handleViewGroup(group)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-white/5 hover:bg-white/10 text-(--text-secondary) transition-colors"
                    title="查看"
                  >
                    <Eye className="w-3 h-3" />
                    查看
                  </button>
                  {group.isPersonal && (
                    <button
                      onClick={() => handleBindGroup(group)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-(--accent)/10 hover:bg-(--accent)/20 text-(--accent) transition-colors"
                      title="绑定整组到项目"
                    >
                      <Link2 className="w-3 h-3" />
                      绑定
                    </button>
                  )}
                  {!group.isPersonal && onGenerateStoryboard && (
                    <button
                      onClick={() => onGenerateStoryboard(group.episodes[0])}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 transition-colors"
                      title="跳转到工作台生成分镜"
                    >
                      <Film className="w-3 h-3" />
                      生成分镜
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteGroup(group)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 transition-colors ml-auto"
                    title="删除整组"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 查看内容 Modal（内嵌 Episode Tabs） */}
      <Modal isOpen={isViewOpen} onOpenChange={onViewOpenChange} size="3xl" scrollBehavior="inside">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <span>{viewingGroup?.title || '剧本详情'}</span>
                <span className="text-xs text-(--text-muted) font-normal">
                  {viewingGroup?.isPersonal
                    ? '个人剧本库'
                    : viewingGroup?.projectName || ''}
                  {' · '}{viewingGroup?.episodes.length || 0} 集
                </span>
              </ModalHeader>
              <ModalBody>
                {viewingGroup && viewingGroup.episodes.length > 1 ? (
                  <div className="flex flex-col gap-4">
                    <Tabs
                      selectedKey={String(viewEpisodeIdx)}
                      onSelectionChange={(k) => setViewEpisodeIdx(Number(k))}
                      variant="underlined"
                      size="sm"
                    >
                      {viewingGroup.episodes.map((ep, idx) => (
                        <Tab
                          key={String(idx)}
                          title={`第${ep.episode_number}集`}
                        />
                      ))}
                    </Tabs>
                    <pre className="whitespace-pre-wrap font-sans text-sm text-(--text-primary) leading-relaxed">
                      {viewingGroup.episodes[viewEpisodeIdx]?.content || '（空）'}
                    </pre>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm text-(--text-primary) leading-relaxed">
                    {viewingGroup?.episodes[0]?.content || '（空）'}
                  </pre>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  关闭
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 绑定到项目 Modal */}
      <Modal isOpen={isBindOpen} onOpenChange={onBindOpenChange} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>绑定到项目</ModalHeader>
              <ModalBody>
                <div className="space-y-3 text-sm">
                  <div className="p-3 rounded bg-(--bg-input) border border-(--border-color)">
                    <div className="text-xs text-(--text-muted) mb-1">原始剧本</div>
                    <div className="font-medium text-(--text-primary)">
                      {bindingGroup?.title || '未知'}
                    </div>
                    <div className="text-[10px] text-(--text-muted) mt-0.5">
                      {bindingGroup?.episodes.length || 0} 集（第{bindingGroup?.episodes[0]?.episode_number || 1} - 第{bindingGroup?.episodes[bindingGroup.episodes.length - 1]?.episode_number || 1} 集）
                    </div>
                  </div>

                  <div className="text-xs text-(--text-muted) leading-relaxed">
                    绑定会把整组剧本（全部集数）<strong className="text-(--accent)">深拷贝一份副本</strong>到目标项目，
                    副本与原始剧本各自独立编辑、互不影响。
                  </div>

                  <Select
                    label="目标项目"
                    selectedKeys={bindTargetProjectId ? [bindTargetProjectId] : []}
                    onSelectionChange={(keys) => {
                      const k = Array.from(keys)[0] as string;
                      setBindTargetProjectId(k || '');
                    }}
                    placeholder="选择要绑定到的项目"
                    isRequired
                  >
                    {projects.map((p) => (
                      <SelectItem key={String(p.id)} textValue={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </Select>

                  <Input
                    label="副本标题（可选）"
                    placeholder="留空则沿用原标题"
                    value={bindTitleOverride}
                    onValueChange={setBindTitleOverride}
                  />
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  onPress={handleBindConfirm}
                  isDisabled={!bindTargetProjectId || binding}
                  isLoading={binding}
                >
                  确定绑定整组
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

export default ScriptList;
