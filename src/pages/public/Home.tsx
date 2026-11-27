import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Library, Sparkles, CalendarClock, BarChart3, ShieldCheck, UploadCloud,
  Link2, Wand2, Send, CheckCircle2,
} from 'lucide-react';
import { PublicLayout } from '../../components/public/PublicLayout';
import { SITE_NAME, CONTACT_EMAIL } from '../../lib/site';

const FEATURES = [
  { icon: Library, title: 'Cloud media library', body: 'Upload or import videos and thumbnails into secure cloud storage, organised by show and story, and access them from any device.' },
  { icon: Sparkles, title: 'AI metadata', body: 'Generate titles, descriptions, tags and hashtags for each platform from the video itself. You review and edit before anything is posted.' },
  { icon: CalendarClock, title: 'Scheduling & calendar', body: 'Plan uploads on a calendar, batch-schedule a series, and let the scheduler publish at the time you choose.' },
  { icon: UploadCloud, title: 'Multi-platform publishing', body: 'Publish the same video to YouTube, Instagram Reels, Facebook and TikTok, each with metadata suited to that platform.' },
  { icon: BarChart3, title: 'Analytics', body: 'Track upload status and performance across all connected accounts in one dashboard.' },
  { icon: ShieldCheck, title: 'Secure by design', body: 'OAuth sign-in for every platform. We never see your social media passwords, and you can disconnect at any time.' },
];

const STEPS = [
  { icon: Link2, title: 'Connect your accounts', body: 'Sign in and authorise the YouTube, Facebook, Instagram or TikTok accounts you manage using each platform\'s official OAuth login.' },
  { icon: Wand2, title: 'Prepare your video', body: 'Choose a video from your library. Edit the AI-generated caption and hashtags, then set privacy and interaction options.' },
  { icon: Send, title: 'Publish or schedule', body: 'Post right away or pick a time. You can follow every upload\'s status from the dashboard.' },
];

const FAQ = [
  { q: `Who is ${SITE_NAME} for?`, a: 'Media teams, OTT content owners and creators who publish short-form and long-form video to several social platforms and want one place to manage it.' },
  { q: 'How does the TikTok integration work?', a: 'You connect your TikTok account through TikTok Login Kit. With your permission we read your basic profile (display name and avatar) to show which account is connected, and use the Content Posting API to upload and publish the videos you choose, with the caption and privacy settings you choose. We never post without an explicit action or schedule from you.' },
  { q: 'Can I disconnect an account?', a: 'Yes. Open Social Accounts in the dashboard and click Disconnect. Stored access tokens are deleted right away. You can also revoke access from your TikTok, Google or Meta account settings.' },
  { q: 'Do you sell my data?', a: 'No. We do not sell personal data or use it for advertising. See our Privacy Policy for details.' },
  { q: 'How do I get an account?', a: `Accounts are currently provided to onboarded media partners. Email ${CONTACT_EMAIL} to request access or a demo.` },
];

const PLATFORMS = ['YouTube', 'Instagram', 'Facebook', 'TikTok'];

