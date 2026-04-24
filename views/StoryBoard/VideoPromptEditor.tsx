/**
 * 视频首尾帧提示词编辑器
 * 用于展示和编辑分镜的两个独立视频提示词
 */

import React, { useState } from 'react';
import { Button, Textarea, Card, CardBody, Chip } from '@heroui/react';
import { Play, Save, Sparkles, Film } from 'lucide-react';

interface VideoPromptEditorProps {
  storyboardId: number;
  videoPrompt?: string; // 旧版统一视频提示词（兼容）
  videoStartPrompt?: string;
  videoEndPrompt?: string;
  variables?: Record<string, unknown>; // 包含 hasAction 等字段
  onOptimize?: () => Promise<void>;
  onSave: (updates: { video_prompt?: string; video_start_prompt?: string; video_end_prompt?: string }) => Promise<void>;
  isOptimizing?: boolean;
}

export const VideoPromptEditor: React.FC<VideoPromptEditorProps> = ({
  storyboardId,
  videoPrompt = '',
  videoStartPrompt = '',
  videoEndPrompt = '',
  variables = {},
  onOptimize,
  onSave,
  isOptimizing = false,
}) => {
  // 判断是否为动作镜头
  const isActionShot = variables.hasAction === true;
  
  // 状态管理
  const [startPrompt, setStartPrompt] = useState(isActionShot ? videoStartPrompt : videoPrompt);
  const [endPrompt, setEndPrompt] = useState(videoEndPrompt);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (isActionShot) {
        // 动作镜头：保存两个独立的提示词
        await onSave({
          video_start_prompt: startPrompt,
          video_end_prompt: endPrompt,
        });
      } else {
        // 静态镜头：只保存一个统一的提示词
        await onSave({
          video_prompt: startPrompt,
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = isActionShot 
    ? (startPrompt !== videoStartPrompt || endPrompt !== videoEndPrompt)
    : (startPrompt !== videoPrompt);

  return (
    <Card className="border border-blue-500/30 bg-gradient-to-br from-blue-50/50 to-purple-50/50">
      <CardBody className="space-y-4">
        {/* 标题栏 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-800">视频提示词</h3>
            {isActionShot ? (
              <Chip size="sm" color="danger" variant="flat">
                动作镜头（首尾帧）
              </Chip>
            ) : (
              <Chip size="sm" color="default" variant="flat">
                静态镜头
              </Chip>
            )}
          </div>
          <div className="flex gap-2">
            {onOptimize && (
              <Button
                size="sm"
                color="primary"
                variant="flat"
                startContent={<Sparkles className={`w-4 h-4 ${isOptimizing ? 'animate-spin' : ''}`} />}
                onPress={onOptimize}
                isLoading={isOptimizing}
              >
                {isOptimizing ? '优化中...' : 'AI 优化'}
              </Button>
            )}
            <Button
              size="sm"
              color="success"
              variant={hasChanges ? 'solid' : 'flat'}
              startContent={<Save className="w-4 h-4" />}
              onPress={handleSave}
              isLoading={isSaving}
              isDisabled={!hasChanges}
            >
              保存
            </Button>
          </div>
        </div>

        {isActionShot ? (
          // 动作镜头：显示首尾帧两个提示词
          <>
            {/* 视频首帧提示词 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-green-600" />
                <label className="text-sm font-medium text-gray-700">
                  视频首帧提示词（前半段）
                </label>
                <Chip size="sm" color="success" variant="flat">
                  0-50%
                </Chip>
              </div>
              <Textarea
                value={startPrompt}
                onChange={(e) => setStartPrompt(e.target.value)}
                placeholder="描述从首帧图片到中间帧的动态过程..."
                className="min-h-[120px]"
                classNames={{
                  input: 'text-sm',
                  inputWrapper: 'bg-white border-gray-200',
                }}
              />
              <p className="text-xs text-gray-500">
                💡 提示：使用角色外貌描述而非名字（如"中年男性将军"而非"秦战"）
              </p>
            </div>

            {/* 视频尾帧提示词 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-purple-600" />
                <label className="text-sm font-medium text-gray-700">
                  视频尾帧提示词（后半段）
                </label>
                <Chip size="sm" color="secondary" variant="flat">
                  50-100%
                </Chip>
              </div>
              <Textarea
                value={endPrompt}
                onChange={(e) => setEndPrompt(e.target.value)}
                placeholder="描述从中间帧到尾帧图片的动态过程..."
                className="min-h-[120px]"
                classNames={{
                  input: 'text-sm',
                  inputWrapper: 'bg-white border-gray-200',
                }}
              />
              <p className="text-xs text-gray-500">
                💡 提示：强调动作的完成状态和最终姿态
              </p>
            </div>

            {/* 统计信息 */}
            {(startPrompt || endPrompt) && (
              <div className="flex gap-4 text-xs text-gray-500 pt-2 border-t border-gray-200">
                {startPrompt && (
                  <span>首帧提示词：{startPrompt.length} 字</span>
                )}
                {endPrompt && (
                  <span>尾帧提示词：{endPrompt.length} 字</span>
                )}
              </div>
            )}
          </>
        ) : (
          // 静态镜头：只显示一个统一的提示词
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-blue-600" />
              <label className="text-sm font-medium text-gray-700">
                视频提示词
              </label>
            </div>
            <Textarea
              value={startPrompt}
              onChange={(e) => setStartPrompt(e.target.value)}
              placeholder="描述视频画面的动态过程..."
              className="min-h-[150px]"
              classNames={{
                input: 'text-sm',
                inputWrapper: 'bg-white border-gray-200',
              }}
            />
            <p className="text-xs text-gray-500">
              💡 提示：静态镜头只需描述一个统一的动态过程，使用角色外貌描述而非名字
            </p>
            {startPrompt && (
              <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
                提示词长度：{startPrompt.length} 字
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
};
