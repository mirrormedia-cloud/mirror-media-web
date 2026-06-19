import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Instagram, Facebook, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { automation_service, AutomationRule } from '../../../services/automation_service';
import { social_service, SocialAccount } from '../../../services/social_service';
import { useConfirm } from '../../../components/ui/ConfirmDialog';

export default function AutomationPage() {
    const navigate = useNavigate();
    const confirm = useConfirm();
    const [loading, set_loading] = useState(true);
    const [rules, set_rules] = useState<AutomationRule[]>([]);
    const [accounts, set_accounts] = useState<SocialAccount[]>([]);

    const load = useCallback(async () => {
        set_loading(true);
        try {
            const [rules_res, accounts_res] = await Promise.all([
                automation_service.list_rules(),
                social_service.list_accounts(),
            ]);
            if (rules_res.success) set_rules(rules_res.data ?? []);
            if (accounts_res.success) set_accounts(accounts_res.data?.accounts ?? []);
        } catch {
            toast.error('Failed to load automation rules');
        } finally {
            set_loading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const fb_connected = accounts.some(a => a.platform === 'facebook' && a.status === 'connected');
    const ig_connected = accounts.some(a => a.platform === 'instagram' && a.status === 'connected');
    const accounts_ready = fb_connected && ig_connected;

    async function toggle_status(rule: AutomationRule) {
        const new_status = rule.status === 'active' ? 'inactive' : 'active';
        try {
            await automation_service.update_rule(rule.id, { status: new_status });
            set_rules(prev => prev.map(r => r.id === rule.id ? { ...r, status: new_status } : r));
        } catch {
            toast.error('Failed to update status');
        }
    }

    async function delete_rule(rule: AutomationRule) {
        const ok = await confirm({
            title: 'Delete Automation',
            message: `Delete this automation rule? This cannot be undone.`,
            confirmLabel: 'Delete',
            danger: true,
        });
        if (!ok) return;
        try {
            await automation_service.delete_rule(rule.id);
            set_rules(prev => prev.filter(r => r.id !== rule.id));
            toast.success('Deleted');
        } catch {
            toast.error('Failed to delete');
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
        <div className="p-8 space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                        <Zap size={20} className="text-purple-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-text-main">Automation</h1>
                        <p className="text-sm text-text-muted">Auto-reply to comments and send DMs based on keywords</p>
                    </div>
                </div>
                {accounts_ready && (
                    <button
                        onClick={() => navigate('/dashboard/automation/new')}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
                    >
                        <Plus size={16} />
                        New Automation
                    </button>
                )}
            </div>

            {/* Account connection check */}
            {!accounts_ready && (
                <div className="rounded-xl border border-border-subtle bg-bg-surface p-6 flex flex-col items-center gap-4 text-center">
                    <AlertCircle size={36} className="text-amber-400" />
                    <div>
                        <p className="font-semibold text-text-main mb-1">Connect your accounts first</p>
                        <p className="text-sm text-text-muted">
                            Please connect both your{' '}
                            <span className={fb_connected ? 'text-blue-400' : 'text-text-muted line-through'}>Facebook</span>
                            {' '}and{' '}
                            <span className={ig_connected ? 'text-purple-400' : 'text-text-muted line-through'}>Instagram</span>
                            {' '}accounts to use automation features.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate('/dashboard/social-accounts')}
                        className="px-5 py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium transition-colors"
                    >
                        Connect Account
                    </button>
                </div>
            )}

            {/* Automation type cards */}
            {accounts_ready && rules.length === 0 && (
                <div
                    onClick={() => navigate('/dashboard/automation/new')}
                    className="rounded-xl border-2 border-dashed border-border-subtle hover:border-purple-500/50 p-8 flex flex-col items-center gap-3 text-center cursor-pointer transition-colors group"
                >
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                        <Zap size={24} className="text-purple-400" />
                    </div>
                    <div>
                        <p className="font-semibold text-text-main">Comments Automation</p>
                        <p className="text-sm text-text-muted mt-1">Trigger replies and DMs when users comment with specific keywords</p>
                    </div>
                    <span className="text-xs text-purple-400 font-medium">+ Create first automation</span>
                </div>
            )}

            {/* Rules list */}
            {rules.length > 0 && (
                <div className="space-y-3">
                    {rules.map(rule => (
                        <div key={rule.id} className="rounded-xl border border-border-subtle bg-bg-surface p-5 flex items-start gap-4">
                            <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
                                {rule.platform === 'instagram'
                                    ? <Instagram size={16} className="text-purple-400" />
                                    : <Facebook size={16} className="text-blue-400" />
                                }
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-text-main capitalize">{rule.type} Automation</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rule.status === 'active' ? 'bg-green-500/15 text-green-400' : 'bg-text-muted/15 text-text-muted'}`}>
                                        {rule.status}
                                    </span>
                                </div>
                                <p className="text-xs text-text-muted mb-2">
                                    Keywords: <span className="text-text-main">{rule.trigger_keywords.join(', ')}</span>
                                </p>
                                <p className="text-xs text-text-muted truncate">
                                    Reply: <span className="text-text-main">{rule.comment_reply.text}</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => toggle_status(rule)}
                                    className="text-text-muted hover:text-purple-400 transition-colors"
                                    title={rule.status === 'active' ? 'Deactivate' : 'Activate'}
                                >
                                    {rule.status === 'active'
                                        ? <ToggleRight size={22} className="text-purple-400" />
                                        : <ToggleLeft size={22} />
                                    }
                                </button>
                                <button
                                    onClick={() => navigate(`/dashboard/automation/${rule.id}/edit`)}
                                    className="text-text-muted hover:text-text-main transition-colors"
                                    title="Edit"
                                >
                                    <Edit2 size={16} />
                                </button>
                                <button
                                    onClick={() => delete_rule(rule)}
                                    className="text-text-muted hover:text-red-400 transition-colors"
                                    title="Delete"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
