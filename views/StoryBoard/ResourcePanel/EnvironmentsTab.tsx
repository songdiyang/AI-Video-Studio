import React from 'react';
import { Card, CardBody, Chip } from '@heroui/react';
import type { Environment } from '../../../services/environments';

interface EnvironmentsTabProps {
  environments: Environment[];
  isLoading?: boolean;
}

const openAssetEditTab = (env: Environment) => {
  window.dispatchEvent(new CustomEvent('openAssetEditTab', {
    detail: {
      assetType: 'environment',
      assetId: env.id,
      assetName: env.name,
      initialData: {
        name: env.name,
        description: env.description || '',
        timeOfDay: env.time_of_day || '',
        weather: env.weather || '',
        lighting: env.lighting || '',
        mood: env.mood || '',
        terrainType: env.terrain_type || '',
        project_id: env.project_id,
      },
    }
  }));
};

const EnvironmentsTab: React.FC<EnvironmentsTabProps> = ({
  environments,
  isLoading,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          全部环境 ({environments.length})
        </span>
      </div>

      {isLoading ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-sky-500 mb-2" />
          <p className="text-sm">加载中...</p>
        </div>
      ) : environments.length === 0 ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <span className="text-4xl block mb-2">🌍</span>
          <p className="text-sm">暂无任何环境</p>
          <p className="text-xs mt-1">请先到资产管理中创建环境</p>
        </div>
      ) : (
        environments.map((env) => (
          <Card
            key={env.id}
            className="border transition-colors hover:border-sky-500/30 cursor-pointer"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border)' }}
            onDoubleClick={() => openAssetEditTab(env)}
            isPressable
          >
            <CardBody className="p-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                  {env.name}
                </p>
                {env.description && (
                  <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                    {env.description}
                  </p>
                )}

                {/* 属性标签 */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {env.time_of_day && (
                    <Chip
                      size="sm"
                      variant="flat"
                      className="bg-amber-500/10 text-amber-300 h-5 text-[10px]"
                    >
                      {env.time_of_day}
                    </Chip>
                  )}
                  {env.weather && (
                    <Chip
                      size="sm"
                      variant="flat"
                      className="bg-sky-500/10 text-sky-300 h-5 text-[10px]"
                    >
                      {env.weather}
                    </Chip>
                  )}
                  {env.lighting && (
                    <Chip
                      size="sm"
                      variant="flat"
                      className="bg-yellow-500/10 text-yellow-300 h-5 text-[10px]"
                    >
                      {env.lighting}
                    </Chip>
                  )}
                  {env.mood && (
                    <Chip
                      size="sm"
                      variant="flat"
                      className="bg-purple-500/10 text-purple-300 h-5 text-[10px]"
                    >
                      {env.mood}
                    </Chip>
                  )}
                  {env.generation_status === 'generating' && (
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

export default EnvironmentsTab;
