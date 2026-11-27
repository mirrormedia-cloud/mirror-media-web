/**
 * TikTok post settings panel — implements TikTok's Content Sharing
 * Guidelines (https://developers.tiktok.com/doc/content-sharing-guidelines)
 * required for the Content Posting API (Direct Post) audit:
 *
 *  1. Shows the creator's TikTok nickname/avatar from creator_info.
 *  2. Blocks posting when creator_info says the creator can't post now.
 *  3. Privacy dropdown built ONLY from privacy_level_options, with NO
 *     default — the creator must pick manually.
 *  4. Allow Comment / Duet / Stitch: unchecked by default, disabled when
 *     the creator has them turned off in TikTok.
 *  5. Commercial content disclosure toggle (off by default) with
 *     "Your brand" / "Branded content"; branded content can't be private.
 *  6. Matching consent declaration (Music Usage Confirmation, plus
 *     Branded Content Policy when branded).
 *  7. Video preview + max duration check against creator_info.
 *
 * Fully controlled: the parent owns `value` and reads validity through
 * `validate_tiktok_settings()`.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Info, Loader2, RefreshCw } from 'lucide-react';
import {
    social_service,
    TikTokCreatorInfo,
    TikTokPrivacyLevel,
    TikTokUploadOptions,
} from '../../../services/social_service';

export interface TikTokPostSettings {
    privacy_level: TikTokPrivacyLevel | '';
    allow_comment: boolean;
    allow_duet: boolean;
    allow_stitch: boolean;
    disclose_commercial: boolean;
    brand_organic: boolean;   // "Your brand"
    brand_content: boolean;   // "Branded content"
}

export const EMPTY_TIKTOK_SETTINGS: TikTokPostSettings = {
    privacy_level: '',
    allow_comment: false,
    allow_duet: false,
    allow_stitch: false,
    disclose_commercial: false,
    brand_organic: false,
    brand_content: false,
};

/** What the parent needs to validate: creator info + measured duration. */
export interface TikTokPanelMeta {
    info: TikTokCreatorInfo | null;
    loading: boolean;
    load_error: string | null;
    duration_sec: number | null;
}

const PRIVACY_LABELS: Record<TikTokPrivacyLevel, string> = {
    PUBLIC_TO_EVERYONE: 'Everyone',
    MUTUAL_FOLLOW_FRIENDS: 'Friends',
    FOLLOWER_OF_CREATOR: 'Followers',
    SELF_ONLY: 'Only me',
};

const MUSIC_USAGE_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
const BRANDED_POLICY_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en';

/** Returns a user-facing reason the post can't go out yet, or null. */
export function validate_tiktok_settings(s: TikTokPostSettings, meta: TikTokPanelMeta): string | null {
    if (meta.loading) return 'Loading your TikTok account info…';
    if (meta.load_error || !meta.info) return meta.load_error || 'Could not load your TikTok account info';
    if (!meta.info.creator_available) return 'Your TikTok account can’t post right now. Try again later.';
    const max = meta.info.max_video_post_duration_sec;
    if (max && meta.duration_sec && meta.duration_sec > max) {
        return `This video is ${Math.ceil(meta.duration_sec)}s — your TikTok account allows up to ${max}s.`;
    }
    if (!s.privacy_level) return 'Choose who can view this TikTok post';
    if (s.disclose_commercial && !s.brand_organic && !s.brand_content) {
        return 'You need to indicate if your content promotes yourself, a third party, or both.';
    }
    if (s.disclose_commercial && s.brand_content && s.privacy_level === 'SELF_ONLY') {
        return 'Branded content visibility cannot be set to private.';
    }
    return null;
}

/** Map the panel state to the upload payload. Call only when valid. */
export function to_tiktok_upload_options(s: TikTokPostSettings): TikTokUploadOptions {
    return {
        privacy_level: s.privacy_level as TikTokPrivacyLevel,
        allow_comment: s.allow_comment,
        allow_duet: s.allow_duet,
        allow_stitch: s.allow_stitch,
        brand_organic_toggle: s.disclose_commercial && s.brand_organic,
        brand_content_toggle: s.disclose_commercial && s.brand_content,
    };
}

interface Props {
    /** Playable URL of the library video (for preview + duration). */
    video_url: string | null;
    value: TikTokPostSettings;
    onChange: (next: TikTokPostSettings) => void;
    onMeta: (meta: TikTokPanelMeta) => void;
}

