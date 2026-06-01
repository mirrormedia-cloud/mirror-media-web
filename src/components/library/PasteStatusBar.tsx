/**
 * Bottom-of-page status bar that shows a paste-in-progress operation.
 * Replaces the toast notification because paste of a large folder /
 * many files can take seconds-to-minutes — a persistent bar is the
 * right affordance.
 *
 * Reads from the module-level paste status (so it survives folder
 * navigation while the API call is still in flight).
 */

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Loader2, Scissors, Copy } from 'lucide-react';
import { usePasteStatus } from '../../stores/local_uploads_clipboard';

export const PasteStatusBar: React.FC = () => {
    const status = usePasteStatus();
    const [elapsed_ms, set_elapsed_ms] = useState(0);

    useEffect(() => {
        if (!status) return;
        const id = setInterval(() => set_elapsed_ms(Date.now() - status.started_at), 200);
        set_elapsed_ms(Date.now() - status.started_at);
        return () => clearInterval(id);
    }, [status]);

    if (!status) return null;

    const seconds = Math.floor(elapsed_ms / 1000);
    const Icon = status.operation === 'move' ? Scissors : Copy;
    const verb = status.operation === 'move' ? 'Moving' : 'Copying';
    const tone = status.operation === 'move' ? 'text-amber-400' : 'text-brand-blue';

    const node = (
        <div className="fixed bottom-0 left-0 right-0 z-[1150] pointer-events-none">
            <div className="mx-auto max-w-3xl m-4 pointer-events-auto">
                {/* `bg-bg-main` (fully opaque) + ring + heavy shadow so
                    the busy file grid behind never bleeds through.
                    Previously the bar used the semi-transparent
                    `bg-bg-card` token and content leaked through. */}
                <div
                    className="rounded-2xl border border-border-subtle bg-bg-main ring-1 ring-black/30 backdrop-blur-md px-5 py-3 flex items-center gap-4"
                    style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
                >
                    <div className={`w-9 h-9 rounded-xl bg-bg-surface flex items-center justify-center shrink-0 ${tone}`}>
                        <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <Loader2 size={14} className={`${tone} animate-spin`} />
                            <p className="text-sm font-bold text-text-main">
                                {verb} {status.total} item{status.total === 1 ? '' : 's'}…
                            </p>
                            <span className="text-[11px] text-text-muted ml-auto whitespace-nowrap">
                                {seconds}s elapsed
                            </span>
                        </div>
                        <p className="text-[11px] text-text-muted mt-0.5 truncate" title={status.summary}>
                            {status.summary}
                        </p>
                        <div className="mt-2 h-1 bg-bg-surface rounded-full overflow-hidden relative">
                            <div className={`absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-brand-emerald to-transparent animate-[shimmer_1.4s_linear_infinite]`} />
                        </div>
                    </div>
                </div>
            </div>
            <style>{`
                @keyframes shimmer {
                    0%   { left: -33%; }
                    100% { left: 100%; }
                }
            `}</style>
        </div>
    );

    // Portal to document.body so transformed / overflow-clipped
    // ancestors can't trap it inside the grid stacking context.
    if (typeof document === 'undefined') return node;
    return ReactDOM.createPortal(node, document.body);
};
