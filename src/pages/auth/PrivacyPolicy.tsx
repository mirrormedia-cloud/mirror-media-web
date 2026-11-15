import React from 'react';
import { PublicLayout } from '../../components/public/PublicLayout';
import { SITE_NAME, CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '../../lib/site';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-2">
    <h2 className="text-xl font-semibold">{title}</h2>
    <div className="text-text-muted space-y-2 leading-relaxed">{children}</div>
  </section>
);

const PrivacyPolicy: React.FC = () => (
  <PublicLayout>
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-8">
      <header className="text-center">
        <h1 className="text-4xl font-bold">Privacy Policy</h1>
        <p className="text-text-muted mt-2">Last updated: {LEGAL_LAST_UPDATED}</p>
      </header>

      <p className="text-text-muted leading-relaxed">
        This Privacy Policy explains how {SITE_NAME} ("we", "us") collects, uses, shares and
        protects information when you use our website and video management platform (the
        "Service").
      </p>

      <Section title="1. Information we collect">
        <p><strong>Account information:</strong> name, email address and profile picture, provided by you or by Google Sign-In.</p>
        <p><strong>Content:</strong> videos, thumbnails, titles, captions and other metadata that you upload or import into the Service.</p>
        <p><strong>Connected platform data:</strong> when you connect a third-party account (YouTube, Facebook, Instagram or TikTok), we receive OAuth access and refresh tokens plus the basic profile details that platform allows (for example, account ID, display name and avatar).</p>
        <p><strong>Technical data:</strong> IP address, browser and device type, and logs needed to operate and secure the Service.</p>
      </Section>

      <Section title="2. TikTok data">
        <p>If you connect a TikTok account through TikTok Login Kit, we request only these scopes:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><code>user.info.basic</code>: your open ID, display name and avatar, used only to show which TikTok account is connected.</li>
          <li><code>video.upload</code> and <code>video.publish</code>: used only to upload or publish the videos you select, with the caption, privacy level and interaction settings you choose, at the time you choose.</li>
        </ul>
        <p>We do not read your TikTok followers, messages, likes or other content. We never post to TikTok without an explicit action or schedule that you create. TikTok tokens are stored securely on our servers and deleted when you disconnect the account. You can also revoke access at any time in TikTok under Settings → Security → Manage app permissions.</p>
      </Section>

      <Section title="3. How we use information">
        <p>We use information to authenticate you, provide the Service's features (library management, AI metadata generation, scheduling, publishing and analytics), keep the Service secure, send service messages, and meet legal obligations. We do not sell personal data, and we do not use it for advertising.</p>
      </Section>

      <Section title="4. Sharing">
        <p>We share data only (a) with the platforms you connect, so we can publish content at your request; (b) with infrastructure providers (cloud hosting, storage and AI processing) that act on our behalf under confidentiality obligations; and (c) when the law requires it.</p>
      </Section>

      <Section title="5. Google API data">
        <p>Our use of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements.</p>
      </Section>

      <Section title="6. Retention and deletion">
        <p>We keep data while your account is active. If you disconnect a platform, we delete its tokens right away. To delete your account and the data linked to it, email <a className="text-brand-emerald" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from your registered address. We complete deletion within 30 days, except where the law requires us to keep data.</p>
      </Section>

      <Section title="7. Security">
        <p>We use encryption in transit (HTTPS), access controls and secured storage for tokens and media. No system is perfectly secure, but we work to protect your data from unauthorised access.</p>
      </Section>

      <Section title="8. Cookies">
        <p>We use only essential cookies and local storage to keep you signed in and to remember preferences such as your theme. We do not use advertising trackers.</p>
      </Section>

      <Section title="9. Your rights">
        <p>Depending on where you live, you may have the right to access, correct, export or delete your personal data, or to object to its processing. To exercise these rights, contact us at the email below.</p>
      </Section>

      <Section title="10. Children">
        <p>The Service is not directed to anyone under 18, and we do not knowingly collect their personal information.</p>
      </Section>

      <Section title="11. Changes">
        <p>We may update this policy from time to time. We will post the new version on this page and update the date above.</p>
      </Section>

      <Section title="12. Contact">
        <p>Privacy questions or requests: <a className="text-brand-emerald" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
      </Section>
    </article>
  </PublicLayout>
);

export default PrivacyPolicy;
