import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { AuthLayout } from '../../components/auth/AuthLayout';

const TermsPolicy: React.FC = () => {
  const navigate = useNavigate();

  return (
    <AuthLayout>
      <div className="w-full max-w-3xl my-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-emerald to-brand-blue mb-4 shadow-lg shadow-brand-emerald/20">
            <FileText className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-text-main mb-2">Terms &amp; Conditions</h1>
          <p className="text-text-muted">Last updated: October 28, 2026</p>
        </div>

        <div className="glass-card p-8 space-y-6 text-left max-h-[70vh] overflow-y-auto text-text-main">
          <section className="space-y-2">
            <h2 className="text-xl font-semibold">1. Acceptance of Terms</h2>
            <p className="text-text-muted">
              By creating an account or using the platform, you agree to be bound by these Terms
              and Conditions. If you do not accept these terms, please do not use the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">2. Account Responsibility</h2>
            <p className="text-text-muted">
              You are responsible for maintaining the confidentiality of your login credentials
              and for all activity that occurs under your account. Notify the administrator
              immediately if you suspect unauthorized access.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">3. Acceptable Use</h2>
            <p className="text-text-muted">
              You agree not to upload or distribute content that is unlawful, infringing,
              defamatory, obscene, or that violates the rights of others. You will not attempt
              to disrupt, probe, or reverse-engineer the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">4. Content Ownership &amp; License</h2>
            <p className="text-text-muted">
              You retain ownership of the content you upload. By uploading, you grant the
              platform a limited license to store, process, and display your content solely for
              the purpose of providing the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">5. Third-Party Platforms</h2>
            <p className="text-text-muted">
              Features that publish to YouTube, Facebook, Instagram, or other third parties are
              governed by the terms of those services. You are responsible for complying with
              their policies when connecting those accounts.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">6. Service Availability</h2>
            <p className="text-text-muted">
              We strive for high availability, but the service is provided on an "as is" basis
              without warranties of any kind. Scheduled maintenance or unforeseen issues may
              temporarily affect access.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">7. Limitation of Liability</h2>
            <p className="text-text-muted">
              To the maximum extent permitted by law, the platform and its operators are not
              liable for indirect, incidental, or consequential damages arising from your use of
              the service.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">8. Termination</h2>
            <p className="text-text-muted">
              We may suspend or terminate accounts that violate these terms. You may stop using
              the service at any time and request deletion of your account.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">9. Changes to Terms</h2>
            <p className="text-text-muted">
              These terms may be updated periodically. Continued use of the service after an
              update constitutes acceptance of the revised terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">10. Governing Law</h2>
            <p className="text-text-muted">
              These terms are governed by the laws of the jurisdiction in which the platform
              operator is established, without regard to conflict-of-laws principles.
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

export default TermsPolicy;
