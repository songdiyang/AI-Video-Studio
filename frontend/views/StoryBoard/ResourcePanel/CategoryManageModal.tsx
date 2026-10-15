/**
 * 资源分类管理弹窗
 * ──────────────────────────────────────────────────────────────
 * - 内置类型：开启/关闭展示（默认仅保留角色/影棚/道具三个基本分类）
 * - 自定义分类：用户新建、重命名、删除，并按资源类型挑选成员
 * - AI 分类：对当前项目资源跑关键词启发式归类，一键应用或清除
 */
import React, { useMemo, useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Switch,
} from '@heroui/react';
import { Pencil, Plus, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import {
  AI_CATEGORY_RULES,
  ALL_RESOURCE_TYPES,
  CategoryConfig,
  CategoryMemberRef,
  CategoryResourceEntry,
  CustomCategory,
  RESOURCE_TYPE_REGISTRY,
  ResourceTypeKey,
  classifyResources,
  findResourceEntry,
  memberRefOf,
} from './resourceCategories';

interface CategoryManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CategoryConfig;
  entries: CategoryResourceEntry[];
  onToggleType: (type: ResourceTypeKey) => void;
  onAddCustom: (name: string, members?: CategoryMemberRef[]) => boolean;
  onRenameCustom: (id: string, name: string) => void;
  onRemoveCustom: (id: string) => void;
  onAddMember: (id: string, ref: CategoryMemberRef) => void;
  onRemoveMember: (id: string, ref: CategoryMemberRef) => void;
  onApplyAi: (suggestions: Omit<CustomCategory, 'id'>[]) => void;
  onClearAi: () => void;
}

