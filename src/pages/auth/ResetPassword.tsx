import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from '../../components/auth/AuthLayout';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [show, setShow] = useState(false);

  return (
    <AuthLayout>
      <div className="w-full max-w-md text-left">
        <h1 className="text-3xl font-bold text-text-main mb-2">Create New Password</h1>
        <p className="text-text-muted mb-8">Your new password must be different from previous ones.</p>

        <div className="glass-card p-8 space-y-6">
          <Input 
            label="New Password" 
            type="password" 
            placeholder="••••••••" 
            icon={Lock} 
            value={p1}
            onChange={setP1}
            showPassword={show}
            togglePassword={() => setShow(!show)}
          />
          <Input 
            label="Confirm Password" 
            type="password" 
            placeholder="••••••••" 
            icon={Lock} 
            value={p2}
            onChange={setP2}
            showPassword={show}
            togglePassword={() => setShow(!show)}
          />
          <button onClick={() => navigate('/login')} className="btn-primary w-full py-4 text-lg">
            Reset Password
          </button>
        </div>
      </div>
    </AuthLayout>
  );
};

export default ResetPassword;
