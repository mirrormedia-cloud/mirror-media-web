import { SearchSelectOption } from '../../../components/ui/CommonSearchSelect';
import { CalendarEventType } from '../../../services/calendar_service';

export const EVENT_TYPE_OPTIONS: SearchSelectOption[] = [
    { label: 'Content Release', value: 'content_release' },
    { label: 'Reminder', value: 'reminder' },
    { label: 'Meeting', value: 'meeting' },
    { label: 'Task', value: 'task' },
    { label: 'Campaign', value: 'campaign' },
    { label: 'Maintenance', value: 'maintenance' },
    { label: 'Custom', value: 'custom' },
];

export const EVENT_COLOR_BY_TYPE: Record<CalendarEventType, string> = {
    content_release: 'green',
    reminder: 'blue',
    meeting: 'purple',
    task: 'orange',
    campaign: 'blue',
    maintenance: 'red',
    custom: 'gray',
    upload_schedule: 'green',
};

/** Hex pairs FullCalendar can use for backgroundColor / borderColor / textColor.
 *  We use a slightly translucent fill on a solid border so events feel like
 *  chips instead of flat blocks. */
export const COLOR_HEX: Record<string, { bg: string; border: string }> = {
    blue: { bg: 'rgba(59, 130, 246, 0.85)', border: '#2563EB' },
    green: { bg: 'rgba(16, 185, 129, 0.85)', border: '#059669' },
    purple: { bg: 'rgba(168, 85, 247, 0.85)', border: '#9333EA' },
    orange: { bg: 'rgba(249, 115, 22, 0.85)', border: '#EA580C' },
    red: { bg: 'rgba(239, 68, 68, 0.85)', border: '#DC2626' },
    pink: { bg: 'rgba(236, 72, 153, 0.85)', border: '#DB2777' },
    cyan: { bg: 'rgba(6, 182, 212, 0.85)', border: '#0891B2' },
    gray: { bg: 'rgba(100, 116, 139, 0.85)', border: '#475569' },
};

/** Curated subset used by the "random" color sentinel — gray sits out so
 *  random picks always land on something that pops against the calendar
 *  surface. Order is fixed so the hash-based mapping is stable. */
const RANDOM_PALETTE = ['blue', 'green', 'purple', 'orange', 'red', 'pink', 'cyan'] as const;

function hash_string(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function hex_to_rgb(hex: string): { r: number; g: number; b: number } | null {
    let v = hex.trim().replace(/^#/, '');
    if (v.length === 3) v = v.split('').map(c => c + c).join('');
    if (!/^[\da-f]{6}$/i.test(v)) return null;
    const n = parseInt(v, 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Resolve a color identifier into FullCalendar background/border. Handles:
 *   - "random"        → deterministic pick from RANDOM_PALETTE keyed by `seed`
 *   - "#RRGGBB" / "#RGB" → that exact color, with 0.85-alpha background
 *   - named keys      → looked up in COLOR_HEX (blue / green / …)
 *   - anything else / null → gray fallback
 */
export function resolve_event_color(color: string | null | undefined, seed: string): { bg: string; border: string } {
    if (!color) return COLOR_HEX.gray!;
    if (color === 'random') {
        const idx = hash_string(seed || 'x') % RANDOM_PALETTE.length;
        return COLOR_HEX[RANDOM_PALETTE[idx]!]!;
    }
    if (color.startsWith('#')) {
        const rgb = hex_to_rgb(color);
        if (rgb) return { bg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.85)`, border: color };
        return COLOR_HEX.gray!;
    }
    return COLOR_HEX[color] ?? COLOR_HEX.gray!;
}
