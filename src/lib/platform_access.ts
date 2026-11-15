/**
 * Platform-review account restrictions.
 *
 * The TikTok app-review test account must only see TikTok. For those
 * emails, YouTube / Facebook / Instagram are hidden from every platform
 * picker and shown as "Coming soon" on the Social Accounts page.
 * Every other user sees all platforms.
 *
 * Backend counterpart: backend/src/shared/platform_access.ts — keep the
 * email list in sync.
 */
import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

export const REVIEW_ACCOUNT_EMAILS = ['test@gmail.com'];
export const REVIEW_HIDDEN_PLATFORMS = ['youtube', 'facebook', 'instagram'];

export function is_review_account(email: string | null | undefined): boolean {
    return !!email && REVIEW_ACCOUNT_EMAILS.includes(email.trim().toLowerCase());
}

export function usePlatformAccess() {
    const { user } = useAuth();
    const restricted = is_review_account(user?.email);

    return useMemo(() => {
        const is_allowed = (platform: string) =>
            !restricted || !REVIEW_HIDDEN_PLATFORMS.includes(platform);
        /** Keep only allowed platforms. Non-platform entries ('all', 'general') pass through. */
        const filter = <T,>(items: readonly T[], key: (item: T) => string = (i) => String(i)): T[] =>
            items.filter((i) => is_allowed(key(i)));
        return { restricted, is_allowed, filter };
    }, [restricted]);
}
