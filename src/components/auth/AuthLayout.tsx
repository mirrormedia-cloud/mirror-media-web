import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '../../context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen relative overflow-x-hidden flex items-center justify-center p-6 bg-bg-main transition-colors duration-300">
      <div className="auth-bg" />
      
      <div className="absolute top-8 right-8">
        <button 
          onClick={toggleTheme}
          className="p-3 rounded-2xl glass-card text-text-muted hover:text-brand-emerald transition-all"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={window.location.pathname}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="w-full h-full flex items-center justify-center"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
