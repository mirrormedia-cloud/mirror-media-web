import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, PlaySquare, Loader2 } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { useAuth } from '../../context/AuthContext';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login, googleLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [server_error, setServerError] = useState<string | null>(null);

  const triggerGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setSubmitting(true);
      setServerError(null);
      try {
        const result = await googleLogin(tokenResponse.access_token, 'access_token');
        if (result.needsProfile) {
          const p = result.needsProfile;
          const params = new URLSearchParams({
            verification_id: p.verification_id,
            ...(p.first_name ? { first_name: p.first_name } : {}),
            ...(p.last_name ? { last_name: p.last_name } : {}),
            ...(p.profile_picture ? { picture: p.profile_picture } : {}),
          });
          navigate(`/complete-profile?${params.toString()}`);
        } else if (result.ok) {
          navigate('/dashboard', { replace: true });
        } else {
          setServerError(result.error ?? 'Google sign-in failed');
        }
      } finally {
        setSubmitting(false);
      }
    },
    onError: () => setServerError('Google sign-in was cancelled or failed'),
  });

  const handleLogin = async () => {
    const newErrors: any = {};
    if (!email) newErrors.email = 'Email is required';
    if (!password) newErrors.password = 'Password is required';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setServerError(null);
    setSubmitting(true);
    try {
      const res = await login(email, password);
      if (res.ok) {
        // Land on the dashboard — the route guard there will keep them in.
        navigate('/dashboard', { replace: true });
      } else {
        setServerError(res.error ?? 'Login failed');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-emerald to-brand-blue mb-4 shadow-lg shadow-brand-emerald/20">
            <PlaySquare className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-text-main mb-2">Welcome Back</h1>
          <p className="text-text-muted">Login to manage your OTT platform</p>
        </div>

        <div className="glass-card p-8 space-y-6 text-left">
          <Input
            label="Email Address"
            placeholder="Enter email"
            icon={Mail}
            value={email}
            onChange={setEmail}
            error={errors.email}
          />
          <div className="space-y-1 text-left">
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              icon={Lock}
              value={password}
              onChange={setPassword}
              showPassword={showPassword}
              togglePassword={() => setShowPassword(!showPassword)}
              error={errors.password}
            />
            {/* <div className="flex justify-end">
              <button
                onClick={() => navigate('/forgot-password')}
                className="text-xs font-semibold text-brand-emerald hover:text-brand-blue transition-colors"
              >
                Forgot Password?
              </button>
            </div> */}
          </div>

          {server_error && (
            <p className="text-sm text-red-400 text-center -mt-2">{server_error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={submitting}
            className="btn-primary w-full py-4 text-lg flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting && <Loader2 size={18} className="animate-spin" />}
            {submitting ? 'Signing in…' : 'Login'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border-subtle"></div></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-bg-main px-2 text-text-muted transition-colors duration-300">Or continue with</span></div>
          </div>

          <button onClick={() => triggerGoogleLogin()} disabled={submitting} className="w-full flex items-center justify-center gap-3 bg-black/5 dark:bg-white/5 border border-border-subtle rounded-2xl py-3.5 font-medium transition-all hover:bg-black/10 dark:hover:bg-white/10 text-text-main disabled:opacity-60">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.29.81-.55z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google
          </button>
        </div>

        <p className="text-center mt-8 text-sm text-text-muted">
          Don't have an account? <span className="text-brand-emerald font-semibold cursor-pointer">Contact Admin</span>
        </p>
      </div>
    </AuthLayout>
  );
};

export default Login;
