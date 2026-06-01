/**
 * Time picker — two-column hour/minute popover, themed to the dashboard.
 *
 * Simple by design: a scrollable column of hours (00..23) and a column
 * of minutes (00..59). Click a row to commit it; the value
 * updates immediately so picking a new time is one or two clicks. The
 * active row sits behind the brand emerald → blue gradient so it's
 * always visible without needing a separate "Set" action.
 *
 * Value contract: "HH:MM" (24h), same as `<input type="time">`.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';

interface Props {
    value: string;
    onChange: (v: string) => void;
    /** Step (in minutes) between minute options. Defaults to 1. */
    minute_step?: number;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

function parse_hhmm(value: string): { h: number; m: number } | null {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!m) return null;
    return { h: Number(m[1]), m: Number(m[2]) };
}

const ROW_HEIGHT = 26;     // px — fixed so we can scrollIntoView precisely
const VISIBLE_ROWS = 5;    // height = 5 × 26 = 130px per column

export const ThemedTimePicker: React.FC<Props> = ({
    value,
    onChange,
    minute_step = 1,
    placeholder = '--:--',
    disabled = false,
    className = '',
}) => {
    const trigger_ref = useRef<HTMLButtonElement | null>(null);
    const popover_ref = useRef<HTMLDivElement | null>(null);
    const hour_col_ref = useRef<HTMLDivElement | null>(null);
    const minute_col_ref = useRef<HTMLDivElement | null>(null);
    const [open, set_open] = useState(false);
    const [coords, set_coords] = useState<{ top: number; left: number } | null>(null);

    const parsed = useMemo(() => parse_hhmm(value || ''), [value]);
    const cur_h = parsed?.h ?? -1;
    const cur_m = parsed?.m ?? -1;

    const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
    const minutes = useMemo(() => {
        const step = Math.max(1, Math.min(30, minute_step));
        const out: number[] = [];
        for (let m = 0; m < 60; m += step) out.push(m);
        return out;
    }, [minute_step]);

    // Position popover under the trigger.
    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const el = trigger_ref.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const popover_h = 200;
            const popover_w = 140;
            const space_below = window.innerHeight - rect.bottom;
            const top = space_below < popover_h && rect.top > popover_h
                ? rect.top - popover_h - 8
                : rect.bottom + 8;
            const max_left = window.innerWidth - popover_w - 12;
            const left = Math.min(Math.max(rect.left, 12), max_left);
            set_coords({ top, left });
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [open]);

    // Click outside / Escape closes.
    useEffect(() => {
        if (!open) return;
        const on_click = (e: MouseEvent) => {
            const t = e.target as Node;
            if (trigger_ref.current?.contains(t)) return;
            if (popover_ref.current?.contains(t)) return;
            set_open(false);
        };
        const on_key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') set_open(false);
        };
        document.addEventListener('mousedown', on_click);
        document.addEventListener('keydown', on_key);
        return () => {
            document.removeEventListener('mousedown', on_click);
            document.removeEventListener('keydown', on_key);
        };
    }, [open]);

    // Center the active row in each column when the popover opens — the
    // useEffect runs after the portal has mounted so the refs are live.
    useEffect(() => {
        if (!open) return;
        const center = (col: HTMLDivElement | null, idx: number) => {
            if (!col || idx < 0) return;
            const target = ROW_HEIGHT * idx - col.clientHeight / 2 + ROW_HEIGHT / 2;
            col.scrollTo({ top: Math.max(0, target), behavior: 'auto' });
        };
        // Wait one frame so the portal layout settles before measuring.
        const id = requestAnimationFrame(() => {
            center(hour_col_ref.current, hours.indexOf(cur_h >= 0 ? cur_h : 10));
            const minute_idx = minutes.indexOf(cur_m >= 0 ? Math.round(cur_m / minute_step) * minute_step : 0);
            center(minute_col_ref.current, minute_idx);
        });
        return () => cancelAnimationFrame(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const display = parsed ? `${pad2(parsed.h)}:${pad2(parsed.m)}` : '';

    const set_hour = (h: number) => {
        const m = parsed?.m ?? 0;
        onChange(`${pad2(h)}:${pad2(m)}`);
    };
    const set_minute = (m: number) => {
        const h = parsed?.h ?? 0;
        onChange(`${pad2(h)}:${pad2(m)}`);
    };

    const set_now = () => {
        const d = new Date();
        const m_round = Math.round(d.getMinutes() / minute_step) * minute_step;
        onChange(`${pad2(d.getHours())}:${pad2(Math.min(59, m_round))}`);
    };

    return (
        <>
            <button
                ref={trigger_ref}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && set_open(o => !o)}
                className={`input-field flex items-center justify-between gap-2 text-left ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${open ? 'ring-2 ring-brand-emerald/40 border-brand-emerald' : ''} ${className}`}
            >
                <span className={display ? 'text-text-main font-mono' : 'text-text-muted/70'}>
                    {display || placeholder}
                </span>
                <Clock size={16} className="text-text-muted shrink-0" />
            </button>

            {open && coords && typeof document !== 'undefined' && createPortal(
                <div
                    ref={popover_ref}
                    className="fixed z-[1200] animate-in fade-in zoom-in-95 duration-150 inline-block"
                    style={{ top: coords.top, left: coords.left }}
                >
                    <div className="bg-bg-surface/85 border border-border-subtle rounded-2xl shadow-2xl shadow-black/40 backdrop-blur-xl overflow-hidden inline-block">
                        {/* Header — compact: live value + Now shortcut */}
                        <div className="flex items-center justify-between gap-3 px-2.5 py-1 border-b border-border-subtle">
                            <span className="text-xs font-bold font-mono text-text-main tabular-nums">
                                {display || '--:--'}
                            </span>
                            <button
                                type="button"
                                onClick={set_now}
                                className="text-[9px] uppercase font-bold text-brand-emerald hover:text-brand-blue"
                            >
                                Now
                            </button>
                        </div>

                        {/* Two unlabeled columns with a centred ":" divider */}
                        <div className="flex items-stretch">
                            <Column
                                col_ref={hour_col_ref}
                                values={hours}
                                active={cur_h}
                                on_pick={set_hour}
                            />
                            <div className="flex items-center px-0.5 text-text-muted text-xs font-bold">:</div>
                            <Column
                                col_ref={minute_col_ref}
                                values={minutes}
                                active={cur_m}
                                on_pick={set_minute}
                            />
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end px-2.5 py-1 border-t border-border-subtle">
                            <button
                                type="button"
                                onClick={() => set_open(false)}
                                className="text-[10px] font-bold text-brand-emerald hover:text-brand-blue"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

const Column: React.FC<{
    col_ref: React.RefObject<HTMLDivElement | null>;
    values: number[];
    active: number;
    on_pick: (n: number) => void;
}> = ({ col_ref, values, active, on_pick }) => (
    <div
        ref={col_ref}
        className="overflow-y-auto py-1 px-1 scrollbar-hide"
        style={{ height: VISIBLE_ROWS * ROW_HEIGHT }}
    >
        {values.map(v => {
            const is_active = v === active;
            return (
                <button
                    key={v}
                    type="button"
                    onClick={() => on_pick(v)}
                    className={`block text-center text-xs font-mono transition-colors rounded-md tabular-nums ${
                        is_active
                            ? 'bg-brand-emerald/15 text-brand-emerald font-bold ring-1 ring-brand-emerald/40'
                            : 'text-text-main hover:bg-white/5'
                    }`}
                    style={{ height: ROW_HEIGHT, lineHeight: `${ROW_HEIGHT}px`, width: '2.4rem' }}
                >
                    {String(v).padStart(2, '0')}
                </button>
            );
        })}
    </div>
);

export default ThemedTimePicker;
