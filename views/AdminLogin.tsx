import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Input, Button } from '@heroui/react';
import { KeyRound, Lock, User, Shield } from 'lucide-react';
import { loginWithAdminAccess, logout } from '../services/auth';
import { useToast } from '../contexts/ToastContext';

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminAccessKey, setAdminAccessKey] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const user = await loginWithAdminAccess(email, password, adminAccessKey);

      if (user.role !== 'admin') {
        logout();
        showToast('权限不足，仅管理员可访问', 'error');
        setLoading(false);
        return;
      }

      navigate('/admin/dashboard');
    } catch (err: any) {
      showToast('登录失败，请检查网络或重试', 'error');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-40"></div>
      
      <Card className="w-full max-w-md bg-[var(--bg-elevated)] backdrop-blur-xl shadow-2xl border border-[var(--border-color)] relative z-10">
        <CardBody className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/50 mb-4">
              <Shield className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">管理员后台</h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">饺子动漫 Admin Panel</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <Input
                type="text"
                label="管理员账号"
                placeholder="请输入管理员账号"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                startContent={<User className="w-4 h-4 text-[var(--text-muted)]" />}
                classNames={{
                  input: "text-[var(--text-primary)]",
                  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 focus-within:border-[var(--accent)]"
                }}
                required
              />
            </div>

            <div>
              <Input
                type="password"
                label="后台访问密钥"
                placeholder="请输入后台访问密钥"
                value={adminAccessKey}
                onChange={(e) => setAdminAccessKey(e.target.value)}
                startContent={<KeyRound className="w-4 h-4 text-[var(--text-muted)]" />}
                classNames={{
                  input: "text-[var(--text-primary)]",
                  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 focus-within:border-[var(--accent)]"
                }}
                required
              />
            </div>

            <div>
              <Input
                type="password"
                label="密码"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                startContent={<Lock className="w-4 h-4 text-[var(--text-muted)]" />}
                classNames={{
                  input: "text-[var(--text-primary)]",
                  inputWrapper: "bg-[var(--bg-input)] border border-[var(--border-color)] hover:border-[var(--accent)]/50 focus-within:border-[var(--accent)]"
                }}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full pro-btn-primary py-6 text-base"
              isLoading={loading}
            >
              {loading ? '登录中...' : '登录'}
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-[var(--text-muted)]">
            <p>仅限授权管理员访问</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default AdminLogin;
