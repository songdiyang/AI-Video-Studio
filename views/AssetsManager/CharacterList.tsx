import React from 'react';
import { Card, CardBody, Button, Chip } from '@heroui/react';
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

// 列表项动画配置
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 0.2, 1] as const,
    },
  },
};

// 根据分组ID获取颜色
const getGroupColor = (groupId: number, tagGroups: TagGroup[]): string => {
  const group = tagGroups.find(g => g.id === groupId);
  return group?.color || '#6366f1';
};

const CharacterList: React.FC<CharacterListProps> = ({ characters, tagGroups, onEdit, onDelete }) => {
  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6"
    >
      {characters.map((character) => (
        <motion.div
          key={character.id}
          variants={itemVariants}
        >
          <Card 
            className="bg-(--bg-card) border border-(--border-color) shadow-sm hover:shadow-md hover:shadow-(--accent)/5 transition-shadow cursor-pointer"
            isPressable
            onPress={() => onEdit(character)}
          >
            <CardBody className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-semibold text-(--text-primary)">{character.name}</h3>
                <div className="flex gap-1">
                  <Button 
                    size="sm" 
                    isIconOnly 
                    variant="light" 
                    onPress={() => onEdit(character)} 
                    className="hover:bg-(--accent)/10"
                  >
                    <Edit className="w-4 h-4 text-(--accent)" />
                  </Button>
                  <Button 
                    size="sm" 
                    isIconOnly 
                    variant="light" 
                    onPress={() => onDelete(character.id)} 
                    className="hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-(--text-secondary) line-clamp-2">{character.description}</p>
              <div className="flex flex-wrap gap-2">
                {character.project_name && (
                  <Chip 
                    size="sm" 
                    variant="flat" 
                    className="bg-emerald-500/10 text-emerald-400 font-medium"
                  >
                    {character.project_name}
                  </Chip>
                )}
                {/* 显示状态数量 */}
                {character.states_count > 0 && (
                  <Chip
                    size="sm"
                    variant="flat"
                    className="bg-purple-500/10 text-purple-400 font-medium"
                    startContent={<Layers className="w-3 h-3" />}
                  >
                    {character.states_count} 状态
                  </Chip>
                )}
                {/* 显示分组标签（彩色） */}
                {character.tag_groups_json && character.tag_groups_json.map((group) => 
                  group.tags.map((tag, idx) => {
                    const color = getGroupColor(group.groupId, tagGroups);
                    return (
                      <Chip 
                        key={`${group.groupId}-${idx}`}
                        size="sm" 
                        variant="flat" 
                        style={{
                          backgroundColor: `${color}25`,
                          color: color,
                          borderColor: `${color}50`,
                          boxShadow: `0 1px 2px ${color}15`,
                        }}
                        className="font-medium border-1.5"
                      >
                        {tag}
                      </Chip>
                    );
                  })
                )}
                {/* 显示普通标签（兼容旧数据） */}
                {character.tags && character.tags.split(',').map((tag, idx) => (
                  <Chip 
                    key={`plain-${idx}`} 
                    size="sm" 
                    variant="flat" 
                    className="bg-(--accent)/10 text-(--accent) font-medium"
                  >
                    {tag.trim()}
                  </Chip>
                ))}
              </div>
            </CardBody>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
};

export default CharacterList;
