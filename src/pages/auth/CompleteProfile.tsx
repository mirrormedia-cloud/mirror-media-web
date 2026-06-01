import React, { useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, ChevronRight, Loader2 } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { api_client, normalize_envelope } from '../../lib/api_client';
import { useAuth } from '../../context/AuthContext';
import type { AuthUser } from '../../context/AuthContext';

const CompleteProfile: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();

  // SSO flow: verification_id comes from /login → Google callback
  const verification_id = searchParams.get('verification_id');
  const isSso = !!verification_id;

  const [firstName, setFirstName] = useState(searchParams.get('first_name') ?? '');
  const [lastName, setLastName] = useState(searchParams.get('last_name') ?? '');
  const [avatar, setAvatar] = useState<string | null>(searchParams.get('picture'));
  const [errors, setErrors] = useState<any>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAvatar(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleComplete = async () => {
    const newErrors: any = {};
    if (!firstName || firstName.length < 1) newErrors.firstName = 'First name is required';
    if (!lastName || lastName.length < 1) newErrors.lastName = 'Last name is required';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setServerError(null);
    setSubmitting(true);
    try {
      if (isSso) {
        const res = await api_client.post('/api/auth/sso/register', {
          verification_id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          ...(avatar && !avatar.startsWith('data:') ? { profile_picture: avatar } : {}),
        });
        const env = normalize_envelope<{ user: AuthUser; token: string }>(res.data);
        if (!env.success || !env.data?.token) {
          setServerError(env.message || 'Registration failed');
          return;
        }
        await loginWithToken(env.data.token, env.data.user);
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setServerError(err?.envelope?.error?.message ?? err?.message ?? 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-xl text-center">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-main mb-2">Complete Your Profile</h1>
          <p className="text-text-muted">Personalize your admin identity</p>
        </div>

        <div className="glass-card p-10 text-left">
          <div className="flex flex-col md:flex-row gap-10 items-start">
            <div className="flex flex-col items-center gap-4 mx-auto md:mx-0">
              <div
                className={`relative w-32 h-32 rounded-3xl overflow-hidden bg-black/5 dark:bg-white/5 border-2 border-dashed transition-all cursor-pointer ${
                  errors.avatar ? 'border-red-500/50' : avatar ? 'border-brand-emerald' : 'border-border-subtle hover:border-brand-emerald/50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                {avatar ? (
                  <img src={avatar} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-text-muted text-center p-4">
                    <Upload size={24} className="mb-2" />
                    <span className="text-[10px] uppercase tracking-wider font-bold">Upload Photo</span>
                  </div>
                )}
                {avatar && (
                  <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs font-bold text-white uppercase">Change</span>
                  </div>
                )}
              </div>
              <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*" />
              {errors.avatar && <p className="text-xs text-red-400">{errors.avatar}</p>}
            </div>

            <div className="flex-1 w-full space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <Input
                  label="First Name"
                  placeholder="John"
                  value={firstName}
                  onChange={setFirstName}
                  error={errors.firstName}
                />
                <Input
                  label="Last Name"
                  placeholder="Doe"
                  value={lastName}
                  onChange={setLastName}
                  error={errors.lastName}
                />
              </div>

              {serverError && (
                <p className="text-sm text-red-400 text-center">{serverError}</p>
              )}

              <div className="pt-4">
                <button
                  onClick={handleComplete}
                  disabled={submitting}
                  className="btn-primary w-full py-4 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {submitting && <Loader2 size={18} className="animate-spin" />}
                  Continue to Dashboard
                  {!submitting && <ChevronRight size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
};

export default CompleteProfile;
