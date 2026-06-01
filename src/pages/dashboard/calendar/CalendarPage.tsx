import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import type {
    EventInput,
    EventClickArg,
    DateSelectArg,
    EventDropArg,
    DatesSetArg,
} from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import { ChevronLeft, ChevronRight, Plus, Loader2, Tv, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
    CalendarEvent,
    CalendarEventPayload,
    calendar_service,
} from '../../../services/calendar_service';
import EventModal, { EventModalInitial } from './EventModal';
import MediaScheduleModal from './MediaScheduleModal';
import { EVENT_COLOR_BY_TYPE, EVENT_TYPE_OPTIONS, resolve_event_color } from './eventTypeMeta';
import { CommonSearchSelect, SearchSelectOption } from '../../../components/ui/CommonSearchSelect';

type CalendarViewKey = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek';

const VIEW_BUTTONS: { key: CalendarViewKey; label: string }[] = [
    { key: 'dayGridMonth', label: 'Month' },
    { key: 'timeGridWeek', label: 'Week' },
    { key: 'timeGridDay', label: 'Day' },
    { key: 'listWeek', label: 'List' },
];

function to_fc_event(e: CalendarEvent): EventInput {
    const color_key = e.color || EVENT_COLOR_BY_TYPE[e.event_type] || 'gray';
    // Seed random/hex resolution off the upload-schedule-item id (so every
    // generated upload in a "random" batch gets a distinct stable color)
    // falling back to the calendar-event id for one-off events.
    const seed = e.upload_schedule_item_id || e.id;
    const palette = resolve_event_color(color_key, seed);
    return {
        id: e.id,
        title: e.title,
        start: e.startAt,
        end: e.endAt ?? undefined,
        allDay: !!e.all_day,
        backgroundColor: palette.bg,
        borderColor: palette.border,
        textColor: '#ffffff',
        extendedProps: {
            description: e.description,
            event_type: e.event_type,
            status: e.status,
            color: color_key,
            upload_schedule_item_id: e.upload_schedule_item_id ?? null,
            library_item_id: e.library_item_id ?? null,
            ott_id: e.ott_id ?? null,
        },
    };
}

