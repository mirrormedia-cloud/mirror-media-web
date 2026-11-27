import React from 'react';
import { PublicLayout } from '../../components/public/PublicLayout';
import { SITE_NAME, CONTACT_EMAIL, LEGAL_LAST_UPDATED } from '../../lib/site';

/*
 * Google OAuth verification reviewers read this page. Every statement here
 * must match what the code actually does — in particular the YouTube scopes
 * (backend/src/modules/social_media/social_media.service.ts YOUTUBE_SCOPES),
 * the copyright sweep that deletes rejected videos, and the disconnect flow
 * that revokes + wipes tokens. Update this page whenever those change.
 */

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section id={id} className="space-y-3 scroll-mt-24">
    <h2 className="text-xl font-semibold">{title}</h2>
    <div className="text-text-muted space-y-3 leading-relaxed">{children}</div>
  </section>
);

const Sub: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <h3 className="font-semibold text-text-primary">{title}</h3>
    {children}
  </div>
);

const Ext: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a className="text-brand-emerald underline" href={href} target="_blank" rel="noopener noreferrer">{children}</a>
);

const Mail: React.FC = () => (
  <a className="text-brand-emerald" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
);

const TOC: { id: string; label: string }[] = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'information-we-collect', label: 'Information we collect' },
  { id: 'google-data', label: 'Google account data we access' },
  { id: 'google-api-usage', label: 'Why we request each Google permission' },
  { id: 'limited-use', label: 'Google API Services Limited Use disclosure' },
  { id: 'other-platforms', label: 'Facebook, Instagram, TikTok and Telegram data' },
  { id: 'how-we-use', label: 'How we use information' },
  { id: 'storage', label: 'Data storage' },
  { id: 'sharing', label: 'Data sharing' },
  { id: 'security', label: 'Data security' },
  { id: 'retention', label: 'Data retention' },
  { id: 'deletion', label: 'Data deletion and revoking access' },
  { id: 'cookies', label: 'Cookies and local storage' },
  { id: 'rights', label: 'Your rights' },
  { id: 'children', label: 'Children' },
  { id: 'changes', label: 'Changes to this policy' },
  { id: 'contact', label: 'Contact information' },
];

