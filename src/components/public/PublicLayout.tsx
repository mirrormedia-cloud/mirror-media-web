import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { PlaySquare, Sun, Moon, Menu, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { SITE_NAME, CONTACT_EMAIL } from '../../lib/site';

const NAV = [
  { to: '/#features', label: 'Features' },
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/#platforms', label: 'Platforms' },
  { to: '/#faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

/** Shell for every public (unauthenticated) page: header, nav, footer with legal links. */
export const PublicLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [open, set_open] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-bg-main text-text-main transition-colors duration-300">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-bg-aside/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-emerald to-brand-blue">
              <PlaySquare className="text-white" size={20} />
            </span>
            {SITE_NAME}
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm text-text-muted">
            {NAV.map((n) => (
              <a key={n.to} href={n.to} className="hover:text-brand-emerald transition-colors">
                {n.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="p-2 rounded-xl text-text-muted hover:text-brand-emerald transition-colors"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link
              to={user ? '/dashboard' : '/login'}
              className="hidden sm:inline-flex btn-primary px-4 py-2 text-sm"
            >
              {user ? 'Dashboard' : 'Sign in'}
            </Link>
            <button
              className="md:hidden p-2 rounded-xl text-text-muted"
              aria-label="Menu"
              onClick={() => set_open((v) => !v)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {open && (
          <nav className="md:hidden border-t border-border-subtle px-4 py-3 flex flex-col gap-3 text-sm">
            {NAV.map((n) => (
              <a key={n.to} href={n.to} onClick={() => set_open(false)} className="text-text-muted">
                {n.label}
              </a>
            ))}
            <Link to={user ? '/dashboard' : '/login'} className="text-brand-emerald font-semibold">
              {user ? 'Dashboard' : 'Sign in'}
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border-subtle mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-3 text-sm">
          <div className="space-y-2">
            <p className="font-bold text-base">{SITE_NAME}</p>
            <p className="text-text-muted">
              Organise your video library, generate platform-ready metadata, and schedule
              uploads to YouTube, Instagram, Facebook and TikTok from one dashboard.
            </p>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">Product</p>
            <ul className="space-y-1 text-text-muted">
              <li><a href="/#features" className="hover:text-brand-emerald">Features</a></li>
              <li><a href="/#platforms" className="hover:text-brand-emerald">Supported platforms</a></li>
              <li><a href="/#faq" className="hover:text-brand-emerald">FAQ</a></li>
              <li><Link to="/login" className="hover:text-brand-emerald">Sign in</Link></li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-semibold">Company &amp; legal</p>
            <ul className="space-y-1 text-text-muted">
              <li><NavLink to="/privacy-policy" className="hover:text-brand-emerald">Privacy Policy</NavLink></li>
              <li><NavLink to="/terms-policy" className="hover:text-brand-emerald">Terms of Service</NavLink></li>
              <li><NavLink to="/contact" className="hover:text-brand-emerald">Contact</NavLink></li>
              <li><a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-brand-emerald">{CONTACT_EMAIL}</a></li>
            </ul>
          </div>
        </div>
        <p className="text-center text-xs text-text-muted pb-8">
          © {new Date().getFullYear()} {SITE_NAME}. All rights reserved. TikTok, YouTube,
          Instagram and Facebook are trademarks of their respective owners.
        </p>
      </footer>
    </div>
  );
};
