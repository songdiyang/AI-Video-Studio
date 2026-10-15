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

      if (user.role !== 'admin' && user.role !== 'ops') {
        logout();
        showToast('权限不足，仅管理员或运维可访问', 'error');
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
    <div className="min-h-screen bg-white flex items-center justify-center p-4 relative overflow-hidden">
      {/* 动态斜纹背景 - 白底上蔓延的粉蓝色彩 */}
      <style>{`
        @keyframes drift1 { 0%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-40px) scale(1.1)} 66%{transform:translate(-30px,20px) scale(0.95)} 100%{transform:translate(0,0) scale(1)} }
        @keyframes drift2 { 0%{transform:translate(0,0) scale(1)} 33%{transform:translate(-50px,30px) scale(1.12)} 66%{transform:translate(40px,-25px) scale(0.92)} 100%{transform:translate(0,0) scale(1)} }
        @keyframes drift3 { 0%{transform:translate(0,0) scale(1)} 33%{transform:translate(35px,50px) scale(0.9)} 66%{transform:translate(-45px,-15px) scale(1.08)} 100%{transform:translate(0,0) scale(1)} }
        @keyframes drift4 { 0%{transform:translate(0,0) rotate(0deg)} 33%{transform:translate(-40px,-30px) rotate(5deg)} 66%{transform:translate(25px,35px) rotate(-3deg)} 100%{transform:translate(0,0) rotate(0deg)} }
        @keyframes drift5 { 0%{transform:translate(0,0) scale(1)} 33%{transform:translate(45px,20px) scale(1.15)} 66%{transform:translate(-20px,-40px) scale(0.88)} 100%{transform:translate(0,0) scale(1)} }
        @keyframes flow { 0%{transform:translate(0,0) scale(1);opacity:0.06} 25%{transform:translate(80px,-30px) scale(1.2);opacity:0.1} 50%{transform:translate(40px,50px) scale(0.85);opacity:0.04} 75%{transform:translate(-60px,20px) scale(1.1);opacity:0.09} 100%{transform:translate(0,0) scale(1);opacity:0.06} }
        @keyframes shimmer { 0%,100%{opacity:0.15} 50%{opacity:0.35} }
      `}</style>
      {/* 粉色斑块 */}
      <div className="absolute -top-20 -left-20 w-[500px] h-[500px] rounded-full" style={{background:'radial-gradient(circle, #f9a8d4 0%, transparent 70%)',animation:'drift1 18s ease-in-out infinite',opacity:0.15}} />
      <div className="absolute top-1/3 -right-32 w-[400px] h-[400px] rounded-full" style={{background:'radial-gradient(circle, #f472b6 0%, transparent 70%)',animation:'drift2 22s ease-in-out infinite',opacity:0.12}} />
      <div className="absolute bottom-10 left-1/4 w-[250px] h-[250px] rounded-full" style={{background:'radial-gradient(circle, #fda4af 0%, transparent 70%)',animation:'shimmer 6s ease-in-out infinite'}} />
      {/* 蓝色斑块 */}
      <div className="absolute -bottom-20 -right-20 w-[500px] h-[500px] rounded-full" style={{background:'radial-gradient(circle, #93c5fd 0%, transparent 70%)',animation:'drift3 20s ease-in-out infinite',opacity:0.15}} />
      <div className="absolute top-10 right-1/3 w-[350px] h-[350px] rounded-full" style={{background:'radial-gradient(circle, #60a5fa 0%, transparent 70%)',animation:'drift4 24s ease-in-out infinite',opacity:0.12}} />
      <div className="absolute top-2/3 left-10 w-[200px] h-[200px] rounded-full" style={{background:'radial-gradient(circle, #7dd3fc 0%, transparent 70%)',animation:'drift5 16s ease-in-out infinite',opacity:0.1}} />
      {/* 紫色流动点缀 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full" style={{background:'radial-gradient(circle, #c084fc 0%, transparent 60%)',animation:'flow 25s ease-in-out infinite'}} />
      {/* 额外流动光斑 */}
      <div className="absolute top-[20%] left-[15%] w-[300px] h-[300px] rounded-full" style={{background:'radial-gradient(circle, #fbcfe8 0%, transparent 70%)',animation:'flow 20s ease-in-out infinite reverse'}} />
      <div className="absolute bottom-[25%] right-[20%] w-[280px] h-[280px] rounded-full" style={{background:'radial-gradient(circle, #bfdbfe 0%, transparent 70%)',animation:'flow 22s ease-in-out infinite 3s'}} />
      
      <Card className="w-full max-w-md bg-[var(--bg-elevated)] backdrop-blur-xl shadow-2xl border border-[var(--border-color)] relative z-10">
        <CardBody className="p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-400/50 mb-4">
              <Shield className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">管理员后台</h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">AI视频编辑器 Admin Panel</p>
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
