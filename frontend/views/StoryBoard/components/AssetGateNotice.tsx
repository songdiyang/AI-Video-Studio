import React from 'react';
import { MapPin, Package, Settings2, Sparkles, Users } from 'lucide-react';
import type { ValidationIssue } from '../utils/validateFrameReadiness';

/**
 * 缺项类型 → 资产编辑页：事件与参数口径同资源面板 / Hub
 * （影棚在本地按 scene 打开，AssetEditor 内部再走 getStudio）。
 */
export const ASSET_GATE_META: Record<'character' | 'studio' | 'prop', { icon: React.ReactNode; openType: string }> = {
  character: { icon: <Users className="w-3.5 h-3.5" />, openType: 'character' },
  studio: { icon: <MapPin className="w-3.5 h-3.5" />, openType: 'scene' },
  prop: { icon: <Package className="w-3.5 h-3.5" />, openType: 'prop' },
};

/** 一键跳到缺的那个资产：复用工作台已有的 openAssetEditTab 事件，不自造跳转 */
export function openAssetGateEditor(asset: NonNullable<ValidationIssue['asset']>) {
  window.dispatchEvent(new CustomEvent('openAssetEditTab', {
    detail: {
      assetType: ASSET_GATE_META[asset.kind].openType,
      assetId: asset.id,
      assetName: asset.name,
    },
  }));
}

/**
 * 「先生成资源」清单：逐条列出这一镜还缺什么，能定位到资产的直接跳过去补。
 *
 * 为什么需要它：出图前空状态只摆一个「生成图片」，点了才被门禁拦下弹一串报错，
 * 用户根本不知道该先补哪一步。判定与点击时的预检同源（validateFrameReadiness），
 * 所以这里列出的缺项和「点了会不会被拦」永远一致。
 */
const AssetGateNotice: React.FC<{
  blockers: ValidationIssue[];
  onOpenAsset?: (asset: NonNullable<ValidationIssue['asset']>) => void;
  /** 生成按钮恢复后的提示文案，尾帧场景下说「生成图片」会对不上 */
  readyLabel?: string;
}> = ({ blockers, onOpenAsset = openAssetGateEditor, readyLabel = '生成图片' }) => (
  <div className="w-[min(420px,100%)] flex flex-col gap-1.5 text-left">
    {blockers.map((issue, i) => {
      const meta = issue.asset ? ASSET_GATE_META[issue.asset.kind] : undefined;
      const content = (
        <>
          <span className="shrink-0 text-(--text-muted)">{meta?.icon ?? <Settings2 className="w-3.5 h-3.5" />}</span>
          <span className="min-w-0 flex-1 text-xs leading-snug text-(--text-secondary)">{issue.message}</span>
          {meta && (
            <span className="shrink-0 flex items-center gap-1 text-[11px] text-(--accent)">
              <Sparkles className="w-3 h-3" />去生成
            </span>
          )}
        </>
      );
      // 给不出库 ID 的缺项（角色不在库里、没选影棚、没写提示词）只能说明，不能跳
      return meta && issue.asset ? (
        <button
          key={`${issue.type}-${issue.asset.id}-${i}`}
          onClick={() => onOpenAsset(issue.asset!)}
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-(--border-color) bg-(--bg-input) hover:border-(--accent)/60 hover:bg-(--accent)/10 transition-colors"
        >
          {content}
        </button>
      ) : (
        <div
          key={`${issue.type}-${i}`}
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-dashed border-(--border-color) bg-(--bg-input)/60"
        >
          {content}
        </div>
      );
    })}
    <p className="mt-1 text-[11px] text-(--text-muted)">补齐后这里会自动变成「{readyLabel}」。</p>
  </div>
);

export default AssetGateNotice;
