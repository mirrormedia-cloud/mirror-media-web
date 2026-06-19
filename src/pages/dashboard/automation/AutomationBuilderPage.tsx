import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    ArrowLeft, Plus, X, Loader2, MessageCircle, Send, ChevronDown,
    Instagram, Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    automation_service,
    AutomationButton,
    CreateAutomationPayload,
} from '../../../services/automation_service';
import { social_service, SocialAccount } from '../../../services/social_service';

const DEFAULT_DM = 'Hey 👋\n\nThanks for your interest!\n\nClick below for more details.';
const DEFAULT_REPLY = 'Thanks for your comment! Check your DM for details 📩';

interface FormState {
    ig_account_id: string;
    trigger_keywords: string[];
    comment_reply_text: string;
    dm_text: string;
    buttons: AutomationButton[];
    status: 'active' | 'inactive';
}

export default function AutomationBuilderPage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id?: string }>();
    const is_edit = !!id && id !== 'new';

    const [saving, set_saving] = useState(false);
    const [loading, set_loading] = useState(is_edit);
    const [ig_accounts, set_ig_accounts] = useState<SocialAccount[]>([]);
    const [kw_input, set_kw_input] = useState('');

    const [form, set_form] = useState<FormState>({
        ig_account_id: '',
        trigger_keywords: [],
        comment_reply_text: DEFAULT_REPLY,
        dm_text: DEFAULT_DM,
        buttons: [],
        status: 'active',
    });

    const kw_ref = useRef<HTMLInputElement>(null);

    const load_accounts = useCallback(async () => {
        const res = await social_service.list_accounts();
        if (res.success) {
            const ig = (res.data?.accounts ?? []).filter(a => a.platform === 'instagram' && a.status === 'connected');
            set_ig_accounts(ig);
            if (!is_edit && ig.length > 0) {
                set_form(prev => ({ ...prev, ig_account_id: ig[0].account_id ?? '' }));
            }
        }
    }, [is_edit]);

    const load_rule = useCallback(async () => {
        if (!id || !is_edit) return;
        set_loading(true);
        try {
            const res = await automation_service.get_rule(id);
            if (!res.success || !res.data) throw new Error(res.message);
            const r = res.data;
            set_form({
                ig_account_id: r.ig_account_id,
                trigger_keywords: r.trigger_keywords,
                comment_reply_text: r.comment_reply.text,
                dm_text: r.dm_message.text,
                buttons: r.dm_message.buttons ?? [],
                status: r.status,
            });
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to load automation');
            navigate('/dashboard/automation');
        } finally {
            set_loading(false);
        }
    }, [id, is_edit, navigate]);

    useEffect(() => {
        void load_accounts();
        void load_rule();
    }, [load_accounts, load_rule]);

    // ── Keyword helpers ───────────────────────────────────────────────────────

    function add_keyword(raw: string) {
        const words = raw.split(/,+/).map(w => w.trim().toLowerCase()).filter(Boolean);
        if (!words.length) return;
        set_form(prev => ({
            ...prev,
            trigger_keywords: [...new Set([...prev.trigger_keywords, ...words])],
        }));
        set_kw_input('');
    }

    function remove_keyword(kw: string) {
        set_form(prev => ({ ...prev, trigger_keywords: prev.trigger_keywords.filter(k => k !== kw) }));
    }

    function on_kw_key(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add_keyword(e.currentTarget.value);
        }
    }

    // ── Button helpers ────────────────────────────────────────────────────────

    function add_button() {
        set_form(prev => ({
            ...prev,
            buttons: [...prev.buttons, { title: '', action: 'url', url: '' }],
        }));
    }

    function update_button(idx: number, field: keyof AutomationButton, value: string) {
        set_form(prev => ({
            ...prev,
            buttons: prev.buttons.map((b, i) => i === idx ? { ...b, [field]: value } : b),
        }));
    }

    function remove_button(idx: number) {
        set_form(prev => ({ ...prev, buttons: prev.buttons.filter((_, i) => i !== idx) }));
    }

    // ── Save ──────────────────────────────────────────────────────────────────

    async function handle_save() {
        if (!form.ig_account_id) return toast.error('Select an Instagram account');
        if (form.trigger_keywords.length === 0) return toast.error('Add at least one keyword');
        if (!form.comment_reply_text.trim()) return toast.error('Enter a comment reply');
        if (!form.dm_text.trim()) return toast.error('Enter a DM message');

        const invalid_btn = form.buttons.findIndex(b => !b.title.trim());
        if (invalid_btn !== -1) return toast.error(`Button ${invalid_btn + 1} needs a title`);

        set_saving(true);
        try {
            const payload: CreateAutomationPayload = {
                ig_account_id: form.ig_account_id,
                trigger_keywords: form.trigger_keywords,
                comment_reply: { text: form.comment_reply_text },
                dm_message: { text: form.dm_text, buttons: form.buttons },
                status: form.status,
            };

            if (is_edit) {
                await automation_service.update_rule(id!, {
                    trigger_keywords: payload.trigger_keywords,
                    comment_reply: payload.comment_reply,
                    dm_message: payload.dm_message,
                    status: payload.status,
                });
                toast.success('Automation updated');
            } else {
                await automation_service.create_rule(payload);
                toast.success('Automation created');
            }
            navigate('/dashboard/automation');
        } catch (err: any) {
            toast.error(err?.response?.data?.message ?? err?.message ?? 'Failed to save');
        } finally {
            set_saving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={28} className="animate-spin text-text-muted" />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-6xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <button
                    onClick={() => navigate('/dashboard/automation')}
                    className="p-2 rounded-lg hover:bg-bg-surface text-text-muted hover:text-text-main transition-colors"
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-text-main">
                        {is_edit ? 'Edit Automation' : 'New Comment Automation'}
                    </h1>
                    <p className="text-sm text-text-muted">Auto-reply to comments and send DMs based on keywords</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* ── Left: Configuration ───────────────────────────────── */}
                <div className="space-y-6">

                    {/* Account */}
                    <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Instagram size={16} className="text-purple-400" />
                            <h2 className="font-semibold text-text-main text-sm">Instagram Account</h2>
                        </div>
                        {ig_accounts.length === 0 ? (
                            <p className="text-sm text-amber-400">No connected Instagram accounts found. <button onClick={() => navigate('/dashboard/social-accounts')} className="underline">Connect now</button></p>
                        ) : (
                            <div className="relative">
                                <select
                                    value={form.ig_account_id}
                                    onChange={e => set_form(prev => ({ ...prev, ig_account_id: e.target.value }))}
                                    className="w-full appearance-none rounded-lg border border-border-subtle bg-bg-main px-3 py-2.5 text-sm text-text-main pr-8 focus:outline-none focus:border-purple-500"
                                    disabled={is_edit}
                                >
                                    <option value="">Select account…</option>
                                    {ig_accounts.map(acc => (
                                        <option key={acc.id} value={acc.account_id ?? ''}>
                                            {acc.account_name ?? acc.account_id ?? acc.id}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                            </div>
                        )}
                    </div>

                    {/* Trigger Keywords */}
                    <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <MessageCircle size={16} className="text-purple-400" />
                            <h2 className="font-semibold text-text-main text-sm">Trigger Keywords</h2>
                        </div>
                        <p className="text-xs text-text-muted">When a comment contains any of these words, the automation fires.</p>

                        {/* Tag display */}
                        <div
                            className="min-h-[44px] flex flex-wrap gap-2 p-2 rounded-lg border border-border-subtle bg-bg-main cursor-text"
                            onClick={() => kw_ref.current?.focus()}
                        >
                            {form.trigger_keywords.map(kw => (
                                <span key={kw} className="flex items-center gap-1 px-2 py-1 rounded-md bg-purple-500/15 text-purple-300 text-xs font-medium">
                                    {kw}
                                    <button onClick={() => remove_keyword(kw)} className="hover:text-red-400 transition-colors">
                                        <X size={10} />
                                    </button>
                                </span>
                            ))}
                            <input
                                ref={kw_ref}
                                value={kw_input}
                                onChange={e => set_kw_input(e.target.value)}
                                onKeyDown={on_kw_key}
                                onBlur={e => e.target.value.trim() && add_keyword(e.target.value)}
                                placeholder={form.trigger_keywords.length === 0 ? 'Type keywords — press Space or Enter to add…' : 'Add more…'}
                                className="flex-1 min-w-[120px] bg-transparent text-sm text-text-main placeholder:text-text-muted focus:outline-none"
                            />
                        </div>
                        <p className="text-[11px] text-text-muted">Example: price, buy, offer, discount</p>
                    </div>

                    {/* Comment Reply */}
                    <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <MessageCircle size={16} className="text-blue-400" />
                            <h2 className="font-semibold text-text-main text-sm">Comment Reply</h2>
                        </div>
                        <p className="text-xs text-text-muted">This message is posted as a public reply to the comment.</p>
                        <textarea
                            value={form.comment_reply_text}
                            onChange={e => set_form(prev => ({ ...prev, comment_reply_text: e.target.value }))}
                            rows={3}
                            placeholder="Thanks for commenting! Check your DM 📩"
                            className="w-full rounded-lg border border-border-subtle bg-bg-main px-3 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-purple-500 resize-none"
                        />
                    </div>

                    {/* DM Message */}
                    <div className="rounded-xl border border-border-subtle bg-bg-surface p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <Send size={16} className="text-green-400" />
                            <h2 className="font-semibold text-text-main text-sm">DM Message</h2>
                        </div>
                        <p className="text-xs text-text-muted">Sent as a private direct message after the comment reply.</p>
                        <textarea
                            value={form.dm_text}
                            onChange={e => set_form(prev => ({ ...prev, dm_text: e.target.value }))}
                            rows={5}
                            placeholder={DEFAULT_DM}
                            className="w-full rounded-lg border border-border-subtle bg-bg-main px-3 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-purple-500 resize-none"
                        />

                        {/* Buttons */}
                        <div className="space-y-2 pt-1">
                            <p className="text-xs font-medium text-text-muted">Buttons (shown as links in DM)</p>
                            {form.buttons.map((btn, i) => (
                                <div key={i} className="flex gap-2">
                                    <input
                                        value={btn.title}
                                        onChange={e => update_button(i, 'title', e.target.value)}
                                        placeholder="Button title"
                                        className="flex-1 rounded-lg border border-border-subtle bg-bg-main px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-purple-500"
                                    />
                                    <input
                                        value={btn.url ?? ''}
                                        onChange={e => update_button(i, 'url', e.target.value)}
                                        placeholder="https://…"
                                        className="flex-1 rounded-lg border border-border-subtle bg-bg-main px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-purple-500"
                                    />
                                    <button
                                        onClick={() => remove_button(i)}
                                        className="p-2 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={add_button}
                                className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
                            >
                                <Plus size={14} />
                                Add Button
                            </button>
                        </div>
                    </div>

                    {/* Status + Save */}
                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={form.status === 'active'}
                                onChange={e => set_form(prev => ({ ...prev, status: e.target.checked ? 'active' : 'inactive' }))}
                                className="w-4 h-4 accent-purple-500"
                            />
                            <span className="text-sm text-text-main">Active</span>
                        </label>
                        <button
                            onClick={handle_save}
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                        >
                            {saving && <Loader2 size={15} className="animate-spin" />}
                            {saving ? 'Saving…' : is_edit ? 'Update Automation' : 'Save Automation'}
                        </button>
                    </div>
                </div>

                {/* ── Right: Preview ────────────────────────────────────── */}
                <div className="space-y-4 lg:sticky lg:top-8 self-start">
                    <div className="flex items-center gap-2">
                        <Smartphone size={16} className="text-text-muted" />
                        <h2 className="font-semibold text-text-main text-sm">Live Preview</h2>
                    </div>

                    {/* Phone frame */}
                    <div className="rounded-3xl border-2 border-border-subtle bg-bg-main overflow-hidden">
                        {/* Status bar */}
                        <div className="h-8 bg-bg-surface flex items-center justify-between px-5">
                            <span className="text-[10px] text-text-muted font-medium">Instagram</span>
                            <Instagram size={12} className="text-text-muted" />
                        </div>

                        {/* Comment section */}
                        <div className="p-4 border-b border-border-subtle">
                            <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-3">Comment Section</p>

                            {/* User comment */}
                            <div className="flex items-start gap-2 mb-3">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 shrink-0 flex items-center justify-center text-[10px] text-white font-bold">U</div>
                                <div>
                                    <p className="text-[11px] font-semibold text-text-main">user</p>
                                    <p className="text-xs text-text-main mt-0.5">
                                        {form.trigger_keywords[0] ?? 'price'}
                                    </p>
                                </div>
                            </div>

                            {/* Bot reply */}
                            {form.comment_reply_text && (
                                <div className="flex items-start gap-2 ml-4">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 shrink-0 flex items-center justify-center text-[9px] text-white font-bold">B</div>
                                    <div>
                                        <p className="text-[11px] font-semibold text-purple-400">your_account</p>
                                        <p className="text-xs text-text-main mt-0.5 whitespace-pre-wrap">{form.comment_reply_text}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* DM section */}
                        <div className="p-4">
                            <p className="text-[10px] text-text-muted uppercase font-bold tracking-wider mb-3">Direct Message</p>

                            {/* Received message (user's first DM / echo) */}
                            <div className="flex justify-start mb-3">
                                <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-bg-surface px-3 py-2">
                                    <p className="text-xs text-text-main">{form.trigger_keywords[0] ?? 'price'}</p>
                                </div>
                            </div>

                            {/* Bot DM reply — button template style */}
                            {form.dm_text && (
                                <div className="flex justify-end">
                                    <div className="max-w-[82%] space-y-1">
                                        <div className={`bg-bg-surface px-3 py-2.5 shadow-sm ${form.buttons.length > 0 ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-tr-sm'}`}>
                                            <p className="text-xs text-text-main whitespace-pre-wrap leading-relaxed">{form.dm_text}</p>
                                        </div>
                                        {form.buttons.length > 0 && (
                                            <div className="space-y-0.5">
                                                {form.buttons.slice(0, 3).map((btn, i) => (
                                                    <div
                                                        key={i}
                                                        className={`bg-bg-surface border border-border-subtle px-3 py-2 text-center shadow-sm ${i === form.buttons.length - 1 ? 'rounded-b-2xl' : ''} ${i === 0 ? 'rounded-t-sm' : ''}`}
                                                    >
                                                        <p className="text-xs text-blue-400 font-semibold">{btn.title || 'Button'}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Input bar */}
                        <div className="h-10 bg-bg-surface border-t border-border-subtle flex items-center px-4 gap-2">
                            <div className="flex-1 h-6 rounded-full bg-bg-main border border-border-subtle" />
                            <Send size={14} className="text-text-muted" />
                        </div>
                    </div>

                    <p className="text-[11px] text-text-muted text-center">
                        Buttons render as tappable cards in the Instagram DM (max 3).
                    </p>
                </div>
            </div>
        </div>
    );
}
