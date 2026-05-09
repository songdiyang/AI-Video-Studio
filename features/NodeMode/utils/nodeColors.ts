/**
 * 节点颜色配置
 */

import React from 'react';
import { User, MapPin, Layers, Image as ImageIcon, Film, FileText } from 'lucide-react';
import { NodeType } from '../types';

export interface NodeColorConfig {
  bg: string;
  border: string;
  header: string;
  accent: string;
  icon: React.ReactNode;
}

export const NODE_COLORS: Record<NodeType, NodeColorConfig> = {
  image: {
    bg: 'bg-white',
    border: 'border-blue-600',
    header: 'bg-blue-900/40',
    accent: 'text-blue-600',
    icon: React.createElement(ImageIcon, { size: 12 }),
  },
  video: {
    bg: 'bg-white',
    border: 'border-rose-600',
    header: 'bg-rose-900/40',
    accent: 'text-rose-600',
    icon: React.createElement(Film, { size: 12 }),
  },
  character: {
    bg: 'bg-white',
    border: 'border-amber-600',
    header: 'bg-amber-900/40',
    accent: 'text-amber-700',
    icon: React.createElement(User, { size: 12 }),
  },
  scene: {
    bg: 'bg-white',
    border: 'border-emerald-600',
    header: 'bg-emerald-900/40',
    accent: 'text-emerald-700',
    icon: React.createElement(MapPin, { size: 12 }),
  },
  composite: {
    bg: 'bg-white',
    border: 'border-purple-600',
    header: 'bg-purple-900/40',
    accent: 'text-purple-600',
    icon: React.createElement(Layers, { size: 12 }),
  },
  text: {
    bg: 'bg-white',
    border: 'border-slate-500',
    header: 'bg-slate-200',
    accent: 'text-slate-600',
    icon: React.createElement(FileText, { size: 12 }),
  },
};

export function getNodeColors(type: NodeType): NodeColorConfig {
  return NODE_COLORS[type] || NODE_COLORS.image;
}
