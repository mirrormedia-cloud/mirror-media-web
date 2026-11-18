import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    Send, Facebook, AlertCircle, Loader2, Minus, Plus, Sparkles, Lock, Save,
    RefreshCw, CheckCircle2, XCircle, Clock, ExternalLink,
} from 'lucide-react';
import {
    auto_post_service, AutoPostConfig, AutoPostFrequency, AutoPostState,
} from '../../../services/auto_post_service';
import { CommonSearchSelect, SearchSelectOption } from '../../../components/ui/CommonSearchSelect';
import { ThemedTimePicker } from '../../../components/ui/ThemedTimePicker';
import { WEEKDAY_OPTIONS } from '../schedules/scheduleMeta';

const MAX_POSTS_PER_DAY = 10;

const FREQUENCY_OPTIONS: SearchSelectOption[] = [
    { label: 'Every Day', value: 'every_day' },
    { label: 'Every Week', value: 'every_week' },
    { label: 'Every Month', value: 'every_month' },
];

type Draft = Pick<AutoPostConfig, 'social_account_id' | 'frequency' | 'post_times' | 'weekdays' | 'month_days'>;

function ordinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Spread N default times between 09:00 and 21:00. */
function default_time(idx: number, count: number): string {
    const start = 9 * 60, end = 21 * 60;
    const mins = count <= 1 ? 10 * 60 : Math.round(start + ((end - start) / (count - 1)) * idx);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

function draft_from(c: AutoPostConfig): Draft {
    return {
        social_account_id: c.social_account_id,
        frequency: c.frequency,
        post_times: c.post_times.length ? c.post_times : ['10:00'],
        weekdays: c.weekdays,
        month_days: c.month_days,
    };
}

const browser_tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
})();

