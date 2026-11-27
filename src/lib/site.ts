/**
 * Public-site constants shown on the marketing homepage, Privacy Policy,
 * Terms of Service and Contact pages. Platform reviewers (TikTok, Meta,
 * Google) check these pages, so keep them accurate.
 *
 * Set VITE_CONTACT_EMAIL in .env to a real, monitored mailbox.
 */
export const SITE_NAME = 'Mirror Media Cloud';
export const CONTACT_EMAIL: string =
  import.meta.env.VITE_CONTACT_EMAIL ?? 'mirror.mediacloud@gmail.com';
export const LEGAL_LAST_UPDATED = 'November 27, 2026';
