import React, { useEffect, useMemo, useState } from 'react';
import { X, Save, Trash2, CalendarDays, AlertCircle, Pipette } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { CommonSearchSelect, SearchSelectOption } from '../../../components/ui/CommonSearchSelect';
import { ThemedDatePicker } from '../../../components/ui/ThemedDatePicker';
import { ThemedTimePicker } from '../../../components/ui/ThemedTimePicker';
import {
    CalendarEvent,
    CalendarEventPayload,
    CalendarEventStatus,
    CalendarEventType,
} from '../../../services/calendar_service';
import { EVENT_TYPE_OPTIONS, EVENT_COLOR_BY_TYPE } from './eventTypeMeta';

const STATUS_OPTIONS: SearchSelectOption[] = [
    { label: 'Scheduled', value: 'scheduled' },
    { label: 'Completed', value: 'completed' },
    { label: 'Cancelled', value: 'cancelled' },
];

const COLOR_OPTIONS: SearchSelectOption[] = [
    { label: 'Blue', value: 'blue' },
    { label: 'Green', value: 'green' },
    { label: 'Purple', value: 'purple' },
    { label: 'Orange', value: 'orange' },
    { label: 'Red', value: 'red' },
    { label: 'Gray', value: 'gray' },
    { label: 'Custom…', value: '__custom__' },
];

/** Sentinel `value` the color dropdown emits when the user picks "Custom"
 *  — distinct from a real hex so we can detect the transition and seed a
 *  starting color for the picker. */
const CUSTOM_COLOR_SENTINEL = '__custom__';
const DEFAULT_CUSTOM_COLOR = '#3B82F6';

export interface EventModalInitial {
    /** When set, the modal opens in edit mode with these values. */
    event?: CalendarEvent | null;
    /** Pre-filled defaults for create mode (e.g. clicked date cell). */
    default_start?: Date | null;
    default_end?: Date | null;
    default_all_day?: boolean;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (payload: CalendarEventPayload) => void | Promise<void>;
    onDelete?: (event_id: string) => void | Promise<void>;
    initial: EventModalInitial;
    saving?: boolean;
}

function pad(n: number) {
    return String(n).padStart(2, '0');
}

