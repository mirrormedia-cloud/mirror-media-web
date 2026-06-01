import React from 'react';
import { Eye, EyeOff, LucideIcon } from 'lucide-react';

interface InputProps {
  label?: string;
  type?: string;
  placeholder?: string;
  icon?: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  togglePassword?: () => void;
  showPassword?: boolean;
}

export const Input: React.FC<InputProps> = ({ 
  label, 
  type = 'text', 
  placeholder, 
  icon: Icon, 
  value, 
  onChange, 
  error, 
  togglePassword, 
  showPassword 
}) => (
  <div className="space-y-2 w-full">
    {label && <label className="text-sm font-medium text-text-muted ml-1 block">{label}</label>}
    <div className="relative group">
      {Icon && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-brand-emerald transition-colors">
          <Icon size={18} />
        </div>
      )}
      <input
        type={type === 'password' && showPassword ? 'text' : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input-field ${Icon ? 'pl-11' : 'px-4'} ${error ? 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500' : ''}`}
        placeholder={placeholder}
      />
      {type === 'password' && (
        <button
          type="button"
          onClick={togglePassword}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main transition-colors"
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      )}
    </div>
    {error && <p className="text-xs text-red-400 ml-1 mt-1">{error}</p>}
  </div>
);
