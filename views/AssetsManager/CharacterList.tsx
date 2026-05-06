import React from 'react';
import { Button, Chip } from '@heroui/react';
import { Edit, Trash2, Layers, User } from 'lucide-react';
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
            {/* 封面区域 */}
            <div className="relative h-44 bg-gradient-to-br from-(--bg-hover) to-(--bg-card) overflow-hidden">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={character.name}
                  className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-(--accent)/10 flex items-center justify-center">
                    <User className="w-8 h-8 text-(--accent)/40" />
                  </div>
                  <span className="text-sm font-medium text-(--text-muted)/50">{character.name}</span>
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
              {character.states_count != null && character.states_count > 0 && (
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

              {/* 底部渐变遮罩 + 名称 */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent px-3 pb-2 pt-6">
                <h3 className="text-base font-bold text-white truncate drop-shadow-sm">
                  {character.name}
                </h3>
              </div>
            </div>

            {/* 信息区域 */}
            <div className="p-3 space-y-2">
              {/* 描述文字 */}
              {character.description ? (
                <p className="text-xs text-(--text-muted) line-clamp-2 leading-relaxed">
                  {character.description}
                </p>
              ) : (
                <p className="text-xs text-(--text-muted)/50 italic">暂无描述</p>
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