function to_date_input(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function to_time_input(d: Date): string {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combine_local(date_str: string, time_str: string, all_day: boolean): Date {
    if (all_day) {
        const [y, m, d] = date_str.split('-').map(Number);
        return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
    }
    const [y, m, d] = date_str.split('-').map(Number);
    const [hh, mm] = time_str.split(':').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

const EventModal: React.FC<Props> = ({ isOpen, onClose, onSave, onDelete, initial, saving = false }) => {
    const editing = !!initial.event;

    const [title, set_title] = useState('');
    const [description, set_description] = useState('');
    const [start_date, set_start_date] = useState('');
    const [start_time, set_start_time] = useState('10:00');
    const [end_date, set_end_date] = useState('');
    const [end_time, set_end_time] = useState('11:00');
    const [all_day, set_all_day] = useState(false);
    const [event_type, set_event_type] = useState<CalendarEventType>('custom');
    const [color, set_color] = useState<string>('gray');
    const [status, set_status] = useState<CalendarEventStatus>('scheduled');
    const [errors, set_errors] = useState<Record<string, string>>({});
    const [confirm_delete, set_confirm_delete] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        set_errors({});
        set_confirm_delete(false);

        if (initial.event) {
            const e = initial.event;
            const s = new Date(e.startAt);
            const ed = e.endAt ? new Date(e.endAt) : new Date(s.getTime() + 60 * 60 * 1000);
            set_title(e.title || '');
            set_description(e.description || '');
            set_start_date(to_date_input(s));
            set_start_time(to_time_input(s));
            set_end_date(to_date_input(ed));
            set_end_time(to_time_input(ed));
            set_all_day(!!e.all_day);
            set_event_type(e.event_type || 'custom');
            set_color(e.color || EVENT_COLOR_BY_TYPE[e.event_type] || 'gray');
            set_status(e.status || 'scheduled');
            return;
        }

        const start = initial.default_start ?? new Date();
        const end = initial.default_end ?? new Date(start.getTime() + 60 * 60 * 1000);
        set_title('');
        set_description('');
        set_start_date(to_date_input(start));
        set_start_time(to_time_input(start));
        set_end_date(to_date_input(end));
        set_end_time(to_time_input(end));
        set_all_day(!!initial.default_all_day);
        set_event_type('custom');
        set_color(EVENT_COLOR_BY_TYPE['custom']);
        set_status('scheduled');
    }, [isOpen, initial]);

    const event_type_options = useMemo<SearchSelectOption[]>(() => EVENT_TYPE_OPTIONS, []);

    if (!isOpen) return null;

    const handle_submit = (ev: React.FormEvent) => {
        ev.preventDefault();
        const next: Record<string, string> = {};
        if (!title || title.trim().length < 3) next.title = 'Title must be at least 3 characters';
        if (!start_date) next.start_date = 'Start date is required';
        if (!event_type) next.event_type = 'Event type is required';

        const start_at = combine_local(start_date || to_date_input(new Date()), start_time, all_day);
        const end_at_raw = end_date
            ? combine_local(end_date, end_time, all_day)
            : null;

        if (end_at_raw && end_at_raw.getTime() <= start_at.getTime()) {
            next.end_date = 'End must be after start';
        }

        if (Object.keys(next).length > 0) {
            set_errors(next);
            return;
        }

        const payload: CalendarEventPayload = {
            title: title.trim(),
            description: description.trim() || null,
            startAt: start_at.toISOString(),
            endAt: end_at_raw ? end_at_raw.toISOString() : null,
            all_day,
            event_type,
            color: color || null,
            status,
        };

        onSave(payload);
    };

    const handle_event_type_change = (val: string | null) => {
        const t = (val || 'custom') as CalendarEventType;
        set_event_type(t);
        set_color(EVENT_COLOR_BY_TYPE[t] || 'gray');
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-bg-main border border-border-subtle rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-border-subtle">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center">
                            <CalendarDays size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-text-main">
                                {editing ? 'Edit Event' : 'Add Calendar Event'}
                            </h3>
                            <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mt-0.5">
                                {editing ? 'Update event details' : 'Schedule something new'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handle_submit} className="p-6 space-y-5 overflow-y-auto flex-1">
                    <Input
                        label="Title"
                        placeholder="e.g. New Episode Release"
                        value={title}
                        onChange={set_title}
                        error={errors.title}
                    />

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-text-muted ml-1 block">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => set_description(e.target.value)}
                            rows={3}
                            placeholder="Optional notes about this event"
                            className="input-field resize-none"
                        />
                    </div>

                    <label className="flex items-center gap-2 ml-1 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={all_day}
                            onChange={(e) => set_all_day(e.target.checked)}
                        />
                        <span className="text-sm text-text-main font-medium">All day</span>
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-muted ml-1 block">Start date</label>
                            <ThemedDatePicker
                                value={start_date}
                                onChange={set_start_date}
                                placeholder="DD-MM-YYYY"
                                className={errors.start_date ? 'border-red-500/50' : ''}
                            />
                            {errors.start_date && (
                                <p className="text-xs text-red-400 ml-1 mt-1">{errors.start_date}</p>
                            )}
                        </div>
                        {!all_day && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-text-muted ml-1 block">Start time</label>
                                <ThemedTimePicker value={start_time} onChange={set_start_time} />
                            </div>
                        )}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-muted ml-1 block">End date</label>
                            <ThemedDatePicker
                                value={end_date}
                                onChange={set_end_date}
                                min={start_date || undefined}
                                placeholder="DD-MM-YYYY"
                                className={errors.end_date ? 'border-red-500/50' : ''}
                            />
                            {errors.end_date && (
                                <p className="text-xs text-red-400 ml-1 mt-1">{errors.end_date}</p>
                            )}
                        </div>
                        {!all_day && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-text-muted ml-1 block">End time</label>
                                <ThemedTimePicker value={end_time} onChange={set_end_time} />
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-muted ml-1 block">Event type</label>
                            <CommonSearchSelect
                                options={event_type_options}
                                value={event_type}
                                on_change={handle_event_type_change}
                                placeholder="Select type"
                                error={errors.event_type}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-muted ml-1 block">Color</label>
                            <div className="flex items-center gap-2">
                                {/* Swatch appears inline (no new row) only when
                                    Custom mode is active. Clicking it opens the
                                    native color picker. */}
                                {color.startsWith('#') && (
                                    <label
                                        className="group relative w-10 h-10 rounded-xl border border-border-subtle overflow-hidden cursor-pointer shrink-0 ring-1 ring-inset ring-white/5 hover:ring-2 hover:ring-brand-emerald/50 transition-all shadow-md"
                                        title={`Pick a custom color (${color.toUpperCase()})`}
                                    >
                                        <input
                                            type="color"
                                            value={color}
                                            onChange={(e) => set_color(e.target.value)}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                        <span
                                            className="absolute inset-0"
                                            style={{ backgroundColor: color }}
                                            aria-hidden="true"
                                        />
                                        <span className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                                        <Pipette
                                            size={11}
                                            className="absolute bottom-1 right-1 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] opacity-80 group-hover:opacity-100 transition-opacity"
                                        />
                                    </label>
                                )}
                                <div className="flex-1 min-w-0">
                                    <CommonSearchSelect
                                        options={COLOR_OPTIONS}
                                        value={color.startsWith('#') ? CUSTOM_COLOR_SENTINEL : color}
                                        on_change={(v) => {
                                            if (v === CUSTOM_COLOR_SENTINEL) {
                                                if (!color.startsWith('#')) set_color(DEFAULT_CUSTOM_COLOR);
                                            } else {
                                                set_color(v || 'gray');
                                            }
                                        }}
                                        placeholder="Color"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-text-muted ml-1 block">Status</label>
                            <CommonSearchSelect
                                options={STATUS_OPTIONS}
                                value={status}
                                on_change={(v) => set_status((v || 'scheduled') as CalendarEventStatus)}
                                placeholder="Status"
                            />
                        </div>
                    </div>

                    {confirm_delete && editing && (
                        <div className="flex items-center gap-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
                            <AlertCircle size={18} className="shrink-0" />
                            <span>Delete this event? This cannot be undone.</span>
                        </div>
                    )}
                </form>

                <div className="flex items-center justify-between gap-3 p-6 border-t border-border-subtle">
                    <div>
                        {editing && onDelete && initial.event && (
                            confirm_delete ? (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => set_confirm_delete(false)}
                                        className="px-3 py-2 rounded-xl text-text-muted hover:text-text-main text-xs font-bold border border-border-subtle"
                                    >
                                        Keep
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onDelete(initial.event!.id)}
                                        className="px-3 py-2 rounded-xl bg-red-500/15 text-red-300 hover:bg-red-500/25 text-xs font-bold border border-red-500/30"
                                    >
                                        Confirm Delete
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => set_confirm_delete(true)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-red-300 hover:bg-red-500/10 text-xs font-bold border border-red-500/20"
                                >
                                    <Trash2 size={14} /> Delete
                                </button>
                            )
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2.5 rounded-2xl text-text-muted hover:text-text-main text-xs font-bold border border-border-subtle"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handle_submit}
                            disabled={saving}
                            className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm"
                        >
                            <Save size={16} />
                            {editing ? 'Save Changes' : 'Save Event'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EventModal;
