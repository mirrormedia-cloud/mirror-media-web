import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AuthLayout } from '../../components/auth/AuthLayout';

const VerifyOTP: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email || 'your-email@example.com';
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputs = useRef<any>([]);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index: number, e: any) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1].focus();
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-md text-left">
        <button onClick={() => navigate('/forgot-password')} className="flex items-center gap-2 text-text-muted hover:text-text-main transition-colors mb-8 group">
          <ArrowLeft size={18} />
          Back
        </button>
        
        <h1 className="text-3xl font-bold text-text-main mb-2">Verify OTP</h1>
        <p className="text-text-muted mb-8">We sent a verification code to <span className="text-text-main font-medium">{email}</span></p>

        <div className="glass-card p-8 space-y-8">
          <div className="flex justify-between gap-2">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (inputs.current[i] = el)}
                type="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-12 h-14 bg-black/5 dark:bg-white/5 border border-border-subtle rounded-xl text-center text-xl font-bold text-text-main focus:outline-none focus:ring-2 focus:ring-brand-emerald/50 focus:border-brand-emerald transition-all"
              />
            ))}
          </div>

          <button 
            onClick={() => navigate('/reset-password')} 
            className="btn-primary w-full py-4 text-white"
            disabled={otp.some(d => !d)}
          >
            Verify OTP
          </button>

          <p className="text-center text-sm text-text-muted">
            Didn't receive code? <span className="text-brand-emerald font-semibold cursor-pointer">Resend in 0:59</span>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default VerifyOTP;
