import React from 'react';
import { Card, CardBody, Chip } from '@heroui/react';
import { Cloud, Sun, CloudRain, Wind, ImageOff } from 'lucide-react';
import type { Environment } from '../../../services/environments';

interface EnvironmentsTabProps {
  environments: Environment[];
  isLoading?: boolean;
}

const weatherIconMap: Record<string, React.ReactNode> = {
  sunny: <Sun className="w-3 h-3" />,
  cloudy: <Cloud className="w-3 h-3" />,
  rainy: <CloudRain className="w-3 h-3" />,
  windy: <Wind className="w-3 h-3" />,
};

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
            <CardBody className="p-0">
              {/* 封面图 */}
              <div
                className="relative w-full h-28 overflow-hidden group"
                style={{ backgroundColor: 'var(--bg-secondary)' }}
              >
                {env.image_url ? (
                  <>
                    <img
                      src={env.image_url}
                      alt={env.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-medium bg-black/50 rounded px-2 py-1">
                        双击编辑
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    <ImageOff className="w-6 h-6 opacity-30" />
                    <span className="text-[11px] opacity-50">暂无参考图</span>
                  </div>
                )}
              </div>

              {/* 信息 */}
              <div className="px-3 py-2.5">
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
                      startContent={weatherIconMap[env.weather.toLowerCase()] || <Cloud className="w-2.5 h-2.5" />}
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