const TikTokPostPanel: React.FC<Props> = ({ video_url, value, onChange, onMeta }) => {
    const [info, set_info] = useState<TikTokCreatorInfo | null>(null);
    const [loading, set_loading] = useState(true);
    const [load_error, set_load_error] = useState<string | null>(null);
    const [duration_sec, set_duration_sec] = useState<number | null>(null);

    const load = useCallback(async () => {
        set_loading(true);
        set_load_error(null);
        try {
            const res = await social_service.get_tiktok_creator_info();
            if (!res.success || !res.data) throw new Error(res.message || 'Could not load TikTok account info');
            set_info(res.data);
        } catch (err: any) {
            set_info(null);
            set_load_error(err?.response?.data?.error?.message || err?.message || 'Could not load TikTok account info');
        } finally {
            set_loading(false);
        }
    }, []);

    // creator_info must be fresh each time the post screen is shown.
    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        onMeta({ info, loading, load_error, duration_sec });
    }, [info, loading, load_error, duration_sec, onMeta]);

    const set = (patch: Partial<TikTokPostSettings>) => onChange({ ...value, ...patch });

    const toggle_disclose = (on: boolean) => {
        // Turning the toggle off clears both choices.
        set(on ? { disclose_commercial: true } : { disclose_commercial: false, brand_organic: false, brand_content: false });
    };

    const toggle_branded = (on: boolean) => {
        // Branded content can't be private — clear an "Only me" selection.
        set({
            brand_content: on,
            ...(on && value.privacy_level === 'SELF_ONLY' ? { privacy_level: '' as const } : {}),
        });
    };

    const branded = value.disclose_commercial && value.brand_content;
    const own_brand_only = value.disclose_commercial && value.brand_organic && !value.brand_content;
    const max = info?.max_video_post_duration_sec ?? null;
    const too_long = !!(max && duration_sec && duration_sec > max);

    return (
        <section className="rounded-2xl border border-border-subtle bg-bg-surface/40 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase font-bold text-text-muted tracking-wider">TikTok post settings</p>
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-main disabled:opacity-50"
                    title="Reload TikTok account info"
                >
                    <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {/* 1. Creator identity */}
            {loading ? (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Loader2 size={14} className="animate-spin" /> Loading your TikTok account…
                </div>
            ) : load_error ? (
                <div className="flex items-start gap-2 text-[12px] text-red-400">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>{load_error}</span>
                </div>
            ) : info && (
                <div className="flex items-center gap-3">
                    {info.creator_avatar_url ? (
                        <img src={info.creator_avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-neutral-500/20" />
                    )}
                    <div className="min-w-0">
                        <p className="text-[11px] text-text-muted">Posting to TikTok as</p>
                        <p className="text-sm font-bold text-text-main truncate">
                            {info.creator_nickname || info.creator_username}
                            {info.creator_username && (
                                <span className="font-normal text-text-muted"> @{info.creator_username}</span>
                            )}
                        </p>
                    </div>
                </div>
            )}

            {/* 2. Can't post right now */}
            {info && !info.creator_available && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[12px] text-amber-300">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>This TikTok account can’t publish more posts right now. Please try again later.</span>
                </div>
            )}

            {info && (
                <>
                    {/* 7. Preview + duration */}
                    {video_url && (
                        <div className="space-y-1">
                            <video
                                src={video_url}
                                controls
                                preload="metadata"
                                className="w-full max-h-64 rounded-xl bg-black"
                                onLoadedMetadata={(e) => {
                                    const d = e.currentTarget.duration;
                                    set_duration_sec(Number.isFinite(d) ? d : null);
                                }}
                            />
                            {too_long && (
                                <p className="text-[11px] text-red-400 flex items-start gap-1">
                                    <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                    This video is {Math.ceil(duration_sec!)}s — your TikTok account allows up to {max}s.
                                </p>
                            )}
                        </div>
                    )}

                    {/* 3. Privacy — no default */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-text-main" htmlFor="tt-privacy">Who can view this video</label>
                        <select
                            id="tt-privacy"
                            value={value.privacy_level}
                            onChange={(e) => set({ privacy_level: e.target.value as TikTokPrivacyLevel | '' })}
                            className="input-field px-4"
                        >
                            <option value="" disabled>Select privacy</option>
                            {info.privacy_level_options.map(p => {
                                const blocked = p === 'SELF_ONLY' && branded;
                                return (
                                    <option key={p} value={p} disabled={blocked}>
                                        {PRIVACY_LABELS[p] ?? p}{blocked ? ' — not available for branded content' : ''}
                                    </option>
                                );
                            })}
                        </select>
                        {branded && (
                            <p className="text-[11px] text-text-muted">Branded content visibility cannot be set to private.</p>
                        )}
                    </div>

                    {/* 4. Interactions — unchecked by default */}
                    <div className="space-y-1.5">
                        <p className="text-xs font-bold text-text-main">Allow users to</p>
                        <div className="flex flex-wrap gap-4">
                            {([
                                ['allow_comment', 'Comment', info.comment_disabled],
                                ['allow_duet', 'Duet', info.duet_disabled],
                                ['allow_stitch', 'Stitch', info.stitch_disabled],
                            ] as const).map(([key, label, disabled]) => (
                                <label
                                    key={key}
                                    className={`flex items-center gap-2 text-xs select-none ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer text-text-main'}`}
                                    title={disabled ? `${label} is turned off in your TikTok privacy settings` : undefined}
                                >
                                    <input
                                        type="checkbox"
                                        className="accent-brand-emerald w-4 h-4"
                                        disabled={disabled}
                                        checked={!disabled && value[key]}
                                        onChange={(e) => set({ [key]: e.target.checked } as Partial<TikTokPostSettings>)}
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* 5. Commercial content disclosure */}
                    <div className="space-y-2 rounded-xl border border-border-subtle p-3">
                        <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
                            <span>
                                <span className="block text-xs font-bold text-text-main">Disclose video content</span>
                                <span className="block text-[11px] text-text-muted mt-0.5">
                                    Turn on to disclose that this video promotes goods or services in exchange for something of value. Your video could promote yourself, a third party, or both.
                                </span>
                            </span>
                            <input
                                type="checkbox"
                                className="accent-brand-emerald w-4 h-4 mt-0.5 shrink-0"
                                checked={value.disclose_commercial}
                                onChange={(e) => toggle_disclose(e.target.checked)}
                            />
                        </label>

                        {value.disclose_commercial && (
                            <div className="space-y-2 pl-1">
                                <label className="flex items-start gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        className="accent-brand-emerald w-4 h-4 mt-0.5"
                                        checked={value.brand_organic}
                                        onChange={(e) => set({ brand_organic: e.target.checked })}
                                    />
                                    <span>
                                        <span className="block text-xs font-bold text-text-main">Your brand</span>
                                        <span className="block text-[11px] text-text-muted">You are promoting yourself or your own business.</span>
                                    </span>
                                </label>
                                <label className="flex items-start gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        className="accent-brand-emerald w-4 h-4 mt-0.5"
                                        checked={value.brand_content}
                                        onChange={(e) => toggle_branded(e.target.checked)}
                                    />
                                    <span>
                                        <span className="block text-xs font-bold text-text-main">Branded content</span>
                                        <span className="block text-[11px] text-text-muted">You are promoting another brand or a third party.</span>
                                    </span>
                                </label>

                                {!value.brand_organic && !value.brand_content ? (
                                    <p className="text-[11px] text-amber-400 flex items-start gap-1">
                                        <Info size={11} className="mt-0.5 shrink-0" />
                                        You need to indicate if your content promotes yourself, a third party, or both.
                                    </p>
                                ) : (
                                    <p className="text-[11px] text-text-muted flex items-start gap-1">
                                        <Info size={11} className="mt-0.5 shrink-0" />
                                        {own_brand_only
                                            ? 'Your video will be labeled as “Promotional content”.'
                                            : 'Your video will be labeled as “Paid partnership”.'}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 6. Consent declaration */}
                    <p className="text-[11px] text-text-muted leading-relaxed">
                        {branded ? (
                            <>By posting, you agree to TikTok's{' '}
                                <a href={BRANDED_POLICY_URL} target="_blank" rel="noreferrer" className="text-brand-blue hover:underline">Branded Content Policy</a>
                                {' '}and{' '}
                                <a href={MUSIC_USAGE_URL} target="_blank" rel="noreferrer" className="text-brand-blue hover:underline">Music Usage Confirmation</a>.
                            </>
                        ) : (
                            <>By posting, you agree to TikTok's{' '}
                                <a href={MUSIC_USAGE_URL} target="_blank" rel="noreferrer" className="text-brand-blue hover:underline">Music Usage Confirmation</a>.
                            </>
                        )}
                    </p>
                    <p className="text-[11px] text-text-muted">
                        The TikTok caption uses the Title and Hashtags you enter in this form. After you post, it may take a few minutes for the video to appear on your TikTok profile.
                    </p>
                </>
            )}
        </section>
    );
};

export default TikTokPostPanel;
