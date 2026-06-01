import { SearchSelectOption } from '../../../components/ui/CommonSearchSelect';
import { ScheduleFrequency, SupportedPlatform } from '../../../services/calendar_service';

export const PLATFORM_OPTIONS: { value: SupportedPlatform; label: string; color: string }[] = [
    { value: 'youtube', label: 'YouTube', color: 'red' },
    { value: 'facebook', label: 'Facebook', color: 'blue' },
    { value: 'instagram', label: 'Instagram', color: 'purple' },
];

export const FREQUENCY_OPTIONS: SearchSelectOption[] = [
    { label: 'Every Day', value: 'every_day' },
    { label: 'Every Week', value: 'every_week' },
    { label: 'Every Month', value: 'every_month' },
    { label: 'Custom Range', value: 'custom_range' },
];

export const RELEASE_COUNT_OPTIONS: SearchSelectOption[] = [
    { label: '1 per slot', value: '1' },
    { label: '2 per slot', value: '2' },
    { label: 'Custom', value: 'custom' },
];

export const COLOR_OPTIONS: SearchSelectOption[] = [
    { label: 'Random', value: 'random' },
    { label: 'Custom…', value: 'custom' },
    { label: 'Blue', value: 'blue' },
    { label: 'Green', value: 'green' },
    { label: 'Purple', value: 'purple' },
    { label: 'Orange', value: 'orange' },
    { label: 'Red', value: 'red' },
    { label: 'Pink', value: 'pink' },
    { label: 'Cyan', value: 'cyan' },
    { label: 'Gray', value: 'gray' },
];

/** Hex previews for the named picker options — mirrors MediaScheduleModal. */
export const SWATCH_HEX: Record<string, string> = {
    blue: '#3B82F6',
    green: '#10B981',
    purple: '#A855F7',
    orange: '#F97316',
    red: '#EF4444',
    pink: '#EC4899',
    cyan: '#06B6D4',
    gray: '#64748B',
};

export const WEEKDAY_OPTIONS = [
    { value: 0, short: 'Sun' },
    { value: 1, short: 'Mon' },
    { value: 2, short: 'Tue' },
    { value: 3, short: 'Wed' },
    { value: 4, short: 'Thu' },
    { value: 5, short: 'Fri' },
    { value: 6, short: 'Sat' },
];

export function frequency_label(f: ScheduleFrequency | null | undefined): string {
    if (!f) return '—';
    return FREQUENCY_OPTIONS.find(o => o.value === f)?.label ?? f;
}

export function platforms_label(p: string[] | null | undefined): string {
    if (!p || p.length === 0) return '—';
    const labels = p.map(v => PLATFORM_OPTIONS.find(o => o.value === v)?.label ?? v);
    return labels.join(', ');
}