const PrivacyPolicy: React.FC = () => (
  <PublicLayout>
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-16 space-y-10">
      <header className="text-center">
        <h1 className="text-4xl font-bold">Privacy Policy</h1>
        <p className="text-text-muted mt-2">Last updated: {LEGAL_LAST_UPDATED}</p>
      </header>

      <nav aria-label="Contents" className="rounded-lg border border-border p-4">
        <p className="font-semibold mb-2">Contents</p>
        <ol className="list-decimal pl-6 space-y-1 text-text-muted">
          {TOC.map((t) => (
            <li key={t.id}><a className="hover:text-brand-emerald" href={`#${t.id}`}>{t.label}</a></li>
          ))}
        </ol>
      </nav>

      <Section id="introduction" title="1. Introduction">
        <p>
          {SITE_NAME} ("{SITE_NAME}", "we", "us" or "our") runs the website at mirrormedia.space and
          a video management platform (the "Service"). The Service lets creators and media teams
          store a video library, use AI to draft titles, descriptions and tags, schedule posts, publish
          videos to their own social media accounts (YouTube, Facebook, Instagram, TikTok and
          Telegram), and see performance stats for those videos in one dashboard.
        </p>
        <p>
          This Privacy Policy explains what information we collect, how we use it, where we store
          it, who we share it with, how long we keep it, and how you can delete it. It covers the data
          we receive from Google APIs in detail. By using the Service you agree to this policy.
        </p>
      </Section>

      <Section id="information-we-collect" title="2. Information we collect">
        <Sub title="Information you give us">
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account information:</strong> your name, email address, password (stored only as a one-way hash), and optional profile picture.</li>
            <li><strong>Content:</strong> videos, thumbnails, titles, descriptions, captions, tags, schedules and other metadata you upload, import or create in the Service.</li>
            <li><strong>Support messages:</strong> what you send us when you contact us.</li>
          </ul>
        </Sub>
        <Sub title="Information from accounts you connect">
          <p>
            When you choose to connect a YouTube, Facebook, Instagram, TikTok or Telegram account, we
            receive OAuth access and refresh tokens (or, for Telegram, the bot token you enter) plus
            the limited profile and channel details described in sections 3 and 6.
          </p>
        </Sub>
        <Sub title="Information collected automatically">
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Technical data:</strong> IP address, browser and device type, and the server logs we need to run, debug and secure the Service.</li>
            <li><strong>Usage data:</strong> records of actions in the Service, such as uploads, scheduled posts and publish results, so we can show your history and fix errors.</li>
          </ul>
        </Sub>
        <p>We do not collect payment card numbers, government IDs, precise location, contacts, or any special category data.</p>
      </Section>

      <Section id="google-data" title="3. Google account data we access">
        <p>{SITE_NAME} accesses Google user data in two cases only, and only after you give consent on Google's own consent screen.</p>
        <Sub title="a) Connecting a YouTube channel">
          <p>When you click <em>Connect YouTube</em>, we ask Google for access to your YouTube account. Using that access we receive and use:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>OAuth access and refresh tokens for your YouTube account.</li>
            <li>Your YouTube channel ID and channel title, so we can show which channel is connected.</li>
            <li>The list of videos on your channel's uploads playlist (video ID, title, thumbnail and publish date).</li>
            <li>Public statistics and status for those videos (view, like and comment counts, upload status, privacy status and copyright rejection status).</li>
          </ul>
          <p>
            We do <strong>not</strong> access your Gmail, Google Drive, Google Contacts, Google Calendar,
            YouTube comments text, subscribers list, watch history, or YouTube private messages.
          </p>
        </Sub>
        <Sub title="b) Sign in with Google (if offered)">
          <p>
            If you sign in to {SITE_NAME} with your Google account, Google shares your name, email
            address, profile picture and Google account ID with us (the <code>openid</code>,{' '}
            <code>email</code> and <code>profile</code> scopes). We use these only to create your
            account and sign you in.
          </p>
        </Sub>
      </Section>

      <Section id="google-api-usage" title="4. Why we request each Google permission">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-text-primary">
                <th className="border-b border-border py-2 pr-4">Permission (scope)</th>
                <th className="border-b border-border py-2">Why we need it and how we use it</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr>
                <td className="border-b border-border py-2 pr-4"><code>https://www.googleapis.com/auth/youtube.upload</code><br />Manage your YouTube videos</td>
                <td className="border-b border-border py-2">To upload a video to your channel when you click <em>Publish</em> or when a schedule you created runs. We upload only the videos you pick, with the title, description, tags, thumbnail and privacy setting you choose.</td>
              </tr>
              <tr>
                <td className="border-b border-border py-2 pr-4"><code>https://www.googleapis.com/auth/youtube.force-ssl</code><br />See, edit and permanently delete your YouTube videos, ratings, comments and captions</td>
                <td className="border-b border-border py-2">
                  <p>We use this permission for three things only:</p>
                  <ol className="list-decimal pl-5 space-y-1 mt-1">
                    <li>Read your channel ID and title so we can show which channel is connected.</li>
                    <li>Read the list of your uploaded videos and their view, like and comment counts so we can show them in your Analytics dashboard.</li>
                    <li>Check the status of videos uploaded through {SITE_NAME} for 30 days after publishing. If YouTube rejects one of these videos for copyright reasons, we delete that rejected video from your channel and tell you in the Social Uploads page. We never delete any other video on your channel.</li>
                  </ol>
                  <p className="mt-1">We do not use this permission to rate videos, or to post, edit or delete comments or captions.</p>
                </td>
              </tr>
              <tr>
                <td className="border-b border-border py-2 pr-4"><code>openid</code>, <code>email</code>, <code>profile</code><br />(Sign in with Google only)</td>
                <td className="border-b border-border py-2">To create your {SITE_NAME} account and sign you in with your Google name, email and profile picture.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Sub title="Do we store Google user data?">
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Stored:</strong> OAuth tokens (encrypted at rest), your YouTube channel ID and title, and the IDs and publish results of videos you uploaded through {SITE_NAME}. For Sign in with Google: your name, email and profile picture.</li>
            <li><strong>Not stored long term:</strong> your channel's video list and statistics. We fetch these from YouTube when you open the Analytics page and keep them in server memory for a few minutes only, to avoid repeat requests.</li>
          </ul>
        </Sub>
        <Sub title="Do we share Google user data?">
          <p>
            No. We do not sell, rent or share Google user data with anyone, except: (a) with Google
            itself when we call the YouTube API for you; (b) with the hosting providers in section 8
            that store it for us under contract; and (c) if the law requires it. We never share it
            with advertisers, data brokers or AI model providers.
          </p>
        </Sub>
      </Section>

      <Section id="limited-use" title="5. Google API Services Limited Use disclosure">
        <p className="rounded-lg border border-brand-emerald/40 p-4 text-text-primary">
          {SITE_NAME}'s use and transfer to any other app of information received from Google APIs
          will adhere to the{' '}
          <Ext href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</Ext>,
          including the Limited Use requirements.
        </p>
        <p>In particular:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>We use Google user data only to provide and improve the user-facing features described in this policy and shown in the Service.</li>
          <li>We do not transfer Google user data to others except as needed to provide those features, for security purposes, to comply with the law, or as part of a merger or acquisition with your notice.</li>
          <li>We do not use or transfer Google user data for advertising, including retargeting, personalised or interest-based ads.</li>
          <li>We do not sell Google user data, and we do not use it to decide creditworthiness or for lending.</li>
          <li>We do not use Google user data to develop, improve or train generalised or non-personalised AI or machine-learning models, and we do not send data received from YouTube APIs to any AI model.</li>
          <li>No human at {SITE_NAME} reads your Google user data unless you give us permission for a specific support request, it is needed for security (such as investigating abuse), it is needed to comply with the law, or it has been aggregated and anonymised for internal operations.</li>
        </ul>
        <p>
          {SITE_NAME} uses YouTube API Services. By connecting a YouTube account you also agree to the{' '}
          <Ext href="https://www.youtube.com/t/terms">YouTube Terms of Service</Ext>, and Google's
          handling of your data is covered by the{' '}
          <Ext href="https://policies.google.com/privacy">Google Privacy Policy</Ext>.
        </p>
      </Section>

      <Section id="other-platforms" title="6. Facebook, Instagram, TikTok and Telegram data">
        <p>
          <strong>Facebook and Instagram:</strong> when you connect, we receive tokens and the IDs and
          names of the Facebook Pages and Instagram business accounts you choose. We use them only to
          publish the content you select and to show like, comment and share counts for posts made
          through {SITE_NAME}.
        </p>
        <p><strong>TikTok:</strong> if you connect TikTok through TikTok Login Kit, we request only these scopes:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><code>user.info.basic</code>: your open ID, display name and avatar, used only to show which TikTok account is connected.</li>
          <li><code>video.upload</code> and <code>video.publish</code>: used only to upload or publish the videos you select, with the caption, privacy level and interaction settings you choose, at the time you choose.</li>
        </ul>
        <p>
          We do not read your TikTok followers, messages, likes or other content. You can also revoke
          access in TikTok under Settings → Security → Manage app permissions.
        </p>
        <p>
          <strong>Telegram:</strong> we store the bot token and channel name you enter, and use them
          only to post the content you select to that channel.
        </p>
        <p>We never post to any platform unless you take an explicit action or create a schedule.</p>
      </Section>

      <Section id="how-we-use" title="7. How we use information">
        <ul className="list-disc pl-6 space-y-1">
          <li>To create and secure your account and sign you in.</li>
          <li>To provide the Service: storing your library, publishing and scheduling posts, and showing analytics.</li>
          <li>
            To generate AI suggestions. When you ask for AI-generated titles, descriptions or tags, we
            send the video or image you selected and its metadata to Google's Gemini API, which
            returns suggestions to you. Only content you uploaded to {SITE_NAME} is sent; data
            received from YouTube APIs is never sent.
          </li>
          <li>To send service messages, such as publish failures or reminders to reconnect an account.</li>
          <li>To keep the Service secure, prevent abuse, and fix errors.</li>
          <li>To meet legal obligations.</li>
        </ul>
        <p>We do not sell personal data, and we do not use it for advertising.</p>
      </Section>

      <Section id="storage" title="8. Data storage">
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Account and platform data</strong> (including OAuth tokens) is stored in a managed PostgreSQL database hosted by Aiven, with encrypted connections.</li>
          <li><strong>Media files</strong> (videos and thumbnails you upload) are stored in Cloudflare R2 object storage.</li>
          <li><strong>Application servers</strong> that process requests are run by our cloud hosting provider. Files are kept on these servers only while an upload or AI analysis is in progress, then removed.</li>
        </ul>
        <p>These providers may store data in data centres outside your country. They process data only on our instructions and under confidentiality and security obligations.</p>
      </Section>

      <Section id="sharing" title="9. Data sharing">
        <p>We share data only in these cases:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Platforms you connect:</strong> we send your selected content to YouTube, Facebook, Instagram, TikTok or Telegram when you publish.</li>
          <li><strong>Service providers:</strong> database hosting (Aiven), file storage (Cloudflare), application hosting, and AI processing of content you choose to analyse (Google Gemini API). Section 5 limits apply to all Google user data.</li>
          <li><strong>Legal reasons:</strong> when required by law, court order, or to protect the rights and safety of our users or others.</li>
          <li><strong>Business transfers:</strong> if {SITE_NAME} is merged or acquired, with notice to you, and this policy will continue to apply to your data.</li>
        </ul>
        <p>We do not sell or rent personal data to anyone.</p>
      </Section>

      <Section id="security" title="10. Data security">
        <ul className="list-disc pl-6 space-y-1">
          <li>All traffic between your browser, our servers and our providers uses HTTPS/TLS encryption.</li>
          <li>Data in our database and file storage is encrypted at rest by our providers.</li>
          <li>Passwords are stored only as salted one-way hashes. OAuth tokens are never shown in the app or sent to your browser, and are hidden in our logs.</li>
          <li>Access to production systems is limited to authorised staff who need it, and is protected by strong credentials.</li>
          <li>Optional two-step verification is available for your {SITE_NAME} account.</li>
        </ul>
        <p>No system is perfectly secure. If we learn of a breach that affects your data, we will notify you and the relevant authorities as required by law.</p>
      </Section>

      <Section id="retention" title="11. Data retention">
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Account data and content:</strong> kept while your account is active, and deleted within 30 days after you delete your account.</li>
          <li><strong>OAuth tokens and Google user data:</strong> kept only while the platform stays connected. When you disconnect a platform, we revoke the access at the platform (for Google, through Google's revoke endpoint) and erase the tokens immediately.</li>
          <li><strong>YouTube statistics:</strong> kept in server memory for a few minutes only; not saved to our database.</li>
          <li><strong>Server logs:</strong> kept for up to 90 days for security and debugging.</li>
          <li><strong>Backups:</strong> deleted data may remain in encrypted backups for up to 30 more days before it is overwritten.</li>
        </ul>
        <p>We may keep some data longer only when the law requires it.</p>
      </Section>

      <Section id="deletion" title="12. Data deletion and revoking access">
        <Sub title="Disconnect a platform">
          <p>
            Go to <em>Social Accounts</em> in {SITE_NAME} and click <em>Disconnect</em>. We revoke our
            access and erase the tokens right away. Videos already published to your channel stay on
            the platform; you can remove them there.
          </p>
        </Sub>
        <Sub title="Revoke access from your Google account">
          <p>
            You can remove {SITE_NAME}'s access to your Google account at any time at{' '}
            <Ext href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</Ext>.
            After that, we can no longer reach your YouTube account. To also remove the data we stored,
            disconnect in the app or ask us as described below.
          </p>
        </Sub>
        <Sub title="Delete your account and all data">
          <p>
            Email <Mail /> from your registered email address with the subject "Delete my account".
            We will confirm your request, then delete your account, your content, your connected
            platform tokens and all Google user data we hold within 30 days, and email you when it is
            done.
          </p>
        </Sub>
      </Section>

      <Section id="cookies" title="13. Cookies and local storage">
        <p>
          We use only essential cookies and browser local storage, to keep you signed in and to
          remember settings such as your theme. We do not use advertising cookies, cross-site
          tracking, or third-party analytics trackers. If you block these, you may not be able to
          sign in.
        </p>
      </Section>

      <Section id="rights" title="14. Your rights">
        <p>
          Depending on where you live (for example under the GDPR, UK GDPR, CCPA or India's DPDP Act),
          you may have the right to access, correct, export or delete your personal data, to object to
          or limit how we process it, and to withdraw consent at any time. To use these rights, email{' '}
          <Mail />. We reply within 30 days. You may also complain to your local data protection
          authority.
        </p>
      </Section>

      <Section id="children" title="15. Children">
        <p>The Service is not meant for anyone under 18, and we do not knowingly collect their personal information. If you believe a child has given us data, contact us and we will delete it.</p>
      </Section>

      <Section id="changes" title="16. Changes to this policy">
        <p>
          We may update this policy from time to time. We will post the new version on this page and
          change the date at the top. If a change affects how we use Google user data or other
          personal data in a significant way, we will notify you by email or in the app before it
          takes effect, and ask for your consent where required.
        </p>
      </Section>

      <Section id="contact" title="17. Contact information">
        <p>
          <strong>{SITE_NAME}</strong><br />
          Website: <a className="text-brand-emerald" href="https://mirrormedia.space">https://mirrormedia.space</a><br />
          Privacy and support email: <Mail />
        </p>
      </Section>
    </article>
  </PublicLayout>
);

export default PrivacyPolicy;
