import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from '../../components/auth/AuthLayout';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!email) return setError('Email is required');
    navigate('/verify-otp', { state: { email } });
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-md text-left">
        <button onClick={() => navigate('/login')} className="flex items-center gap-2 text-text-muted hover:text-text-main transition-colors mb-8 group">
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          Back to Login
        </button>

        <h1 className="text-3xl font-bold text-text-main mb-2">Forgot Password?</h1>
        <p className="text-text-muted mb-8 text-left">Enter your email and we'll send you a verification code.</p>

        <div className="glass-card p-8 space-y-6">
          <Input
            label="Email Address"
            placeholder="Enter email"
            icon={Mail}
            value={email}
            onChange={setEmail}
            error={error}
          />
          <button onClick={handleSubmit} className="btn-primary w-full py-4">
            Send OTP
          </button>
        </div>
      </div>
    </AuthLayout>
  );
};

export default ForgotPassword;
