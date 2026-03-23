import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  CardBody,
  Button,
  Spinner,
  Chip,
} from '@heroui/react';
import {
  Users,
  FolderOpen,
  CheckCircle,
  XCircle,
  AlertCircle,
  LogIn,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  CollaborationInvite,
  fetchInviteDetail,
  acceptInvite,
  ROLE_LABELS,
} from '../services/collaboration';

const AcceptInvite: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<CollaborationInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 检查登录状态
  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsLoggedIn(!!token);
  }, []);

  // 加载邀请详情
  useEffect(() => {
    const loadInvite = async () => {
      if (!code) {
        setError('无效的邀请链接');
        setLoading(false);
        return;
      }

      try {
        const { invite: data } = await fetchInviteDetail(code);
        setInvite(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '邀请不存在或已失效');
      } finally {
        setLoading(false);
      }
    };

    loadInvite();
  }, [code]);

  // 接受邀请
  const handleAccept = async () => {
    if (!code) return;

    try {
      setAccepting(true);
      const result = await acceptInvite(code);
      setAccepted(true);
      showToast(`已成功加入${result.type === 'team' ? '团队' : '项目'}：${result.target_name}`, 'success');

      // 延迟跳转
      setTimeout(() => {
        if (result.type === 'team') {
          navigate(`/teams`);
        } else {
          navigate(`/projects`);
        }
      }, 2000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '加入失败', 'error');
    } finally {
      setAccepting(false);
    }
  };

  // 跳转登录
  const handleLogin = () => {
    // 保存当前邀请链接到 sessionStorage，登录后自动跳回
    sessionStorage.setItem('redirectAfterLogin', `/invite/${code}`);
    navigate('/auth?mode=login');
  };

  // 加载中状态
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)]">
        <Card className="w-full max-w-md bg-[var(--bg-card)]">
          <CardBody className="py-12 text-center">
            <Spinner size="lg" className="mb-4" />
            <p className="text-[var(--text-secondary)]">正在加载邀请信息...</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] p-4">
        <Card className="w-full max-w-md bg-[var(--bg-card)]">
          <CardBody className="py-12 text-center">
            <XCircle className="w-16 h-16 mx-auto mb-4 text-danger" />
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              邀请无效
            </h2>
            <p className="text-[var(--text-secondary)] mb-6">{error}</p>
            <Button
              color="primary"
              onPress={() => navigate('/')}
            >
              返回首页
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  // 已接受状态
  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] p-4">
        <Card className="w-full max-w-md bg-[var(--bg-card)]">
          <CardBody className="py-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-success" />
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
              加入成功！
            </h2>
            <p className="text-[var(--text-secondary)] mb-2">
              您已成功加入{invite?.type === 'team' ? '团队' : '项目'}
            </p>
            <p className="text-lg font-medium text-[var(--text-primary)]">
              {invite?.target_name}
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mt-4">
              正在跳转...
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  // 正常显示邀请详情
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base)] p-4">
      <Card className="w-full max-w-md bg-[var(--bg-card)]">
        <CardBody className="py-8 px-6">
          {/* 图标 */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              {invite?.type === 'team' ? (
                <Users className="w-10 h-10 text-primary" />
              ) : (
                <FolderOpen className="w-10 h-10 text-primary" />
              )}
            </div>
          </div>

          {/* 标题 */}
          <h1 className="text-2xl font-bold text-center text-[var(--text-primary)] mb-2">
            {invite?.type === 'team' ? '加入团队' : '加入项目'}
          </h1>

          {/* 邀请信息 */}
          <div className="text-center mb-6">
            <p className="text-[var(--text-secondary)] mb-2">
              <span className="font-medium text-[var(--text-primary)]">
                {invite?.created_by}
              </span>{' '}
              邀请您加入
            </p>
            <p className="text-xl font-semibold text-[var(--text-primary)]">
              {invite?.target_name}
            </p>
          </div>

          {/* 角色标签 */}
          <div className="flex justify-center mb-6">
            <Chip
              size="lg"
              variant="flat"
              color="primary"
            >
              角色：{ROLE_LABELS[invite?.role || 'viewer']}
            </Chip>
          </div>

          {/* 过期提示 */}
          {invite?.expires_at && (
            <div className="flex items-center justify-center gap-2 mb-6 text-sm text-[var(--text-tertiary)]">
              <AlertCircle className="w-4 h-4" />
              <span>
                邀请有效期至：{new Date(invite.expires_at).toLocaleString()}
              </span>
            </div>
          )}

          {/* 操作按钮 */}
          {isLoggedIn ? (
            <div className="space-y-3">
              <Button
                color="primary"
                size="lg"
                className="w-full"
                onPress={handleAccept}
                isLoading={accepting}
              >
                接受邀请
              </Button>
              <Button
                variant="light"
                size="lg"
                className="w-full"
                onPress={() => navigate('/')}
              >
                返回首页
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-[var(--text-secondary)] mb-2">
                登录后即可接受邀请
              </p>
              <Button
                color="primary"
                size="lg"
                className="w-full"
                startContent={<LogIn className="w-4 h-4" />}
                onPress={handleLogin}
              >
                登录 / 注册
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default AcceptInvite;