const Home: React.FC = () => {
  const { hash } = useLocation();

  // SPA renders after the browser's native hash scroll — redo it.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [hash]);

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-16 text-center">
        {/* Google OAuth brand verification: the H1 must be the exact OAuth
            app name. Keep in sync with the static fallback in index.html. */}
        <h1 className="text-5xl sm:text-6xl font-bold leading-tight">{SITE_NAME}</h1>
        <p className="mt-3 text-xl sm:text-2xl font-semibold text-brand-emerald">
          Media Management and Cloud Platform
        </p>
        <p className="mt-6 text-lg text-text-muted max-w-2xl mx-auto">
          {SITE_NAME} is a cloud-based platform designed to manage, organize, store and access
          digital media content. Keep your video library in the cloud, generate platform-ready
          metadata with AI, and publish or schedule to YouTube, Instagram, Facebook and TikTok,
          with analytics in one dashboard.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="/#features" className="btn-primary px-6 py-3">Explore features</a>
          <Link to="/contact" className="px-6 py-3 rounded-2xl border border-border-subtle hover:border-brand-emerald transition-colors">
            Request a demo
          </Link>
        </div>
        <nav aria-label="Legal" className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          <Link to="/privacy-policy" className="text-brand-emerald font-semibold hover:underline">Privacy Policy</Link>
          <Link to="/terms-policy" className="text-brand-emerald font-semibold hover:underline">Terms of Service</Link>
          <Link to="/contact" className="text-brand-emerald font-semibold hover:underline">Contact Us</Link>
        </nav>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 scroll-mt-20">
        <h2 className="text-3xl font-bold text-center">Features</h2>
        <p className="text-text-muted text-center mt-3 max-w-2xl mx-auto">
          Everything you need to go from raw episode to published post.
        </p>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass-card p-6 space-y-3">
              <Icon className="text-brand-emerald" size={26} />
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-text-muted text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 scroll-mt-20">
        <h2 className="text-3xl font-bold text-center">How it works</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="glass-card p-6 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-emerald to-brand-blue text-white text-sm font-bold flex items-center justify-center">{i + 1}</span>
                <Icon className="text-brand-emerald" size={22} />
              </div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-text-muted text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Platforms */}
      <section id="platforms" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 scroll-mt-20">
        <h2 className="text-3xl font-bold text-center">Supported platforms</h2>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {PLATFORMS.map((p) => (
            <span key={p} className="glass-card px-5 py-2 font-semibold">{p}</span>
          ))}
        </div>
        <div className="glass-card p-6 sm:p-8 mt-10 max-w-3xl mx-auto space-y-4">
          <h3 className="text-xl font-semibold">YouTube integration</h3>
          <p className="text-text-muted text-sm leading-relaxed">
            {SITE_NAME} uses YouTube API Services. When you connect a channel with Google sign-in, we request:
          </p>
          <ul className="space-y-2 text-sm">
            {[
              ['youtube.upload', 'uploads the videos you select to your channel, with the title, description and privacy setting you choose.'],
              ['youtube.force-ssl', 'shows your connected channel name and your videos\' view, like and comment counts in Analytics, and removes a video uploaded through Mirror Media Cloud if YouTube rejects it for copyright.'],
            ].map(([scope, why]) => (
              <li key={scope} className="flex gap-2">
                <CheckCircle2 size={16} className="text-brand-emerald shrink-0 mt-0.5" />
                <span><code className="font-mono text-brand-emerald">{scope}</code> {why}</span>
              </li>
            ))}
          </ul>
          <p className="text-text-muted text-sm">
            Our use of data from Google APIs follows the Google API Services User Data Policy, including the
            Limited Use requirements. See our <Link to="/privacy-policy" className="text-brand-emerald font-semibold">Privacy Policy</Link>.
          </p>
        </div>
        <div className="glass-card p-6 sm:p-8 mt-6 max-w-3xl mx-auto space-y-4">
          <h3 className="text-xl font-semibold">TikTok integration</h3>
          <p className="text-text-muted text-sm leading-relaxed">
            {SITE_NAME} uses TikTok Login Kit and the Content Posting API. We request only these permissions:
          </p>
          <ul className="space-y-2 text-sm">
            {[
              ['user.info.basic', 'shows your connected TikTok display name and avatar in the dashboard.'],
              ['video.upload', 'sends a video you select to your TikTok account so you can finish posting it there.'],
              ['video.publish', 'publishes a video you select directly to your profile, with the caption and privacy level you choose.'],
            ].map(([scope, why]) => (
              <li key={scope} className="flex gap-2">
                <CheckCircle2 size={16} className="text-brand-emerald shrink-0 mt-0.5" />
                <span><code className="font-mono text-brand-emerald">{scope}</code> {why}</span>
              </li>
            ))}
          </ul>
          <p className="text-text-muted text-sm">
            You can disconnect TikTok at any time. Read our{' '}
            <Link to="/privacy-policy" className="text-brand-emerald font-semibold">Privacy Policy</Link> and{' '}
            <Link to="/terms-policy" className="text-brand-emerald font-semibold">Terms of Service</Link>.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 scroll-mt-20">
        <h2 className="text-3xl font-bold text-center">Frequently asked questions</h2>
        <div className="mt-8 space-y-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="glass-card p-5 group">
              <summary className="font-semibold cursor-pointer list-none flex justify-between gap-4">
                {q}<span className="text-brand-emerald group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="text-text-muted text-sm mt-3 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="glass-card p-8 sm:p-10 text-center space-y-4">
          <h2 className="text-2xl font-bold">Ready to streamline your video publishing?</h2>
          <p className="text-text-muted">Get in touch to set up an account for your team.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/contact" className="btn-primary px-6 py-3">Contact us</Link>
            <Link to="/login" className="px-6 py-3 rounded-2xl border border-border-subtle hover:border-brand-emerald transition-colors">Sign in</Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
};

export default Home;
