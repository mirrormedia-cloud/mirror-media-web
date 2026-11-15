import React from 'react';
import { PublicLayout } from '../../components/public/PublicLayout';
import { SITE_NAME, CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '../../lib/site';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2">
    <h2 className="text-xl font-semibold">{title}</h2>
    <div className="text-text-muted space-y-2 leading-relaxed">{children}</div>
  </section>
);

const TermsPolicy: React.FC = () => (
  <PublicLayout>
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-8">
      <header className="text-center">
        <h1 className="text-4xl font-bold">Terms of Service</h1>
        <p className="text-text-muted mt-2">Last updated: {LEGAL_LAST_UPDATED}</p>
      </header>

      <Section title="1. Acceptance of terms">
        <p>By accessing or using {SITE_NAME} (the "Service"), you agree to these Terms of Service. If you do not agree, do not use the Service.</p>
      </Section>

      <Section title="2. The Service">
        <p>{SITE_NAME} is a web platform for managing video libraries, generating metadata, and scheduling and publishing videos to third-party platforms, including YouTube, Facebook, Instagram and TikTok, through their official APIs.</p>
      </Section>

      <Section title="3. Accounts">
        <p>You must give accurate information and keep your login details confidential. You are responsible for all activity under your account. Tell us right away if you suspect unauthorised access.</p>
      </Section>

      <Section title="4. Acceptable use">
        <p>You must not upload or publish content that is unlawful, infringing, defamatory, hateful, sexually explicit, misleading, or that violates the rights of others. You must not use the Service to send spam, manipulate engagement, or disrupt, probe or reverse-engineer the Service.</p>
      </Section>

      <Section title="5. Your content">
        <p>You keep ownership of your content. You confirm that you have every right needed to upload and publish it. You give us a limited licence to store, process and transmit your content only to provide the Service.</p>
      </Section>

      <Section title="6. Third-party platforms">
        <p>When you connect and publish to YouTube, Facebook, Instagram or TikTok, you must also follow that platform's terms and community guidelines, including the TikTok Terms of Service and Community Guidelines and the YouTube Terms of Service. We publish content only when you take an explicit action or set a schedule. You can disconnect any platform at any time.</p>
      </Section>

      <Section title="7. AI-generated metadata">
        <p>Suggested titles, captions and hashtags are generated automatically and may contain errors. Review them before publishing. You are responsible for anything you publish.</p>
      </Section>

      <Section title="8. Availability and warranties">
        <p>The Service is provided "as is" and "as available", without warranties of any kind. Third-party API changes, maintenance or outages may affect features.</p>
      </Section>

      <Section title="9. Limitation of liability">
        <p>To the maximum extent the law allows, we are not liable for indirect, incidental, special or consequential damages, or for lost profits, data or reach, arising from your use of the Service.</p>
      </Section>

      <Section title="10. Termination">
        <p>We may suspend or end accounts that violate these Terms. You may stop using the Service at any time and ask us to delete your account.</p>
      </Section>

      <Section title="11. Changes">
        <p>We may update these Terms. If you keep using the Service after an update is posted, you accept the revised Terms.</p>
      </Section>

      <Section title="12. Governing law">
        <p>These Terms are governed by the laws of India. The courts of India have exclusive jurisdiction over any dispute.</p>
      </Section>

      <Section title="13. Contact">
        <p>Questions about these Terms: <a className="text-brand-emerald" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
      </Section>
    </article>
  </PublicLayout>
);

export default TermsPolicy;
