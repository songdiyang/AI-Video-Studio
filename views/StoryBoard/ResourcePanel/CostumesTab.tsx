import React from 'react';
import { Card, CardBody, Chip } from '@heroui/react';
import type { Costume } from '../../../services/costumes';

interface CostumesTabProps {
  costumes: Costume[];
  isLoading?: boolean;
}

const genderLabelMap: Record<string, string> = {
  male: '男装',
  female: '女装',
  unisex: '通用',
};

const genderColorMap: Record<string, string> = {
  male: 'bg-blue-500/10 text-blue-300',
  female: 'bg-pink-500/10 text-pink-300',
  unisex: 'bg-purple-500/10 text-purple-300',
};

const openAssetEditTab = (costume: Costume) => {
  window.dispatchEvent(new CustomEvent('openAssetEditTab', {
    detail: {
      assetType: 'costume',
      assetId: costume.id,
      assetName: costume.name,
      initialData: costume,
    }
  }));
};

const CostumesTab: React.FC<CostumesTabProps> = ({
  costumes,
  isLoading,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          全部服装 ({costumes.length})
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mb-2" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : costumes.length === 0 ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <span className="text-4xl block mb-2">👔</span>
          <p className="text-sm">暂无任何服装</p>
          <p className="text-xs mt-1">请先到资产管理中创建服装</p>
        </div>
      ) : (
        costumes.map((costume) => (
          <Card
            key={costume.id}
            className="border transition-colors hover:border-pink-500/30 cursor-pointer"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            onDoubleClick={() => openAssetEditTab(costume)}
            isPressable
          >
            <CardBody className="p-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {costume.name}
                </p>
                {costume.description && (
                  <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                    {costume.description}
                  </p>
                )}

                {/* 属性标签 */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {costume.category && (
                    <Chip
                      size="sm"
                      variant="flat"
                      className="bg-rose-500/10 text-rose-300 h-5 text-[10px]"
                    >
                      {costume.category}
                    </Chip>
                  )}
                  {costume.gender && (
                    <Chip
                      size="sm"
                      variant="flat"
                      className={`${genderColorMap[costume.gender] || 'bg-slate-500/10 text-slate-300'} h-5 text-[10px]`}
                    >
                      {genderLabelMap[costume.gender] || costume.gender}
                    </Chip>
                  )}
                  {costume.generation_status === 'generating' && (
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

export default CostumesTab;
