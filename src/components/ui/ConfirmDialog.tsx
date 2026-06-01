/**
 * Themed replacement for window.confirm / window.alert.
 *
 * Mounted once via <ConfirmProvider> at the app root. Anywhere in the
 * tree:
 *
 *     const confirm = useConfirm();
 *     const ok = await confirm({ title: 'Delete?', message: '…', danger: true });
 *     if (ok) { ... }
 *
 * Or for an alert (single OK button):
 *
 *     await confirm({ title: 'Saved', message: '…', kind: 'alert' });
 *
 * Resolves `true` on confirm and `false` on cancel / close. Always
 * resolves — never rejects — so callers can `await` without try/catch.
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ConfirmKind = 'confirm' | 'alert';
export type ConfirmTone = 'default' | 'danger' | 'warning' | 'info' | 'success';

export interface ConfirmOptions {
    title?: string;
    message?: React.ReactNode;
    /** "OK" by default, "Delete" / etc. for destructive flows. */
    confirm_label?: string;
    cancel_label?: string;
    /** When true, the confirm button is red and the icon is the warning glyph. */
    danger?: boolean;
    /** Visual tone for the icon + accent. Overrides `danger` if provided. */
    tone?: ConfirmTone;
    /** Single-button alert (no Cancel). */
    kind?: ConfirmKind;
}

interface DialogState extends ConfirmOptions {
    open: boolean;
    resolve: (ok: boolean) => void;
}

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
    const ctx = useContext(ConfirmContext);
    if (!ctx) {
        // Dev-time guard: surface the missing-provider error loudly so
        // callers don't get a silent no-op confirm that always resolves
        // false.
        throw new Error('useConfirm() called outside <ConfirmProvider>');
    }
    return ctx;
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, set_state] = useState<DialogState | null>(null);

    const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            set_state({ ...opts, open: true, resolve });
        });
    }, []);

    const close = useCallback((ok: boolean) => {
        set_state(prev => {
            if (!prev) return prev;
            // Resolve outside the setter so React doesn't batch a render
            // around the resolution promise.
            queueMicrotask(() => prev.resolve(ok));
            return null;
        });
    }, []);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <ConfirmDialog state={state} on_close={close} />
        </ConfirmContext.Provider>
    );
};

const ConfirmDialog: React.FC<{
    state: DialogState | null;
    on_close: (ok: boolean) => void;
}> = ({ state, on_close }) => {
    const confirm_btn_ref = useRef<HTMLButtonElement | null>(null);

    // Focus the confirm button on open + handle Enter/Esc.
    useEffect(() => {
        if (!state) return;
        const id = window.setTimeout(() => confirm_btn_ref.current?.focus(), 30);
        // Capture-phase listener so we win the keystroke before any
        // page-level keydown handler (e.g. LibraryBrowserPage's window
        // listener that navigates into the selected folder/item on Enter).
        // stopPropagation prevents the keystroke from leaking to those
        // listeners — a modal must own its own keys.
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                on_close(false);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                on_close(true);
            }
        };
        document.addEventListener('keydown', handler, true);
        return () => {
            window.clearTimeout(id);
            document.removeEventListener('keydown', handler, true);
        };
    }, [state, on_close]);

    if (!state) return null;

    const tone: ConfirmTone = state.tone ?? (state.danger ? 'danger' : 'default');
    const is_alert = state.kind === 'alert';

    const Icon = tone === 'danger' || tone === 'warning' ? AlertTriangle
        : tone === 'success' ? CheckCircle2
        : Info;
    const icon_tone = tone === 'danger' ? 'text-red-400 bg-red-500/15'
        : tone === 'warning' ? 'text-amber-400 bg-amber-400/15'
        : tone === 'success' ? 'text-brand-emerald bg-brand-emerald/15'
        : tone === 'info' ? 'text-brand-blue bg-brand-blue/15'
        : 'text-text-muted bg-bg-surface';
    const confirm_btn_class = tone === 'danger'
        ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/30'
        : tone === 'warning'
            ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-lg shadow-amber-500/30'
            : 'bg-gradient-to-r from-brand-emerald to-brand-blue text-white shadow-lg shadow-brand-emerald/30';

    return (
        <div
            className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => on_close(false)}
        >
            <div
                className="relative w-full max-w-md rounded-3xl border border-border-subtle bg-bg-card shadow-2xl p-6 animate-in zoom-in-95 fade-in duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={() => on_close(false)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-bg-surface transition-colors"
                    aria-label="Close"
                >
                    <X size={16} />
                </button>
                <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${icon_tone}`}>
                        <Icon size={22} />
                    </div>
                    <div className="min-w-0 flex-1 pt-1">
                        {state.title && (
                            <h3 className="text-lg font-bold text-text-main leading-tight">{state.title}</h3>
                        )}
                        {state.message && (
                            <div className="mt-2 text-sm text-text-muted whitespace-pre-line leading-relaxed">
                                {state.message}
                            </div>
                        )}
                    </div>
                </div>
                <div className="mt-6 flex items-center justify-end gap-2">
                    {!is_alert && (
                        <button
                            type="button"
                            onClick={() => on_close(false)}
                            className="px-4 py-2 rounded-xl bg-bg-surface border border-border-subtle text-text-main text-sm font-bold hover:border-text-muted/40 transition-colors"
                        >
                            {state.cancel_label ?? 'Cancel'}
                        </button>
                    )}
                    <button
                        ref={confirm_btn_ref}
                        type="button"
                        onClick={() => on_close(true)}
                        className={`px-5 py-2 rounded-xl text-sm font-bold transition-transform hover:scale-[1.02] ${confirm_btn_class}`}
                    >
                        {state.confirm_label ?? (is_alert ? 'OK' : 'Confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
};
