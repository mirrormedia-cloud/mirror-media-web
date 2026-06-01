/**
 * Push one library item to one or more social platforms.
 *
 * Phase 4a: YouTube is the only platform that actually uploads — Facebook
 * and Instagram show up in the picker but the backend will return a
 * "not implemented yet" failure row for them. The UI surfaces those
 * per-platform statuses so users know exactly what landed.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
    X,
    Save,
    Loader2,
    Youtube,
    Facebook,
    Instagram,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Send,
    Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { LibraryItem } from '../../../types';
import { Input } from '../../../components/ui/Input';
import { CommonSearchSelect, SearchSelectOption } from '../../../components/ui/CommonSearchSelect';
import { ThemedDatePicker } from '../../../components/ui/ThemedDatePicker';
import { ThemedTimePicker } from '../../../components/ui/ThemedTimePicker';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { social_service, SocialPlatform, SocialUploadRow } from '../../../services/social_service';
import { media_analysis_service, AnalysisPlatform } from '../../../services/media_analysis_service';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    item: LibraryItem | null;
}

const VISIBILITY_OPTIONS: SearchSelectOption[] = [
    { label: 'Private', value: 'private' },
    { label: 'Unlisted', value: 'unlisted' },
    { label: 'Public', value: 'public' },
];

const PLATFORM_META: { key: SocialPlatform; label: string; Icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }[] = [
    { key: 'youtube', label: 'YouTube', Icon: Youtube, tone: 'text-red-500' },
    { key: 'facebook', label: 'Facebook Page', Icon: Facebook, tone: 'text-blue-500' },
    { key: 'instagram', label: 'Instagram', Icon: Instagram, tone: 'text-purple-500' },
];

function pad2(n: number) { return String(n).padStart(2, '0'); }

function date_input(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function combine_iso(date_str: string, time_str: string): string | null {
    if (!date_str) return null;
    const [y, m, d] = date_str.split('-').map(Number);
    const [hh, mm] = (time_str || '10:00').split(':').map(Number);
    const dt = new Date(y!, (m! || 1) - 1, (d! || 1), hh ?? 10, mm ?? 0, 0, 0);
    return dt.toISOString();
}

const SocialUploadModal: React.FC<Props> = ({ isOpen, onClose, item }) => {
    const confirm = useConfirm();
    const [platforms, set_platforms] = useState<SocialPlatform[]>(['youtube']);
    const [title, set_title] = useState('');
    const [description, set_description] = useState('');
    const [tags_csv, set_tags_csv] = useState('');
    const [hashtags_csv, set_hashtags_csv] = useState('');
    const [visibility, set_visibility] = useState<'public' | 'unlisted' | 'private'>('private');
    const [schedule_enabled, set_schedule_enabled] = useState(false);
    const [schedule_date, set_schedule_date] = useState(date_input(new Date()));
    const [schedule_time, set_schedule_time] = useState('10:00');
    const [submitting, set_submitting] = useState(false);
    const [results, set_results] = useState<SocialUploadRow[] | null>(null);
    const [analyzing, set_analyzing] = useState<AnalysisPlatform | null>(null);
    /**
     * Auto Details — when on, the backend fills any missing per-platform
     * field from a Gemini analysis (cached when possible). Manual fields
     * the user typed always win.
     */
    const [auto_details, set_auto_details] = useState(false);

    // Reset on open with sensible defaults from the library item.
    useEffect(() => {
        if (!isOpen || !item) return;
        set_platforms(['youtube']);
        set_title(item.title || item.file_name || '');
        set_description(item.description || '');
        set_tags_csv('');
        set_hashtags_csv('');
        set_visibility('private');
        set_schedule_enabled(false);
        set_schedule_date(date_input(new Date()));
        set_schedule_time('10:00');
        set_submitting(false);
        set_results(null);
        set_analyzing(null);
        set_auto_details(false);
    }, [isOpen, item]);

    /**
     * Run Gemini analysis with the prompt template that matches the
     * picked platform. Pre-fills title / description / tags / hashtags
     * — non-destructively when the user has already typed something the
     * AI shouldn't overwrite without confirmation.
     */
    const run_analyze = async (platform: AnalysisPlatform) => {
        if (!item) return;
        if (!media_ready) {
            toast.error('This item has no file_url yet — analysis needs the R2 copy.');
            return;
        }
        const has_user_text = title.trim() || description.trim() || tags_csv.trim() || hashtags_csv.trim();
        if (has_user_text) {
            const ok = await confirm({
                title: 'Overwrite your edits?',
                message: 'Replace the current title, description, tags, and hashtags with AI suggestions?',
                confirm_label: 'Replace',
                tone: 'warning',
            });
            if (!ok) return;
        }
        set_analyzing(platform);
        try {
            const res = await media_analysis_service.analyze({
                library_item_id: item.id,
                platform,
            });
            if (!res.success || !res.data) throw new Error(res.message || 'Analysis failed');
            const r = res.data;
            if (r.title) set_title(r.title);
            if (r.description) set_description(r.description);
            if (r.tags?.length) set_tags_csv(r.tags.join(', '));
            if (r.hashtags?.length) set_hashtags_csv(r.hashtags.join(', '));
            toast.success(`Generated ${platform} suggestions`);
        } catch (err: any) {
            toast.error(err?.message || 'Analysis failed');
        } finally {
            set_analyzing(null);
        }
    };

    const media_ready = !!item?.file_url;

    const platform_chips = useMemo(() => PLATFORM_META, []);

    if (!isOpen || !item) return null;

    const toggle_platform = (p: SocialPlatform) => {
        set_platforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
    };

    const validate = (): string | null => {
        if (platforms.length === 0) return 'Pick at least one platform';
        // Title is only required when Auto Details is OFF — with it on, the
        // backend will generate one from Gemini per platform.
        if (!auto_details && !title.trim()) return 'Title is required (or turn on Auto Details)';
        if (!media_ready) return 'This library item has no file_url — upload to R2 first.';
        if (schedule_enabled) {
            if (!schedule_date) return 'Schedule date is required';
            const iso = combine_iso(schedule_date, schedule_time);
            if (iso && new Date(iso).getTime() <= Date.now()) return 'Schedule time must be in the future';
        }
        return null;
    };

    const handle_submit = async () => {
        const err = validate();
        if (err) { toast.error(err); return; }
        set_submitting(true);
        set_results(null);
        try {
            const scheduled_at = schedule_enabled ? combine_iso(schedule_date, schedule_time) : null;
            const tags = tags_csv ? tags_csv.split(',').map(t => t.trim()).filter(Boolean) : [];
            const hashtags = hashtags_csv ? hashtags_csv.split(',').map(t => t.trim()).filter(Boolean) : [];
            const res = await social_service.create_upload({
                library_item_id: item.id,
                platforms,
                // With auto_details on we can omit title — backend generates
                // it. We still send what the user typed (if anything) so it
                // wins as a manual override.
                title: title.trim() || undefined,
                description: description.trim() || undefined,
                tags,
                hashtags,
                scheduledAt: scheduled_at ?? undefined,
                visibility,
                auto_details,
                manual_details: auto_details ? {
                    title: title.trim() || undefined,
                    description: description.trim() || undefined,
                    tags: tags.length > 0 ? tags : undefined,
                    hashtags: hashtags.length > 0 ? hashtags : undefined,
                } : undefined,
            });
            if (!res.success || !res.data) throw new Error(res.message || 'Upload failed');
            set_results(res.data.uploads);
            const ok = res.data.uploads.filter(u => u.status === 'uploaded' || u.status === 'scheduled').length;
            const failed = res.data.uploads.filter(u => u.status === 'failed').length;
            if (ok > 0) toast.success(`${ok} platform${ok === 1 ? '' : 's'} ${scheduled_at ? 'scheduled' : 'uploaded'}`);
            if (failed > 0) toast.error(`${failed} platform${failed === 1 ? '' : 's'} failed — see details below`);
        } catch (err: any) {
            toast.error(err?.message || 'Upload failed');
        } finally {
            set_submitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !submitting && onClose()} />
            <div className="relative w-full max-w-3xl bg-bg-main border border-border-subtle rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-border-subtle">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-emerald/10 text-brand-emerald flex items-center justify-center">
                            <Send size={18} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-text-main">Upload to Social</h3>
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mt-0.5 truncate max-w-md">
                                {item.title || item.file_name || 'Library item'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {!media_ready && (
                        <div className="flex items-start gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-[12px] text-amber-300">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>This item has no file_url yet — social uploads stream from R2. Re-upload the file to populate the URL.</span>
                        </div>
                    )}

                    {/* Platforms */}
                    <section className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Platforms</label>
                        <div className="grid grid-cols-3 gap-2">
                            {platform_chips.map(({ key, label, Icon, tone }) => {
                                const sel = platforms.includes(key);
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => toggle_platform(key)}
                                        className={`flex items-center gap-2 p-3 rounded-2xl border text-left transition-colors ${
                                            sel
                                                ? 'border-brand-emerald/60 bg-brand-emerald/10'
                                                : 'border-border-subtle hover:border-text-muted/30'
                                        }`}
                                    >
                                        <Icon size={18} className={tone} />
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-text-main truncate">{label}</p>
                                            <p className="text-[10px] text-text-muted">
                                                {sel ? 'selected' : 'click to include'}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {platforms.includes('instagram') && schedule_enabled && (
                            <p className="text-[11px] text-amber-400/80">
                                Instagram has no native scheduling — the post is held as a media container and a Scenario-2 cron will run /media_publish at the chosen time.
                            </p>
                        )}
                        {platforms.includes('facebook') && schedule_enabled && (
                            <p className="text-[11px] text-amber-400/80">
                                Facebook scheduling requires the publish time to be 10 minutes – 6 months in the future; outside that window the post goes live immediately.
                            </p>
                        )}
                    </section>

                    {/* AI analyze — generates platform-specific title/description/tags/hashtags */}
                    <section className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider flex items-center gap-1.5">
                                <Sparkles size={11} className="text-brand-emerald" />
                                Analyze with AI
                            </label>
                            <span className="text-[10px] text-text-muted">Generates per-platform suggestions</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {(['general', 'youtube', 'facebook', 'instagram'] as AnalysisPlatform[]).map(p => {
                                const busy = analyzing === p;
                                const Icon = p === 'youtube' ? Youtube : p === 'facebook' ? Facebook : p === 'instagram' ? Instagram : Sparkles;
                                const tone = p === 'youtube' ? 'text-red-500' : p === 'facebook' ? 'text-blue-500' : p === 'instagram' ? 'text-purple-500' : 'text-brand-emerald';
                                const label = p === 'general' ? 'General' : p.charAt(0).toUpperCase() + p.slice(1);
                                return (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => run_analyze(p)}
                                        disabled={!!analyzing || !media_ready}
                                        className="flex items-center gap-2 p-2 rounded-xl border border-border-subtle text-text-main text-xs font-bold hover:border-brand-emerald/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} className={tone} />}
                                        <span className="truncate">{busy ? 'Analyzing…' : label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* Auto Details — backend fills missing fields from Gemini per-platform. */}
                    <section className="rounded-2xl border border-border-subtle bg-bg-surface/40 p-3">
                        <label className="flex items-start gap-3 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={auto_details}
                                onChange={(e) => set_auto_details(e.target.checked)}
                                className="mt-1 accent-brand-emerald w-4 h-4"
                            />
                            <span className="flex-1 min-w-0">
                                <span className="flex items-center gap-1.5 text-xs font-bold text-text-main">
                                    <Sparkles size={12} className="text-brand-emerald" />
                                    Auto Details from Google Analysis
                                </span>
                                <span className="block text-[11px] text-text-muted mt-0.5 leading-relaxed">
                                    If enabled, missing title, description, caption, tags and hashtags will be generated automatically per platform. Manually filled fields will not be overwritten.
                                </span>
                            </span>
                        </label>
                    </section>

                    {/* Title / description */}
                    <Input label={auto_details ? 'Title (optional — auto-generated if blank)' : 'Title'} value={title} onChange={set_title} placeholder={auto_details ? 'Leave blank to auto-generate' : 'Catchy, under 100 chars'} />

                    <div className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => set_description(e.target.value)}
                            rows={4}
                            className="input-field resize-none"
                            placeholder="What's this video about? Include keywords for SEO."
                        />
                    </div>

                    <Input label="Tags (comma separated)" value={tags_csv} onChange={set_tags_csv} placeholder="series, premiere, episode-5" />
                    <Input label="Hashtags (comma separated)" value={hashtags_csv} onChange={set_hashtags_csv} placeholder="#shorts, #trending" />

                    {/* Visibility */}
                    <div className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Visibility</label>
                        <div className="max-w-xs">
                            <CommonSearchSelect
                                options={VISIBILITY_OPTIONS}
                                value={visibility}
                                on_change={(v) => set_visibility((v || 'private') as 'public' | 'unlisted' | 'private')}
                            />
                        </div>
                        <p className="text-[10px] text-text-muted">
                            When you schedule an upload, YouTube keeps it private until the publish time and flips it then.
                        </p>
                    </div>

                    {/* Schedule */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 ml-1 cursor-pointer select-none">
                            <input type="checkbox" checked={schedule_enabled} onChange={(e) => set_schedule_enabled(e.target.checked)} />
                            <span className="text-sm text-text-main font-medium">Schedule for later</span>
                            <span className="text-[11px] text-text-muted">— off = publish now</span>
                        </label>
                        {schedule_enabled && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Publish date</label>
                                    <ThemedDatePicker
                                        value={schedule_date}
                                        onChange={set_schedule_date}
                                        min={date_input(new Date())}
                                        placeholder="DD-MM-YYYY"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Publish time</label>
                                    <ThemedTimePicker value={schedule_time} onChange={set_schedule_time} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Per-platform results */}
                    {results && results.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Results</p>
                            <div className="space-y-1.5">
                                {results.map(r => {
                                    const meta = PLATFORM_META.find(p => p.key === r.platform);
                                    const Icon = meta?.Icon ?? Send;
                                    const ok = r.status === 'uploaded' || r.status === 'scheduled';
                                    return (
                                        <div key={r.id} className={`flex items-start gap-3 p-3 rounded-2xl border ${ok ? 'border-brand-emerald/30 bg-brand-emerald/5' : 'border-red-500/30 bg-red-500/5'}`}>
                                            <Icon size={18} className={meta?.tone ?? 'text-text-muted'} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-text-main capitalize">{r.platform} — {r.status}</p>
                                                {r.media_url && (
                                                    <a
                                                        href={r.media_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="text-[11px] text-brand-blue hover:underline break-all"
                                                    >
                                                        {r.media_url}
                                                    </a>
                                                )}
                                                {r.scheduledAt && (
                                                    <p className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
                                                        <Clock size={10} /> Scheduled for {new Date(r.scheduledAt).toLocaleString()}
                                                    </p>
                                                )}
                                                {r.error_message && (
                                                    <p className="text-[11px] text-red-300 flex items-start gap-1 mt-0.5">
                                                        <AlertTriangle size={10} className="mt-0.5 shrink-0" /> {r.error_message}
                                                    </p>
                                                )}
                                            </div>
                                            {ok && <CheckCircle2 size={16} className="text-brand-emerald shrink-0 mt-0.5" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 p-5 border-t border-border-subtle">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main text-xs font-bold disabled:opacity-50"
                    >
                        {results ? 'Close' : 'Cancel'}
                    </button>
                    <button
                        type="button"
                        onClick={handle_submit}
                        disabled={submitting || !media_ready}
                        className="btn-primary flex items-center gap-2 px-5 py-2 text-xs disabled:opacity-50"
                    >
                        {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {schedule_enabled ? 'Schedule Upload' : 'Upload Now'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SocialUploadModal;
