/**
 * Date input with a custom dark-themed calendar popover.
 *
 * Native <input type="date"> exposes only `color-scheme` to CSS — its grid /
 * weekday / today highlight all come from the OS, so we can't paint them in
 * brand colors. This component replicates just enough of the native widget
 * (month nav, day grid, today / clear) to live inside the dashboard's dark
 * surface and use the emerald → blue gradient on selected/today cells.
 *
 * Value contract: `YYYY-MM-DD` strings, same as the native input — drops in
 * for `<input type="date">` without payload changes.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Props {
    value: string;
    onChange: (v: string) => void;
    min?: string;
    max?: string;
    placeholder?: string;
    disabled?: boolean;
    /** Defaults to "DD-MM-YYYY" — matches the native input on en-IN/en-GB. */
    display_format?: DisplayFormat;
    /** xs = compact inline chip; sm = slightly smaller; md = default */
    size?: 'xs' | 'sm' | 'md';
    className?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad2(n: number) { return String(n).padStart(2, '0'); }

function parse_iso(value: string): Date | null {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    return new Date(y, mo - 1, d, 0, 0, 0, 0);
}

function to_iso(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

type DisplayFormat = 'DD-MM-YYYY' | 'YYYY-MM-DD' | 'MM-DD-YYYY';

function format_display(value: string, fmt: DisplayFormat | undefined): string {
    const d = parse_iso(value);
    if (!d) return '';
    const yyyy = String(d.getFullYear());
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    if (fmt === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
    if (fmt === 'MM-DD-YYYY') return `${mm}-${dd}-${yyyy}`;
    return `${dd}-${mm}-${yyyy}`;
}

function start_of_month(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function add_months(d: Date, delta: number): Date {
    return new Date(d.getFullYear(), d.getMonth() + delta, 1, 0, 0, 0, 0);
}

function days_in_grid(view_month: Date): { date: Date; in_month: boolean }[] {
    // Always render 6 rows × 7 cols = 42 cells so the height stays stable
    // when stepping months. Leading cells come from the previous month;
    // trailing from the next.
    const first = start_of_month(view_month);
    const start_weekday = first.getDay(); // 0 = Sun
    const cells: { date: Date; in_month: boolean }[] = [];
    const grid_start = new Date(first);
    grid_start.setDate(first.getDate() - start_weekday);
    for (let i = 0; i < 42; i += 1) {
        const dt = new Date(grid_start);
        dt.setDate(grid_start.getDate() + i);
        cells.push({ date: dt, in_month: dt.getMonth() === view_month.getMonth() });
    }
    return cells;
}

function same_day(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

export const ThemedDatePicker: React.FC<Props> = ({
    value,
    onChange,
    min,
    max,
    size = 'md',
    placeholder = 'Pick a date',
    disabled = false,
    display_format = 'DD-MM-YYYY',
    className = '',
}) => {
    const trigger_ref = useRef<HTMLButtonElement | null>(null);
    const popover_ref = useRef<HTMLDivElement | null>(null);
    const [open, set_open] = useState(false);
    const [view_month, set_view_month] = useState<Date>(() => parse_iso(value) ?? new Date());
    const [coords, set_coords] = useState<{ top: number; left: number; width: number } | null>(null);

    // When the value changes from outside, jump the visible month to it.
    useEffect(() => {
        const parsed = parse_iso(value);
        if (parsed) set_view_month(start_of_month(parsed));
    }, [value]);

    // Position popover under the trigger using viewport coords. Re-runs
    // on open + window resize/scroll so the popup tracks the field even
    // when the host modal is scrolled.
    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const el = trigger_ref.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            // Default below; flip above if it would clip the viewport.
            const popover_h = 340;
            const space_below = window.innerHeight - rect.bottom;
            const top = space_below < popover_h && rect.top > popover_h
                ? rect.top - popover_h - 8
                : rect.bottom + 8;
            set_coords({ top, left: rect.left, width: rect.width });
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

    const min_date = useMemo(() => parse_iso(min || ''), [min]);
    const max_date = useMemo(() => parse_iso(max || ''), [max]);
    const selected_date = useMemo(() => parse_iso(value || ''), [value]);
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);

    const cells = useMemo(() => days_in_grid(view_month), [view_month]);

    const is_disabled = (d: Date) => {
        if (min_date && d < min_date) return true;
        if (max_date && d > max_date) return true;
        return false;
    };

    const display = format_display(value, display_format as DisplayFormat);

    const handle_pick = (d: Date) => {
        if (is_disabled(d)) return;
        onChange(to_iso(d));
        set_open(false);
    };

    const trigger_padding = size === 'xs' ? 'py-1 px-2.5 text-[11px]'
        : size === 'sm' ? 'py-1.5 px-3 text-xs'
        : 'py-2.5 px-4 text-sm';

    return (
        <>
            <button
                ref={trigger_ref}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && set_open(o => !o)}
                className={`input-field flex items-center justify-between gap-2 text-left ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${open ? 'ring-2 ring-brand-emerald/40 border-brand-emerald' : ''} ${className} ${trigger_padding}`}
            >
                <span className={display ? 'text-text-main' : 'text-text-muted/70'}>
                    {display || placeholder}
                </span>
                <Calendar size={16} className="text-text-muted shrink-0" />
            </button>

            {open && coords && typeof document !== 'undefined' && createPortal(
                <div
                    ref={popover_ref}
                    className="fixed z-[1200] animate-in fade-in zoom-in-95 duration-150"
                    style={{ top: coords.top, left: coords.left, minWidth: Math.max(coords.width, 280) }}
                >
                    <div className="bg-bg-aside border border-border-subtle rounded-2xl shadow-2xl shadow-black/40 backdrop-blur-xl overflow-hidden">
                        {/* Month nav */}
                        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-subtle">
                            <button
                                type="button"
                                onClick={() => set_view_month(m => add_months(m, -1))}
                                className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/5"
                                title="Previous month"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <div className="text-sm font-bold text-text-main">
                                {MONTH_NAMES[view_month.getMonth()]} {view_month.getFullYear()}
                            </div>
                            <button
                                type="button"
                                onClick={() => set_view_month(m => add_months(m, 1))}
                                className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/5"
                                title="Next month"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>

                        {/* Weekday header */}
                        <div className="grid grid-cols-7 px-2 pt-2 text-center">
                            {WEEKDAYS.map(w => (
                                <div key={w} className="text-[10px] uppercase font-bold text-text-muted tracking-wider py-1">
                                    {w}
                                </div>
                            ))}
                        </div>

                        {/* Day grid */}
                        <div className="grid grid-cols-7 px-2 pb-2 gap-1.5">
                            {cells.map((c, i) => {
                                const is_today = same_day(c.date, today);
                                const is_selected = selected_date ? same_day(c.date, selected_date) : false;
                                const disabled_cell = is_disabled(c.date);
                                const base = 'aspect-square flex items-center justify-center text-xs rounded-lg transition-colors relative';
                                const tone = !c.in_month
                                    ? 'text-text-muted/35'
                                    : disabled_cell
                                        ? 'text-text-muted/30 cursor-not-allowed'
                                        : 'text-text-main hover:bg-white/5';
                                const accent = is_selected
                                    ? 'bg-gradient-to-br from-brand-emerald to-brand-blue text-white font-bold shadow-md hover:from-brand-emerald hover:to-brand-blue'
                                    : is_today
                                        ? 'ring-1 ring-brand-emerald/60 text-brand-emerald font-bold'
                                        : '';
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => handle_pick(c.date)}
                                        disabled={disabled_cell}
                                        className={`${base} ${tone} ${accent}`}
                                    >
                                        {c.date.getDate()}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-3 py-2 border-t border-border-subtle">
                            <button
                                type="button"
                                onClick={() => { onChange(''); set_open(false); }}
                                className="flex items-center gap-1 text-[11px] font-bold text-text-muted hover:text-red-400 px-2 py-1 rounded-lg"
                            >
                                <X size={11} /> Clear
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const t = new Date();
                                    if (is_disabled(t)) return;
                                    onChange(to_iso(t));
                                    set_view_month(start_of_month(t));
                                    set_open(false);
                                }}
                                className="text-[11px] font-bold text-brand-emerald hover:text-brand-blue px-2 py-1 rounded-lg"
                            >
                                Today
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
};

export default ThemedDatePicker;
