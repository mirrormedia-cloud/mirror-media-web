/**
 * Color picker popover, themed to the dashboard.
 *
 * Native <input type="color"> opens a stark OS-painted dialog that doesn't
 * honour `color-scheme` in Chrome (unlike date / time inputs). This
 * component replaces it with a small dark popover containing:
 *   - a curated 24-swatch theme palette (instant pick),
 *   - HSL hue + lightness sliders for fine tuning,
 *   - a hex text input for exact values.
 *
 * Value contract is `#RRGGBB` (lowercase or upper, any case in, lower out)
 * so it drops in for a native color input in form state.
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pipette, Check } from 'lucide-react';

interface Props {
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
    /** Class merged onto the trigger swatch button. */
    className?: string;
    /** Trigger size in px (square). Defaults to 36. */
    swatch_size?: number;
}

// ── Color helpers ──────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function pad2(n: string) { return n.length === 1 ? `0${n}` : n; }

function rgb_to_hex(r: number, g: number, b: number): string {
    return `#${pad2(r.toString(16))}${pad2(g.toString(16))}${pad2(b.toString(16))}`;
}

function hex_to_rgb(hex: string): { r: number; g: number; b: number } | null {
    let v = (hex || '').trim().replace(/^#/, '');
    if (v.length === 3) v = v.split('').map(c => c + c).join('');
    if (!/^[\da-f]{6}$/i.test(v)) return null;
    const n = parseInt(v, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgb_to_hsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
            case gn: h = ((bn - rn) / d + 2); break;
            case bn: h = ((rn - gn) / d + 4); break;
        }
        h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hsl_to_hex(h: number, s: number, l: number): string {
    const sn = s / 100;
    const ln = l / 100;
    const c = (1 - Math.abs(2 * ln - 1)) * sn;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0; let g = 0; let b = 0;
    if (hp >= 0 && hp < 1) { r = c; g = x; b = 0; }
    else if (hp < 2) { r = x; g = c; b = 0; }
    else if (hp < 3) { r = 0; g = c; b = x; }
    else if (hp < 4) { r = 0; g = x; b = c; }
    else if (hp < 5) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    const m = ln - c / 2;
    return rgb_to_hex(
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255),
    );
}

// Curated theme-friendly palette — 6 hues × 4 brightness levels.
const PALETTE: string[] = [
    '#10B981', '#34D399', '#6EE7B7', '#A7F3D0',  // emerald
    '#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE',  // blue
    '#A855F7', '#C084FC', '#D8B4FE', '#E9D5FF',  // purple
    '#F97316', '#FB923C', '#FDBA74', '#FED7AA',  // orange
    '#EF4444', '#F87171', '#FCA5A5', '#FECACA',  // red
    '#EC4899', '#F472B6', '#F9A8D4', '#FBCFE8',  // pink
];

// ── Component ──────────────────────────────────────────────────────────

export const ThemedColorPicker: React.FC<Props> = ({
    value,
    onChange,
    disabled = false,
    className = '',
    swatch_size = 36,
}) => {
    const trigger_ref = useRef<HTMLButtonElement | null>(null);
    const popover_ref = useRef<HTMLDivElement | null>(null);
    const [open, set_open] = useState(false);
    const [coords, set_coords] = useState<{ top: number; left: number } | null>(null);
    const [hex_text, set_hex_text] = useState(value);

    const rgb = useMemo(() => hex_to_rgb(value) ?? { r: 16, g: 185, b: 129 }, [value]);
    const hsl = useMemo(() => rgb_to_hsl(rgb.r, rgb.g, rgb.b), [rgb]);

    useEffect(() => { set_hex_text(value); }, [value]);

    // Position popover.
    useLayoutEffect(() => {
        if (!open) return;
        const update = () => {
            const el = trigger_ref.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const popover_h = 320;
            const popover_w = 240;
            const space_below = window.innerHeight - rect.bottom;
            const top = space_below < popover_h && rect.top > popover_h
                ? rect.top - popover_h - 8
                : rect.bottom + 8;
            const max_left = window.innerWidth - popover_w - 12;
            // Anchor right edge of popover to right edge of trigger so it
            // doesn't fly off the right side of the modal.
            const desired_left = rect.right - popover_w;
            const left = Math.min(Math.max(desired_left, 12), max_left);
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

    const handle_hex_commit = (raw: string) => {
        const trimmed = raw.trim();
        const candidate = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
        if (hex_to_rgb(candidate)) onChange(candidate.toLowerCase());
        else set_hex_text(value);  // revert visible text on invalid
    };

    const set_hue = (h: number) => onChange(hsl_to_hex(clamp(h, 0, 360), Math.max(40, hsl.s), hsl.l).toLowerCase());
    const set_lightness = (l: number) => onChange(hsl_to_hex(hsl.h, Math.max(40, hsl.s), clamp(l, 5, 95)).toLowerCase());

    return (
        <>
            <button
                ref={trigger_ref}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && set_open(o => !o)}
                style={{ width: swatch_size, height: swatch_size, backgroundColor: value }}
                className={`relative rounded-xl border border-border-subtle overflow-hidden transition-shadow ${
                    open ? 'ring-2 ring-brand-emerald/50' : ''
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:ring-2 hover:ring-white/20'} ${className}`}
                title={`Custom color (${value})`}
            >
                <Pipette size={12} className="absolute bottom-0.5 right-0.5 text-white/80 mix-blend-difference" />
            </button>

            {open && coords && typeof document !== 'undefined' && createPortal(
                <div
                    ref={popover_ref}
                    className="fixed z-[1200] animate-in fade-in zoom-in-95 duration-150"
                    style={{ top: coords.top, left: coords.left, width: 240 }}
                >
                    {/* Solid `--bg-elevated` instead of the previous
                        `bg-bg-surface/85 backdrop-blur-xl` combo — that
                        broke when the picker was portaled OVER a modal
                        that already owned a backdrop-blur stacking
                        context (the modal's own blur stopped rendering
                        through the translucent popover, so the calendar
                        bled through). A solid surface needs no blur and
                        avoids the nested-filter pitfall entirely. */}
                    <div className="bg-bg-elevated border border-border-subtle rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
                        {/* Header — preview swatch + hex input */}
                        <div className="flex items-center gap-2 p-2.5 border-b border-border-subtle">
                            <div
                                className="w-9 h-9 rounded-lg border border-border-subtle shrink-0"
                                style={{ backgroundColor: value }}
                            />
                            <div className="flex-1 flex items-center gap-1 px-2 py-1.5 rounded-lg bg-black/20 border border-border-subtle">
                                <span className="text-text-muted text-xs font-mono">#</span>
                                <input
                                    type="text"
                                    value={hex_text.replace(/^#/, '')}
                                    onChange={(e) => set_hex_text(e.target.value)}
                                    onBlur={(e) => handle_hex_commit(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    maxLength={6}
                                    className="flex-1 min-w-0 bg-transparent outline-none text-text-main text-xs font-mono uppercase"
                                    placeholder="10b981"
                                    spellCheck={false}
                                />
                            </div>
                        </div>

                        {/* Hue slider — rainbow track */}
                        <div className="px-3 pt-3 space-y-2">
                            <p className="text-[9px] uppercase font-bold text-text-muted tracking-wider">Hue</p>
                            <input
                                type="range"
                                min={0}
                                max={360}
                                value={hsl.h}
                                onChange={(e) => set_hue(Number(e.target.value))}
                                className="themed-range w-full"
                                style={{
                                    background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
                                }}
                            />
                        </div>

                        {/* Lightness slider — black → hue → white */}
                        <div className="px-3 pt-3 space-y-2">
                            <p className="text-[9px] uppercase font-bold text-text-muted tracking-wider">Lightness</p>
                            <input
                                type="range"
                                min={5}
                                max={95}
                                value={hsl.l}
                                onChange={(e) => set_lightness(Number(e.target.value))}
                                className="themed-range w-full"
                                style={{
                                    background: `linear-gradient(to right, #000, ${hsl_to_hex(hsl.h, Math.max(40, hsl.s), 50)}, #fff)`,
                                }}
                            />
                        </div>

                        {/* Preset palette */}
                        <div className="p-3">
                            <p className="text-[9px] uppercase font-bold text-text-muted tracking-wider mb-1.5">Palette</p>
                            <div className="grid grid-cols-8 gap-1">
                                {PALETTE.map(c => {
                                    const active = c.toLowerCase() === value.toLowerCase();
                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => onChange(c.toLowerCase())}
                                            className={`relative aspect-square rounded-md border border-border-subtle transition-transform hover:scale-110 ${active ? 'ring-2 ring-white/80' : ''}`}
                                            style={{ backgroundColor: c }}
                                            title={c}
                                        >
                                            {active && (
                                                <Check size={10} className="absolute inset-0 m-auto text-white mix-blend-difference" strokeWidth={3} />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-end px-3 py-1.5 border-t border-border-subtle">
                            <button
                                type="button"
                                onClick={() => set_open(false)}
                                className="text-[10px] font-bold text-brand-emerald hover:text-brand-blue px-2 py-0.5 rounded-md"
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

export default ThemedColorPicker;
