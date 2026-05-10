import React from 'react';
import { Card, CardBody, Chip } from '@heroui/react';
import type { Building } from '../../../services/buildings';

interface BuildingsTabProps {
  buildings: Building[];
  isLoading?: boolean;
}

const interiorExteriorLabel: Record<string, string> = {
  interior: '室内',
  exterior: '室外',
  both: '室内外',
};

const openAssetEditTab = (b: Building) => {
  window.dispatchEvent(new CustomEvent('openAssetEditTab', {
    detail: {
      assetType: 'building',
      assetId: b.id,
      assetName: b.name,
      initialData: {
        name: b.name,
        description: b.description || '',
        interiorExterior: b.interior_exterior || 'both',
        structureType: b.structure_type || '',
        project_id: b.project_id,
      },
    }
  }));
};

const BuildingsTab: React.FC<BuildingsTabProps> = ({
  buildings,
  isLoading,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          全部建筑 ({buildings.length})
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500 mb-2" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : buildings.length === 0 ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <span className="text-4xl block mb-2">🏛️</span>
          <p className="text-sm">暂无任何建筑</p>
          <p className="text-xs mt-1">请先到资产管理中创建建筑</p>
        </div>
      ) : (
        buildings.map((b) => (
          <Card
            key={b.id}
            className="border transition-colors hover:border-amber-500/30 cursor-pointer"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            onDoubleClick={() => openAssetEditTab(b)}
            isPressable
          >
            <CardBody className="p-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {b.name}
                </p>
                {b.description && (
                  <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                    {b.description}
                  </p>
                )}

                {/* 属性标签 */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {b.interior_exterior && (
                    <Chip
                      size="sm"
                      variant="flat"
                      className="bg-amber-500/10 text-amber-300 h-5 text-[10px]"
                    >
                      {interiorExteriorLabel[b.interior_exterior] || b.interior_exterior}
                    </Chip>
                  )}
                  {b.structure_type && (
                    <Chip
                      size="sm"
                      variant="flat"
                      className="bg-slate-500/10 text-slate-300 h-5 text-[10px]"
                    >
                      {b.structure_type}
                    </Chip>
                  )}
                  {b.generation_status === 'generating' && (
                    <Chip
                      size="sm"
                      variant="flat"
                      className="bg-blue-500/10 text-blue-300 h-5 text-[10px]"
                    >
                      生成中
                    </Chip>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>
        ))
      )}


    </div>
  );
};

export default BuildingsTab;
