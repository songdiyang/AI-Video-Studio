import React, { useCallback, useEffect, useState } from 'react';
import { Camera, RotateCcw, Trash2, Loader2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import {
  listProjectSnapshots,
  createManualSnapshot,
  restoreProjectSnapshot,
  deleteProjectSnapshot,
  SNAPSHOT_KEEP,
  type ProjectSnapshot,
} from '../../services/projectSnapshots';
import { toErrorMessage } from '../../utils/errorMessage';

/**
 * 工程快照与恢复（设置 › 工程设置）
 * 智能体执行删除类不可逆动作前会自动备份；这里提供手动备份 / 还原 / 删除入口。
 * 恢复 = 工程数据整体回到快照时刻（恢复前会再自动备份当前态），完成后重载应用。
 */
const ProjectSnapshots: React.FC<{ projectId: number | null }> = ({ projectId }) => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const s = t.settings.snapshots;

  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      setSnapshots(await listProjectSnapshots(projectId));
    } catch (e) {
      showToast(`${s.loadFailed}：${toErrorMessage(e) || e}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [projectId, showToast, s.loadFailed]);

  useEffect(() => { void refresh(); }, [refresh]);

  const triggerLabel = (trigger: string) =>
    trigger === 'agent' ? s.triggerAgent : trigger === 'restore' ? s.triggerRestore : s.triggerManual;

  const handleBackup = async () => {
    if (!projectId || busy) return;
    setBusy(true);
    try {
      await createManualSnapshot(projectId);
      showToast(s.backupDoneToast, 'success');
      await refresh();
    } catch (e) {
      showToast(toErrorMessage(e) || s.backupFailedToast, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (snap: ProjectSnapshot) => {
    if (!projectId || busy) return;
    const time = new Date(snap.created_at).toLocaleString();
    const accepted = await confirm({
      type: 'danger',
      title: s.restoreConfirmTitle,
      message: s.restoreConfirmMessage.replace('{time}', time),
      confirmText: s.restoreConfirmText,
    });
    if (!accepted) return;
    setBusy(true);
    try {
      await restoreProjectSnapshot(projectId, snap.id);
      showToast(s.restoredToast, 'success');
      // 数据已整体替换：重载窗口让所有视图从恢复后的文档重建
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      showToast(toErrorMessage(e) || s.restoreFailedToast, 'error');
      setBusy(false);
    }
  };

  const handleDelete = async (snap: ProjectSnapshot) => {
    if (!projectId || busy) return;
    const accepted = await confirm({
      type: 'danger',
      title: s.deleteConfirmTitle,
      message: s.deleteConfirmMessage,
      confirmText: s.deleteConfirmText,
    });
    if (!accepted) return;
    setBusy(true);
    try {
      await deleteProjectSnapshot(projectId, snap.id);
      showToast(s.deletedToast, 'success');
      await refresh();
    } catch (e) {
      showToast(toErrorMessage(e) || s.deleteFailedToast, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Camera className="w-4 h-4" />
            {s.title}
          </h3>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {s.hint.replace('{keep}', String(SNAPSHOT_KEEP))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleBackup()}
          disabled={busy || !projectId}
          className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          {s.backupNow}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {loading && snapshots.length === 0 ? (
          <p className="text-xs px-1 py-2 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {s.loading}
          </p>
        ) : snapshots.length === 0 ? (
          <p className="text-xs px-1 py-2" style={{ color: 'var(--text-muted)' }}>{s.empty}</p>
        ) : (
          snapshots.map((snap) => (
            <div
              key={snap.id}
              className="flex items-center gap-3 rounded-lg border px-3 py-2"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-input)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {snap.label}
                </div>
                <div className="text-[10px] mt-0.5 flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                  <span>{new Date(snap.created_at).toLocaleString()}</span>
                  <span
                    className="px-1.5 py-0.5 rounded border"
                    style={{ borderColor: 'var(--border-color)' }}
                  >
                    {triggerLabel(snap.trigger)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleRestore(snap)}
                disabled={busy}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                title={s.restore}
              >
                <RotateCcw className="w-3 h-3" />
                {s.restore}
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(snap)}
                disabled={busy}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                title={s.delete}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProjectSnapshots;