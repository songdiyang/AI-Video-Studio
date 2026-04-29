import React from 'react';
import { Button, Chip } from '@heroui/react';
import { Edit, Trash2, Layers } from 'lucide-react';
import { motion } from 'framer-motion';
import { Character, TagGroup } from '../../services/assets';

interface CharacterListProps {
  characters: Character[];
  tagGroups: TagGroup[];
  onEdit: (character: Character) => void;
  onDelete: (id: number) => void;
}

// 列表容器动画配置
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

// 根据分组ID获取颜色
const getGroupColor = (groupId: number, tagGroups: TagGroup[]): string => {
  const group = tagGroups.find(g => g.id === groupId);
  return group?.color || '#6366f1';
};

/** 列表预览图：优先使用第一个角色状态的正面图（白膜优先）。 */
const resolvePreviewUrl = (character: Character): string | undefined => {
  return character.first_state_front_view_url
    || character.base_model_image_url
    || character.front_view_url
    || character.image_url
    || undefined;
};

const CharacterList: React.FC<CharacterListProps> = ({ characters, tagGroups, onEdit, onDelete }) => {
  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6"
    >
      {characters.map((character) => {
        const previewUrl = resolvePreviewUrl(character);

        return (
          <div
            key={character.id}
            className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-lg hover:shadow-(--accent)/10 transition-all cursor-pointer rounded-xl overflow-hidden group"
            onClick={() => onEdit(character)}
          >
            {/* 图片区域 - 直接展示第一个角色状态的正面图 */}
            <div className="relative aspect-[3/4] bg-gradient-to-br from-(--bg-hover) to-(--bg-card) overflow-hidden">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={character.name}
                  className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-(--text-muted)">
                  <span className="text-4xl font-bold opacity-20">{character.name.charAt(0)}</span>
                </div>
              )}
              
              {/* 悬浮操作按钮 */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <Button 
                  size="sm" 
                  isIconOnly 
                  variant="solid"
                  className="bg-(--bg-card)/90 backdrop-blur-sm hover:bg-(--accent)/20"
                  onClick={(e) => { e.stopPropagation(); onEdit(character); }}
                >
                  <Edit className="w-4 h-4 text-(--accent)" />
                </Button>
                <Button 
                  size="sm" 
                  isIconOnly 
                  variant="solid"
                  className="bg-(--bg-card)/90 backdrop-blur-sm hover:bg-red-500/20"
                  onClick={(e) => { e.stopPropagation(); onDelete(character.id); }}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>

              {/* 状态数量徽章 */}
              {character.states_count > 0 && (
                <div className="absolute top-2 left-2 z-10">
                  <Chip
                    size="sm"
                    variant="solid"
                    className="bg-(--bg-card)/90 backdrop-blur-sm text-(--text-primary) font-medium"
                    startContent={<Layers className="w-3 h-3" />}
                  >
                    {character.states_count}
                  </Chip>
                </div>
              )}
            </div>

            {/* 信息区域 - 次要展示 */}
            <div className="p-3 space-y-2">
              <h3 className="text-base font-semibold text-(--text-primary) truncate">
                {character.name}
              </h3>
              
              {/* 描述文字（可选显示） */}
              {character.description && (
                <p className="text-xs text-(--text-muted) line-clamp-2 leading-relaxed">
                  {character.description}
                </p>
              )}

              {/* 标签区域 */}
              <div className="flex flex-wrap gap-1.5">
                {character.project_name && (
                  <Chip 
                    size="sm" 
                    variant="flat" 
                    className="bg-emerald-500/10 text-emerald-400 text-xs"
                  >
                    {character.project_name}
                  </Chip>
                )}
                {/* 分组标签展示已移除：标签分组功能不再维护，统一使用基础信息 tags 字段 */}
                {/* 显示用户自定义标签（基础信息 tags 字段） */}
                {character.tags && character.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean).slice(0, 3).map((tag, idx) => (
                  <Chip
                    key={`tag-${idx}`}
                    size="sm"
                    variant="flat"
                    className="bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/20 text-xs"
                  >
                    {tag}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
};

export default CharacterList;
