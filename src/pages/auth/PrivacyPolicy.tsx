import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { AuthLayout } from '../../components/auth/AuthLayout';

const PrivacyPolicy: React.FC = () => {
  const navigate = useNavigate();

  return (
    <AuthLayout>
      <div className="w-full max-w-3xl my-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-emerald to-brand-blue mb-4 shadow-lg shadow-brand-emerald/20">
            <ShieldCheck className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-text-main mb-2">Privacy Policy</h1>
          <p className="text-text-muted">Last updated: October 28, 2026</p>
        </div>

        <div className="glass-card p-8 space-y-6 text-left max-h-[70vh] overflow-y-auto text-text-main">
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">1. Information We Collect</h2>
            <p className="text-text-muted">
              We collect information you provide directly when you create an account, such as your
              name, email address, profile picture, and any content you upload to the platform.
              We also collect limited technical information (device type, browser, IP address) to
              operate and secure the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
            <p className="text-text-muted">
              Your information is used to authenticate you, provide and improve platform features,
              deliver content you request, communicate service updates, and comply with legal
              obligations. We do not sell your personal data to third parties.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">3. Third-Party Services</h2>
            <p className="text-text-muted">
              The platform integrates with services such as Google (for sign-in), YouTube,
              Facebook, and Instagram when you choose to connect those accounts. Those providers
              handle data under their own privacy policies, and we only access the scopes you
              authorize.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">4. Data Storage &amp; Security</h2>
            <p className="text-text-muted">
              Media files and metadata are stored on managed cloud infrastructure with
              industry-standard access controls, encryption in transit, and regular backups.
              No system is perfectly secure, but we work to protect your data against
              unauthorized access.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">5. Cookies</h2>
            <p className="text-text-muted">
              We use essential cookies and local storage to keep you signed in and remember
              preferences such as your theme. We do not use advertising trackers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">6. Your Rights</h2>
            <p className="text-text-muted">
              You may update your profile, disconnect linked accounts, or request deletion of
              your account at any time by contacting the administrator. On request, we will
              remove your personal data unless retention is required by law.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">7. Children's Privacy</h2>
            <p className="text-text-muted">
              The platform is not directed to children under 13, and we do not knowingly collect
              personal information from them.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">8. Changes to This Policy</h2>
            <p className="text-text-muted">
              We may update this policy from time to time. Material changes will be announced in
              the dashboard, and continued use after an update constitutes acceptance of the
              revised policy.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">9. Contact</h2>
            <p className="text-text-muted">
              Questions about this policy can be sent to the platform administrator.
            </p>
          </section>
        </div>

        <div className="mt-6 flex justify-center">
          <button
            onClick={() => navigate(-1)}
            className="btn-primary px-6 py-3 flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back
          </button>
        </div>
      </div>
    </AuthLayout>
  );
};

export default PrivacyPolicy;