const Switch: React.FC<{ checked: boolean; disabled?: boolean; busy?: boolean; onChange: (v: boolean) => void; title?: string }> = ({
    checked, disabled, busy, onChange, title,
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled || busy}
        title={title}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
            checked ? 'bg-emerald-500' : 'bg-text-muted/30'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
        <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform ${
                checked ? 'translate-x-6' : 'translate-x-1'
            }`}
        >
            {busy && <Loader2 size={12} className="animate-spin text-text-muted" />}
        </span>
    </button>
);

export default function AutoPostPage() {
    const navigate = useNavigate();
    const [loading, set_loading] = useState(true);
    const [state, set_state] = useState<AutoPostState | null>(null);
    const [draft, set_draft] = useState<Draft | null>(null);
    const [saving, set_saving] = useState(false);
    const [toggling, set_toggling] = useState(false);
    const [previewing, set_previewing] = useState(false);
    const [posting, set_posting] = useState(false);
    const [preview, set_preview] = useState<string | null>(null);

    const load = useCallback(async (silent = false) => {
        if (!silent) set_loading(true);
        try {
            const res = await auto_post_service.get();
            if (res.success && res.data) {
                set_state(res.data);
                set_draft(draft_from(res.data.config));
            }
        } catch (e: any) {
            toast.error(e?.message ?? 'Failed to load Auto Post settings');
        } finally {
            if (!silent) set_loading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const config = state?.config ?? null;
    const fb_connected = !!state?.facebook_connected;

    const dirty = useMemo(() => {
        if (!config || !draft) return false;
        return JSON.stringify(draft_from(config)) !== JSON.stringify(draft)
            || config.timezone !== browser_tz;
    }, [config, draft]);

    const validation_error = useMemo(() => {
        if (!draft) return null;
        if (draft.frequency === 'every_week' && draft.weekdays.length === 0) return 'Pick at least one weekday';
        if (draft.frequency === 'every_month' && draft.month_days.length === 0) return 'Pick at least one day of month';
        if (new Set(draft.post_times).size !== draft.post_times.length) return 'Post times must be different';
        return null;
    }, [draft]);

    const account_options: SearchSelectOption[] = useMemo(
        () => (state?.facebook_accounts ?? []).map(a => ({ label: a.page_name ?? a.page_id ?? 'Facebook Page', value: a.id })),
        [state?.facebook_accounts],
    );

    const set_count = (n: number) => {
        const count = Math.max(1, Math.min(MAX_POSTS_PER_DAY, n));
        set_draft(d => d && ({
            ...d,
            post_times: Array.from({ length: count }, (_, i) => d.post_times[i] ?? default_time(i, count)),
        }));
    };
    const set_time = (idx: number, v: string) =>
        set_draft(d => d && ({ ...d, post_times: d.post_times.map((t, i) => (i === idx ? v : t)) }));
    const toggle_weekday = (wd: number) =>
        set_draft(d => d && ({
            ...d,
            weekdays: d.weekdays.includes(wd) ? d.weekdays.filter(x => x !== wd) : [...d.weekdays, wd].sort((a, b) => a - b),
        }));
    const toggle_month_day = (md: number) =>
        set_draft(d => d && ({
            ...d,
            month_days: d.month_days.includes(md) ? d.month_days.filter(x => x !== md) : [...d.month_days, md].sort((a, b) => a - b),
        }));

    async function save_settings(extra: { enabled?: boolean } = {}) {
        if (!draft) return false;
        if (validation_error && (extra.enabled ?? config?.enabled)) {
            toast.error(validation_error);
            return false;
        }
        const res = await auto_post_service.save({ ...draft, timezone: browser_tz, ...extra });
        if (res.success && res.data) {
            set_state(s => s && ({ ...s, config: res.data! }));
            set_draft(draft_from(res.data));
            return true;
        }
        toast.error(res.message || 'Failed to save');
        return false;
    }

    async function on_save() {
        set_saving(true);
        try {
            if (await save_settings()) toast.success('Auto Post settings saved');
        } catch (e: any) {
            toast.error(e?.message ?? 'Failed to save');
        } finally {
            set_saving(false);
        }
    }

    async function on_toggle(next: boolean) {
        if (next && !fb_connected) {
            toast.error('Connect a Facebook Page first');
            return;
        }
        set_toggling(true);
        try {
            // Saves the current schedule together with the switch so what
            // the user sees is exactly what the cron runs.
            if (await save_settings({ enabled: next })) {
                toast.success(next ? 'Auto Post is ON' : 'Auto Post is OFF');
            }
        } catch (e: any) {
            toast.error(e?.message ?? 'Failed to update');
        } finally {
            set_toggling(false);
        }
    }

    async function on_preview() {
        set_previewing(true);
        try {
            const res = await auto_post_service.preview();
            if (res.success && res.data) set_preview(res.data.message);
        } catch (e: any) {
            toast.error(e?.message ?? 'AI generation failed');
        } finally {
            set_previewing(false);
        }
    }

    async function on_post_now() {
        set_posting(true);
        try {
            const res = await auto_post_service.post_now();
            if (res.success) toast.success('Posted to Facebook');
        } catch (e: any) {
            toast.error(e?.message ?? 'Post failed');
        } finally {
            set_posting(false);
            void load(true);
        }
    }

    if (loading || !state || !draft || !config) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={28} className="animate-spin text-text-muted" />
            </div>
        );
    }

    const per_label = draft.frequency === 'every_week' ? 'selected weekday' : draft.frequency === 'every_month' ? 'selected day' : 'day';

    return (
        <div className="p-4 sm:p-8 space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Send size={20} className="text-blue-400" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-text-main">Auto Post</h1>
                    <p className="text-sm text-text-muted">AI writes a thought with emojis &amp; hashtags and posts it to your Facebook Page on schedule — text only, no media.</p>
                </div>
            </div>

            {!fb_connected && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <AlertCircle size={28} className="text-amber-400 shrink-0" />
                    <div className="flex-1">
                        <p className="font-semibold text-text-main">Facebook is not connected</p>
                        <p className="text-sm text-text-muted">Connect a Facebook Page to turn on Auto Post.</p>
                    </div>
                    <button
                        onClick={() => navigate('/dashboard/social-accounts')}
                        className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-colors"
                    >
                        Connect Facebook
                    </button>
                </div>
            )}

            {/* On / Off */}
            <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Facebook size={20} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-text-main">Facebook Auto Post</p>
                    <p className="text-xs text-text-muted">
                        {config.enabled
                            ? `ON · ${draft.post_times.length} post(s) per ${per_label} · ${config.timezone}`
                            : fb_connected ? 'OFF — set your schedule below, then switch on' : 'Disabled until Facebook is connected'}
                    </p>
                </div>
                <Switch
                    checked={config.enabled}
                    disabled={!fb_connected && !config.enabled}
                    busy={toggling}
                    onChange={on_toggle}
                    title={!fb_connected ? 'Connect Facebook first' : undefined}
                />
            </div>

            {/* Settings */}
            <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 space-y-5">
                <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {account_options.length > 1 && (
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Facebook Page</label>
                            <CommonSearchSelect
                                options={account_options}
                                value={draft.social_account_id ?? account_options[0]?.value ?? null}
                                on_change={(v) => set_draft(d => d && ({ ...d, social_account_id: v }))}
                            />
                        </div>
                    )}
                    <div className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Period</label>
                        <CommonSearchSelect
                            options={FREQUENCY_OPTIONS}
                            value={draft.frequency}
                            on_change={(v) => set_draft(d => d && ({ ...d, frequency: (v || 'every_day') as AutoPostFrequency }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Posts count / {per_label}</label>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => set_count(draft.post_times.length - 1)}
                                className="p-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main">
                                <Minus size={14} />
                            </button>
                            <input
                                type="number"
                                min={1}
                                max={MAX_POSTS_PER_DAY}
                                value={draft.post_times.length}
                                onChange={(e) => set_count(parseInt(e.target.value || '1', 10))}
                                className="input-field text-center flex-1 min-w-0"
                            />
                            <button type="button" onClick={() => set_count(draft.post_times.length + 1)}
                                className="p-2 rounded-xl border border-border-subtle text-text-muted hover:text-text-main">
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                </section>

                <section className="space-y-2">
                    <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">
                        Post times · {draft.post_times.length} per {per_label}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {draft.post_times.map((t, i) => (
                            <div key={i} className="space-y-2">
                                <p className="text-[11px] text-text-muted">{ordinal(i + 1)} post time</p>
                                <ThemedTimePicker value={t} onChange={(v) => set_time(i, v)} />
                            </div>
                        ))}
                    </div>
                    <p className="text-[11px] text-text-muted">Times are in your timezone ({browser_tz}).</p>
                </section>

                {draft.frequency === 'every_week' && (
                    <section className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Weekdays</label>
                        <div className="flex flex-wrap gap-2">
                            {WEEKDAY_OPTIONS.map(wd => {
                                const sel = draft.weekdays.includes(wd.value);
                                return (
                                    <button key={wd.value} type="button" onClick={() => toggle_weekday(wd.value)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${sel
                                            ? 'border-brand-blue/60 bg-brand-blue/10 text-brand-blue'
                                            : 'border-border-subtle text-text-muted hover:text-text-main'}`}>
                                        {wd.short}
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                )}

                {draft.frequency === 'every_month' && (
                    <section className="space-y-2">
                        <label className="text-[11px] uppercase font-bold text-text-muted tracking-wider">Days of month</label>
                        <div className="grid grid-cols-7 sm:grid-cols-10 gap-1">
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
                                const sel = draft.month_days.includes(d);
                                return (
                                    <button key={d} type="button" onClick={() => toggle_month_day(d)}
                                        className={`py-1.5 rounded-lg text-[11px] font-bold border ${sel
                                            ? 'border-brand-blue/60 bg-brand-blue/10 text-brand-blue'
                                            : 'border-border-subtle text-text-muted hover:text-text-main'}`}>
                                        {d}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[11px] text-text-muted">Days a month doesn't have (e.g. 31) post on its last day.</p>
                    </section>
                )}

                {/* Auto generate — always on, read-only */}
                <div className="flex items-center gap-3 rounded-xl border border-border-subtle px-4 py-3">
                    <Sparkles size={18} className="text-purple-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-main flex items-center gap-1.5">
                            Auto generate content <Lock size={12} className="text-text-muted" />
                        </p>
                        <p className="text-xs text-text-muted">AI writes every post (thought + emojis + hashtags). Always on.</p>
                    </div>
                    <Switch checked disabled onChange={() => { /* read-only */ }} title="Always on" />
                </div>

                {validation_error && <p className="text-xs text-amber-400">{validation_error}</p>}

                <div className="flex justify-end">
                    <button
                        onClick={on_save}
                        disabled={!dirty || saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        Save settings
                    </button>
                </div>
            </div>

            {/* Preview / Post now */}
            <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                    <p className="font-semibold text-text-main">Try it</p>
                    <div className="flex gap-2">
                        <button onClick={on_preview} disabled={previewing}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle text-sm text-text-main hover:bg-text-muted/10 disabled:opacity-50">
                            {previewing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            Generate preview
                        </button>
                        <button onClick={on_post_now} disabled={posting || !fb_connected}
                            title={!fb_connected ? 'Connect Facebook first' : 'Generate a new post and publish now'}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                            {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            Post now
                        </button>
                    </div>
                </div>
                {preview ? (
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm text-text-main rounded-xl border border-border-subtle p-4">{preview}</pre>
                ) : (
                    <p className="text-sm text-text-muted">Generate a preview to see what an auto post looks like. Preview is not posted.</p>
                )}
            </div>

            {/* History */}
            <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="font-semibold text-text-main">Recent posts</p>
                    <button onClick={() => void load(true)} className="text-text-muted hover:text-text-main" title="Refresh">
                        <RefreshCw size={14} />
                    </button>
                </div>
                {state.logs.length === 0 && <p className="text-sm text-text-muted">No auto posts yet.</p>}
                {state.logs.map(log => (
                    <div key={log.id} className="rounded-xl border border-border-subtle p-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            {log.status === 'posted' && <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={14} /> Posted</span>}
                            {log.status === 'failed' && <span className="flex items-center gap-1 text-red-400"><XCircle size={14} /> Failed</span>}
                            {log.status === 'pending' && <span className="flex items-center gap-1 text-amber-400"><Clock size={14} /> Posting…</span>}
                            <span className="text-text-muted">
                                {log.slot_key.startsWith('manual:') ? 'Manual' : `Slot ${log.slot_key}`} · {new Date(log.posted_at ?? log.createdAt).toLocaleString()}
                            </span>
                            {log.post_url && (
                                <a href={log.post_url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-blue-400 hover:underline">
                                    View <ExternalLink size={12} />
                                </a>
                            )}
                        </div>
                        {log.content && <pre className="whitespace-pre-wrap break-words font-sans text-sm text-text-main">{log.content}</pre>}
                        {log.error_message && <p className="text-xs text-red-400">{log.error_message}</p>}
                    </div>
                ))}
            </div>
        </div>
    );
}