const CalendarPage: React.FC = () => {
    const navigate = useNavigate();
    const calendar_ref = useRef<FullCalendar | null>(null);
    const [events, set_events] = useState<CalendarEvent[]>([]);
    const [view, set_view] = useState<CalendarViewKey>('dayGridMonth');
    const [title, set_title] = useState('');
    const [modal_open, set_modal_open] = useState(false);
    const [modal_initial, set_modal_initial] = useState<EventModalInitial>({});
    const [type_filter, set_type_filter] = useState<string | 'all'>('all');
    const [loading, set_loading] = useState(false);
    const [saving, set_saving] = useState(false);
    const [media_open, set_media_open] = useState(false);
    const [clearing, set_clearing] = useState(false);
    // "Clear" now offers two choices instead of a single confirm. The
    // popup is rendered inline at the bottom of this component.
    const [clear_modal_open, set_clear_modal_open] = useState(false);

    const do_clear = useCallback(async (scope: 'all' | 'media') => {
        set_clear_modal_open(false);
        set_clearing(true);
        try {
            const res = await calendar_service.clear_all(scope);
            if (!res.success || !res.data) throw new Error(res.message || 'Clear failed');
            const { events_deleted, batches_deleted, items_deleted } = res.data;
            if (scope === 'media') {
                toast.success(
                    `Cleared ${batches_deleted} schedule${batches_deleted === 1 ? '' : 's'} (${items_deleted} item${items_deleted === 1 ? '' : 's'}) + ${events_deleted} media event${events_deleted === 1 ? '' : 's'}`,
                );
                // Manually created events survive — refetch to keep them.
                await load_events();
            } else {
                toast.success(
                    `Cleared ${events_deleted} event${events_deleted === 1 ? '' : 's'}, ${batches_deleted} schedule${batches_deleted === 1 ? '' : 's'} (${items_deleted} item${items_deleted === 1 ? '' : 's'})`,
                );
                // Everything is gone — no need to refetch.
                set_events([]);
            }
        } catch (err: any) {
            toast.error(err?.message || 'Clear failed');
        } finally {
            set_clearing(false);
        }
        // load_events is stable via useCallback below; eslint suppress is
        // fine without listing it because it doesn't change identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handle_clear_all = useCallback(() => {
        set_clear_modal_open(true);
    }, []);

    const load_events = useCallback(async () => {
        set_loading(true);
        try {
            const res = await calendar_service.get_events();
            if (!res.success) {
                toast.error(res.message || 'Failed to load events');
                return;
            }
            set_events(res.data ?? []);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load events');
        } finally {
            set_loading(false);
        }
    }, []);

    useEffect(() => {
        void load_events();
    }, [load_events]);

    const type_filter_options = useMemo<SearchSelectOption[]>(
        () => [{ label: 'All types', value: 'all' }, ...EVENT_TYPE_OPTIONS, { label: 'Upload Schedule', value: 'upload_schedule' }],
        [],
    );

    const filtered_fc_events = useMemo<EventInput[]>(() => {
        const list = type_filter === 'all'
            ? events
            : events.filter(e => e.event_type === type_filter);
        return list.map(to_fc_event);
    }, [events, type_filter]);

    const get_api = () => calendar_ref.current?.getApi() ?? null;

    const handle_today = () => {
        const api = get_api();
        if (api) { api.today(); set_title(api.view.title); }
    };
    const handle_prev = () => {
        const api = get_api();
        if (api) { api.prev(); set_title(api.view.title); }
    };
    const handle_next = () => {
        const api = get_api();
        if (api) { api.next(); set_title(api.view.title); }
    };
    const handle_view_change = (next: CalendarViewKey) => {
        set_view(next);
        const api = get_api();
        if (api) { api.changeView(next); set_title(api.view.title); }
    };

    const handle_dates_set = (arg: DatesSetArg) => {
        set_title(arg.view.title);
    };

    const handle_select = (arg: DateSelectArg) => {
        set_modal_initial({
            event: null,
            default_start: arg.start,
            default_end: arg.end,
            default_all_day: arg.allDay,
        });
        set_modal_open(true);
    };

    const handle_event_click = (arg: EventClickArg) => {
        const ev = events.find(e => e.id === arg.event.id);
        if (!ev) return;
        // Upload-schedule events are read-only on the calendar — the
        // schedule-detail page is the right surface for editing them
        // (per-slot uploads, retries, cancel, etc). Click jumps the
        // user straight there instead of stranding them with a toast.
        if (ev.event_type === 'upload_schedule') {
            const batch_id = (ev.metadata as any)?.batch_id as string | undefined;
            if (batch_id) {
                navigate(`/dashboard/schedules/${batch_id}`);
                return;
            }
            // Missing batch_id is a data anomaly — fall back to the
            // schedules list so the user can still reach it.
            navigate('/dashboard/schedules');
            toast('Opening Schedules — batch id missing on this event.', { duration: 4000 });
            return;
        }
        set_modal_initial({ event: ev });
        set_modal_open(true);
    };

    const handle_event_drop = async (arg: EventDropArg) => {
        if (!arg.event.start) return;
        const id = arg.event.id;
        const previous = events.find(e => e.id === id);
        if (previous?.event_type === 'upload_schedule') {
            // Don't let the user reposition an upload event from the calendar —
            // moving it would desync the underlying schedule item.
            arg.revert();
            toast.error('Edit upload events from the schedule page.');
            return;
        }
        const start_iso = arg.event.start.toISOString();
        const end_iso = arg.event.end ? arg.event.end.toISOString() : null;
        // Optimistic — revert on failure since FullCalendar already moved it.
        set_events(prev => prev.map(e => e.id === id ? { ...e, startAt: start_iso, endAt: end_iso, all_day: arg.event.allDay } : e));
        try {
            const res = await calendar_service.update_event(id, {
                startAt: start_iso,
                endAt: end_iso,
                all_day: arg.event.allDay,
            });
            if (!res.success) throw new Error(res.message);
            toast.success('Event updated');
        } catch (err: any) {
            arg.revert();
            await load_events();
            toast.error(err?.message || 'Failed to update event');
        }
    };

    const handle_event_resize = async (arg: EventResizeDoneArg) => {
        if (!arg.event.start) return;
        const id = arg.event.id;
        const start_iso = arg.event.start.toISOString();
        const end_iso = arg.event.end ? arg.event.end.toISOString() : null;
        set_events(prev => prev.map(e => e.id === id ? { ...e, startAt: start_iso, endAt: end_iso } : e));
        try {
            const res = await calendar_service.update_event(id, { startAt: start_iso, endAt: end_iso });
            if (!res.success) throw new Error(res.message);
            toast.success('Event updated');
        } catch (err: any) {
            arg.revert();
            await load_events();
            toast.error(err?.message || 'Failed to resize event');
        }
    };

    const open_create = () => {
        set_modal_initial({ event: null, default_start: new Date(), default_all_day: false });
        set_modal_open(true);
    };

    const handle_save = async (payload: CalendarEventPayload) => {
        set_saving(true);
        try {
            const editing = modal_initial.event;
            if (editing) {
                const res = await calendar_service.update_event(editing.id, payload);
                if (!res.success || !res.data) throw new Error(res.message);
                set_events(prev => prev.map(e => e.id === editing.id ? res.data! : e));
                toast.success('Event updated');
            } else {
                const res = await calendar_service.create_event(payload);
                if (!res.success || !res.data) throw new Error(res.message);
                set_events(prev => [...prev, res.data!]);
                toast.success('Event added');
            }
            set_modal_open(false);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to save event');
        } finally {
            set_saving(false);
        }
    };

    const handle_delete = async (event_id: string) => {
        set_saving(true);
        try {
            const res = await calendar_service.delete_event(event_id);
            if (!res.success) throw new Error(res.message);
            set_events(prev => prev.filter(e => e.id !== event_id));
            toast.success('Event deleted');
            set_modal_open(false);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to delete event');
        } finally {
            set_saving(false);
        }
    };

    useEffect(() => {
        const api = get_api();
        if (api) set_title(api.view.title);
    }, []);

    return (
        <div className="-m-8 h-[calc(100vh-4rem)] flex flex-col bg-bg-main">
            <div className="flex flex-col gap-4 px-6 py-4 border-b border-border-subtle md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-text-main">Calendar</h2>
                    <p className="text-text-muted text-sm">
                        Manage schedule, releases, content plans, and reminders
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={handle_today}
                        className="px-3 py-2 rounded-xl bg-bg-surface border border-border-subtle text-text-main text-xs font-bold hover:border-brand-emerald/40 transition-colors"
                    >
                        Today
                    </button>
                    <div className="flex items-center rounded-xl border border-border-subtle overflow-hidden">
                        <button
                            onClick={handle_prev}
                            className="p-2 text-text-muted hover:text-text-main hover:bg-white/5 transition-colors"
                            aria-label="Previous"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="px-3 text-xs font-bold text-text-main min-w-[8rem] text-center select-none">
                            {title}
                        </span>
                        <button
                            onClick={handle_next}
                            className="p-2 text-text-muted hover:text-text-main hover:bg-white/5 transition-colors"
                            aria-label="Next"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    <div className="flex items-center rounded-xl border border-border-subtle p-1 bg-bg-surface">
                        {VIEW_BUTTONS.map(v => (
                            <button
                                key={v.key}
                                onClick={() => handle_view_change(v.key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    view === v.key
                                        ? 'bg-gradient-to-r from-brand-emerald to-brand-blue text-white shadow'
                                        : 'text-text-muted hover:text-text-main'
                                }`}
                            >
                                {v.label}
                            </button>
                        ))}
                    </div>

                    <div className="min-w-[10rem]">
                        <CommonSearchSelect
                            options={type_filter_options}
                            value={type_filter}
                            on_change={(v) => set_type_filter(v || 'all')}
                            placeholder="All types"
                            size="sm"
                        />
                    </div>

                    <button
                        onClick={open_create}
                        className="btn-primary flex items-center gap-2 px-4 py-2 text-xs font-bold"
                    >
                        <Plus size={16} />
                        Add Event
                    </button>

                    <button
                        onClick={() => set_media_open(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-bg-surface border border-border-subtle text-text-main text-xs font-bold hover:border-brand-blue/50 hover:text-brand-blue transition-colors"
                    >
                        <Tv size={16} />
                        Media
                    </button>

                    <button
                        onClick={handle_clear_all}
                        disabled={clearing}
                        className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-bg-surface border border-border-subtle text-red-400 text-xs font-bold hover:border-red-500/50 hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        title="Permanently delete every event and every upload schedule"
                    >
                        {clearing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        Clear all
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4 relative">
                {loading && (
                    <div className="absolute top-2 right-6 flex items-center gap-2 text-xs text-text-muted z-10">
                        <Loader2 size={12} className="animate-spin" /> Loading…
                    </div>
                )}
                <div className="h-full glass-card p-3 md:p-4">
                    <FullCalendar
                        ref={calendar_ref}
                        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                        initialView={view}
                        headerToolbar={false}
                        height="100%"
                        events={filtered_fc_events}
                        editable
                        droppable
                        selectable
                        selectMirror
                        nowIndicator
                        dayMaxEvents
                        weekends
                        firstDay={0}
                        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                        // ── Time-grid (Week / Day) readability ────────────
                        // 1. Upload events have no end_at — FullCalendar's
                        //    default 1h block made stacks of N uploads at
                        //    the same minute completely unreadable. 30 min
                        //    still leaves room for the title without
                        //    swallowing the next slot.
                        // 2. `slotEventOverlap=false` puts overlapping
                        //    events side-by-side as columns instead of
                        //    stacked, so 3 09:34 uploads render as 3
                        //    skinny columns rather than a pile.
                        // 3. 30-minute slot rows give the time-grid more
                        //    vertical density — short events still occupy
                        //    a full half-row so the title doesn't get
                        //    truncated to nothing.
                        // 4. `expandRows` fills the available height so
                        //    empty hours don't waste space.
                        defaultTimedEventDuration="00:30:00"
                        slotEventOverlap={false}
                        slotDuration="00:30:00"
                        slotLabelInterval="01:00:00"
                        expandRows
                        // Multi-day timed events default to "list-item"
                        // (a dot + title on each day) which makes a 2-month
                        // event look like a scatter of unrelated dots
                        // instead of one continuous bar. "block" forces a
                        // proper bar that spans every day the event covers.
                        eventDisplay="block"
                        // Keep the bar clean: a 2-month event shouldn't have
                        // its end time printed on the bar.
                        displayEventEnd={false}
                        // Sort multi-day events ABOVE single-day ones in
                        // each row so the long bar sits on a consistent
                        // lane across weeks instead of jumping vertically.
                        eventOrder="-duration,allDay,start,title"
                        select={handle_select}
                        eventClick={handle_event_click}
                        eventDrop={handle_event_drop}
                        eventResize={handle_event_resize}
                        datesSet={handle_dates_set}
                    />
                </div>
            </div>

            <EventModal
                isOpen={modal_open}
                onClose={() => !saving && set_modal_open(false)}
                onSave={handle_save}
                onDelete={handle_delete}
                initial={modal_initial}
                saving={saving}
            />

            <MediaScheduleModal
                isOpen={media_open}
                onClose={() => set_media_open(false)}
                onSaved={() => { void load_events(); }}
            />

            {/* Clear popup — two destructive choices instead of a binary
                confirm. The standard ConfirmDialog can't host two
                "yes"-style actions, so we render a small inline modal. */}
            {clear_modal_open && (
                <div
                    className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => set_clear_modal_open(false)}
                >
                    <div
                        className="relative w-full max-w-md rounded-3xl border border-border-subtle bg-bg-elevated shadow-2xl p-7 animate-in zoom-in-95 fade-in duration-150"
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={() => set_clear_modal_open(false)}
                            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-bg-surface transition-colors"
                            aria-label="Close"
                        >
                            ✕
                        </button>

                        <div className="flex items-center gap-3.5">
                            <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-red-400 bg-red-500/15">
                                <Trash2 size={20} />
                            </div>
                            <h3 className="text-lg font-bold text-text-main leading-tight">Clear calendar?</h3>
                        </div>

                        <div className="mt-5 space-y-2.5">
                            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] p-3.5">
                                <p className="text-sm font-bold text-amber-400 leading-tight">Clear media</p>
                                <p className="text-xs text-text-muted leading-relaxed mt-1">
                                    Removes only upload schedules (batches + items) and the media events they spawned. Manually-created events stay.
                                </p>
                            </div>
                            <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-3.5">
                                <p className="text-sm font-bold text-red-400 leading-tight">Clear all</p>
                                <p className="text-xs text-text-muted leading-relaxed mt-1">
                                    Removes every event AND every upload schedule. Cannot be undone.
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => void do_clear('media')}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-500/50 transition-colors"
                            >
                                Clear media
                            </button>
                            <button
                                type="button"
                                onClick={() => void do_clear('all')}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-red-500 text-white border border-red-500 hover:bg-red-400 shadow-lg shadow-red-500/30 transition-colors"
                            >
                                Clear all
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarPage;
