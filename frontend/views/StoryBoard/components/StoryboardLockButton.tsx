/**
 * 分镜锁定/解锁按钮组件
 */

import React, { useState } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { Lock, Unlock, Loader2 } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { lockStoryboard, unlockStoryboard } from '../../../services/storyboards';

interface StoryboardLockButtonProps {
  storyboardId: number;
  isLocked: boolean;
  lockedBy?: string;
  onLockChange?: (locked: boolean, lockedBy?: string) => void;
  size?: 'sm' | 'md';
}

const StoryboardLockButton: React.FC<StoryboardLockButtonProps> = ({
  storyboardId,
  isLocked,
  lockedBy,
  onLockChange,
  size = 'sm',
}) => {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleToggleLock = async () => {
    setLoading(true);
    try {
      if (isLocked) {
        const result = await unlockStoryboard(storyboardId);
        showToast(result.message, 'success');
        onLockChange?.(false, undefined);
      } else {
        const result = await lockStoryboard(storyboardId);
        showToast(result.message, 'success');
        onLockChange?.(true, result.locked_by);
      }
    } catch (error: any) {
      showToast(error.message || '操作失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const buttonSize = size === 'sm' ? 'sm' : 'md';

  if (isLocked) {
    return (
      <Tooltip
        content={lockedBy ? `已被 ${lockedBy} 锁定，点击解锁` : '已锁定，点击解锁'}
        placement="top"
      >
        <Button
          isIconOnly
          size={buttonSize}
          variant="flat"
          className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
          onPress={handleToggleLock}
          isDisabled={loading}
        >
          {loading ? (
            <Loader2 className={`${iconSize} animate-spin`} />
          ) : (
            <Lock className={iconSize} />
          )}
        </Button>
      </Tooltip>
    );
  }

  return (
    <Tooltip content="锁定分镜，防止误操作" placement="top">
      <Button
        isIconOnly
        size={buttonSize}
        variant="light"
        className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
        onPress={handleToggleLock}
        isDisabled={loading}
      >
        {loading ? (
          <Loader2 className={`${iconSize} animate-spin`} />
        ) : (
          <Unlock className={iconSize} />
        )}
      </Button>
    </Tooltip>
  );
};

export default StoryboardLockButton;
