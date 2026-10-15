/**
 * 团队 - 左侧边栏紧凑面板
 * ──────────────────────────────────────────────────────────────
 * 在 Layout 左侧边栏内直接展示我的团队列表，点击团队进入团队详情页，
 * 完整团队管理仍保留在 /teams 页面（底部入口跳转）。
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, RefreshCw, Loader2, Settings2, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Team, fetchTeams } from '../../services/collaboration';

interface TeamsSidePanelProps {
  /** 进入团队详情后回调（用于关闭侧边栏面板） */
  onOpenTeam?: () => void;
}

const TeamsSidePanel: React.FC<TeamsSidePanelProps> = ({ onOpenTeam }) => {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  const loadTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { teams: data } = await fetchTeams();
      setTeams(data || []);
    } catch (err: any) {
      setError(err?.message || '加载团队失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return teams;
    return teams.filter(tm =>
      tm.name?.toLowerCase().includes(kw) || tm.description?.toLowerCase().includes(kw)
    );
  }, [teams, keyword]);

  const handleOpen = (team: Team) => {
    onOpenTeam?.();
    navigate(`/teams/${team.id}`);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 搜索 + 刷新 */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 shrink-0">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索团队..."
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded-md bg-[var(--bg-input)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={loadTeams}
          disabled={loading}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors disabled:opacity-50"
          title="刷新列表"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* 团队列表 */}
      <div className="flex-1 overflow-y-auto px-1 pb-1 min-h-0">
        {loading && teams.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--text-muted)]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            加载中...
          </div>
        ) : error ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-red-400">{error}</p>
            <button onClick={loadTeams} className="mt-2 text-xs text-[var(--accent)] hover:underline">
              重试
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--text-muted)]">
            <UsersRound className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">{keyword ? '无匹配团队' : '暂无团队'}</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((team) => (
              <li key={team.id}>
                <button
                  onClick={() => handleOpen(team)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors"
                  title={team.description || team.name}
                >
                  {team.avatar_url ? (
                    <img src={team.avatar_url} alt="" className="w-5 h-5 rounded-md object-cover shrink-0" />
                  ) : (
                    <span className="w-5 h-5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center shrink-0">
                      <Users className="w-3 h-3" />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-xs font-medium">{team.name}</span>
                    {team.description && (
                      <span className="block truncate text-[10px] text-[var(--text-muted)]">{team.description}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 底部：跳转到完整管理页 */}
      <div className="shrink-0 border-t border-[var(--border-color)] px-2 py-1.5">
        <button
          onClick={() => {
            // 优先在编辑区以标签页打开（与“设置”一致）；宿主未就绪（无项目）时回退整页 /teams
            if ((window as any).__teamsTabHostReady) {
              navigate('/');
              setTimeout(() => window.dispatchEvent(new CustomEvent('openTeamsTab')), 100);
            } else {
              navigate('/teams');
            }
          }}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-white/5 transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
          管理团队
        </button>
      </div>
    </div>
  );
};

export default TeamsSidePanel;