/** 自定义分类单行：名称 + 成员增删 + 重命名/删除 */
const CustomCategoryRow: React.FC<{
  category: CustomCategory;
  entries: CategoryResourceEntry[];
  onRename: (name: string) => void;
  onRemove: () => void;
  onAddMember: (ref: CategoryMemberRef) => void;
  onRemoveMember: (ref: CategoryMemberRef) => void;
}> = ({ category, entries, onRename, onRemove, onAddMember, onRemoveMember }) => {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(category.name);
  const [memberType, setMemberType] = useState<ResourceTypeKey>('characters');

  const candidates = useMemo(() => {
    const used = new Set(category.members);
    return entries.filter(e => e.type === memberType && !used.has(memberRefOf(e)));
  }, [entries, category.members, memberType]);

  return (
    <div className="rounded-lg border border-(--border-color) bg-(--bg-card) p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        {editing ? (
          <>
            <input
              autoFocus
              value={draftName}
              onChange={e => setDraftName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { onRename(draftName); setEditing(false); }
                if (e.key === 'Escape') setEditing(false);
              }}
              className="flex-1 min-w-0 px-2 py-0.5 rounded bg-(--bg-app) border border-(--border-color) text-xs text-(--text-primary) outline-none focus:border-(--accent)"
            />
            <Button
              size="sm"
              variant="light"
              className="h-6 min-w-0 px-1 text-xs"
              onPress={() => { onRename(draftName); setEditing(false); }}
            >
              确定
            </Button>
          </>
        ) : (
          <>
            <span className="flex-1 min-w-0 truncate text-xs font-medium text-(--text-primary)">
              {category.name}
              {category.aiGenerated && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-(--accent)">
                  <Sparkles className="w-2.5 h-2.5" />AI
                </span>
              )}
            </span>
            <span className="text-[10px] text-(--text-muted)">{category.members.length} 项</span>
            <button
              type="button"
              onClick={() => { setDraftName(category.name); setEditing(true); }}
              className="p-1 rounded text-(--text-muted) hover:text-(--text-primary) hover:bg-white/5"
              title="重命名"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="p-1 rounded text-(--text-muted) hover:text-red-400 hover:bg-white/5"
              title="删除分类"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        )}
      </div>

      {/* 成员 chips */}
      <div className="flex flex-wrap gap-1">
        {category.members.length === 0 && (
          <span className="text-[10px] text-(--text-muted)">暂无成员，从下方选择资源加入</span>
        )}
        {category.members.map(ref => {
          const entry = findResourceEntry(entries, ref);
          return (
            <span
              key={ref}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-(--bg-app) border border-(--border-color) text-[10px] text-(--text-secondary)"
            >
              {entry ? entry.name : '（已删除资源）'}
              {!entry && <span className="text-(--text-muted) opacity-60">·失效</span>}
              <button
                type="button"
                onClick={() => onRemoveMember(ref)}
                className="text-(--text-muted) hover:text-red-400"
                title="移出分类"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          );
        })}
      </div>

      {/* 添加成员：先选类型再选资源 */}
      {!editing && candidates.length > 0 && (
        <div className="flex items-center gap-1.5">
          <select
            value={memberType}
            onChange={e => setMemberType(e.target.value as ResourceTypeKey)}
            className="px-1.5 py-0.5 rounded bg-(--bg-app) border border-(--border-color) text-[10px] text-(--text-primary) outline-none"
          >
            {ALL_RESOURCE_TYPES.map(t => (
              <option key={t} value={t}>{RESOURCE_TYPE_REGISTRY[t].label}</option>
            ))}
          </select>
          <select
            value=""
            onChange={e => { if (e.target.value) onAddMember(e.target.value); }}
            className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-(--bg-app) border border-(--border-color) text-[10px] text-(--text-primary) outline-none"
          >
            <option value="">+ 添加成员…</option>
            {candidates.map(e => (
              <option key={memberRefOf(e)} value={memberRefOf(e)}>{e.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

const CategoryManageModal: React.FC<CategoryManageModalProps> = ({
  isOpen,
  onClose,
  config,
  entries,
  onToggleType,
  onAddCustom,
  onRenameCustom,
  onRemoveCustom,
  onAddMember,
  onRemoveMember,
  onApplyAi,
  onClearAi,
}) => {
  const [newName, setNewName] = useState('');
  const [aiPreview, setAiPreview] = useState<Omit<CustomCategory, 'id'>[] | null>(null);
  const hasAiCategories = config.customCategories.some(c => c.aiGenerated);

  /** 各内置类型资源数量（直接按扁平条目统计） */
  const countByType = useMemo(
    () => Object.fromEntries(
      ALL_RESOURCE_TYPES.map(t => [t, entries.filter(e => e.type === t).length]),
    ) as Record<ResourceTypeKey, number>,
    [entries],
  );

  const handleAdd = () => {
    if (onAddCustom(newName)) setNewName('');
  };

  const handleRunAi = () => {
    setAiPreview(classifyResources(entries));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" scrollBehavior="inside" className="bg-(--bg-app) text-(--text-primary)">
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-sm">
          <Settings2 className="w-4 h-4" />
          资源分类管理
        </ModalHeader>
        <ModalBody className="gap-4 text-xs">
          {/* 内置类型开关 */}
          <section>
            <h4 className="mb-1.5 text-[11px] font-semibold text-(--text-secondary)">基本分类（开启/关闭展示）</h4>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {ALL_RESOURCE_TYPES.map(type => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-(--text-primary)">
                    {RESOURCE_TYPE_REGISTRY[type].label}
                    <span className="ml-1 text-[10px] text-(--text-muted)">({countByType[type]})</span>
                  </span>
                  <Switch
                    size="sm"
                    isSelected={config.enabledTypes.includes(type)}
                    onValueChange={() => onToggleType(type)}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* 自定义分类 */}
          <section>
            <h4 className="mb-1.5 text-[11px] font-semibold text-(--text-secondary)">自定义分类</h4>
            <div className="space-y-2">
              {config.customCategories.length === 0 && (
                <p className="text-[11px] text-(--text-muted)">还没有自定义分类，可在下方新建或使用 AI 自动分类。</p>
              )}
              {config.customCategories.map(c => (
                <CustomCategoryRow
                  key={c.id}
                  category={c}
                  entries={entries}
                  onRename={name => onRenameCustom(c.id, name)}
                  onRemove={() => onRemoveCustom(c.id)}
                  onAddMember={ref => onAddMember(c.id, ref)}
                  onRemoveMember={ref => onRemoveMember(c.id, ref)}
                />
              ))}
              <div className="flex items-center gap-1.5">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                  placeholder="新分类名称，如「第一季」"
                  className="flex-1 min-w-0 px-2 py-1 rounded bg-(--bg-card) border border-(--border-color) text-xs text-(--text-primary) outline-none focus:border-(--accent)"
                />
                <Button
                  size="sm"
                  variant="flat"
                  isDisabled={!newName.trim()}
                  className="h-7 min-w-0 px-2 text-xs"
                  startContent={<Plus className="w-3 h-3" />}
                  onPress={handleAdd}
                >
                  新建
                </Button>
              </div>
            </div>
          </section>

          {/* AI 分类 */}
          <section>
            <h4 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-(--text-secondary)">
              <Sparkles className="w-3 h-3 text-(--accent)" />
              AI 自动分类
            </h4>
            <p className="mb-2 text-[10px] text-(--text-muted) leading-relaxed">
              按资源名称关键词启发式归类（{AI_CATEGORY_RULES.length} 组规则），生成结果可再手动调整。
            </p>
            {aiPreview && (
              <div className="mb-2 space-y-1 rounded-lg border border-(--border-color) bg-(--bg-card) p-2">
                {aiPreview.length === 0 && (
                  <p className="text-[10px] text-(--text-muted)">未匹配到可归类的资源（需要命中同组关键词 ≥2 个）。</p>
                )}
                {aiPreview.map(s => (
                  <div key={s.name} className="flex items-center justify-between text-[11px]">
                    <span className="text-(--text-primary)">{s.name}</span>
                    <span className="text-(--text-muted)">{s.members.length} 项</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" variant="flat" className="h-7 text-xs" startContent={<Sparkles className="w-3 h-3" />} onPress={handleRunAi}>
                运行分类
              </Button>
              <Button
                size="sm"
                variant="flat"
                color="primary"
                className="h-7 text-xs"
                isDisabled={!aiPreview || aiPreview.length === 0}
                onPress={() => { if (aiPreview) { onApplyAi(aiPreview); setAiPreview(null); } }}
              >
                应用结果
              </Button>
              {hasAiCategories && (
                <Button size="sm" variant="light" className="h-7 text-xs text-(--text-muted)" onPress={onClearAi}>
                  清除 AI 分类
                </Button>
              )}
            </div>
          </section>
        </ModalBody>
        <ModalFooter>
          <Button size="sm" variant="light" className="text-xs" onPress={onClose}>关闭</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default CategoryManageModal;
