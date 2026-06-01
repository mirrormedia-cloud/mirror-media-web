import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import type { Point, Area } from 'react-easy-crop';
import {
    Camera, Check, X, ZoomIn, ZoomOut, User,
    Phone, Mail, ChevronDown, ChevronLeft, ChevronRight,
    RefreshCw, Save, Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    get_profile, update_profile, update_profile_picture,
    get_profile_pic_upload_url, confirm_profile_pic, upload_to_r2_direct,
    type UserProfileData,
} from '../../../services/profile_service';

// ─── crop helper ──────────────────────────────────────────────────────────

async function get_cropped_blob(src: string, px: Area): Promise<Blob> {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
        const el = new Image();
        el.onload = () => res(el);
        el.onerror = rej;
        if (!src.startsWith('data:')) el.crossOrigin = 'anonymous';
        el.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = px.width;
    canvas.height = px.height;
    canvas.getContext('2d')!.drawImage(img, px.x, px.y, px.width, px.height, 0, 0, px.width, px.height);
    return new Promise(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.92));
}

// ─── country codes ────────────────────────────────────────────────────────

const COUNTRIES = [
    { code: '+91', label: 'IN +91', flag: '🇮🇳' },
    { code: '+1',  label: 'US +1',  flag: '🇺🇸' },
    { code: '+44', label: 'GB +44', flag: '🇬🇧' },
    { code: '+61', label: 'AU +61', flag: '🇦🇺' },
    { code: '+971', label: 'AE +971', flag: '🇦🇪' },
    { code: '+966', label: 'SA +966', flag: '🇸🇦' },
    { code: '+65', label: 'SG +65', flag: '🇸🇬' },
    { code: '+60', label: 'MY +60', flag: '🇲🇾' },
    { code: '+62', label: 'ID +62', flag: '🇮🇩' },
    { code: '+63', label: 'PH +63', flag: '🇵🇭' },
    { code: '+86', label: 'CN +86', flag: '🇨🇳' },
    { code: '+81', label: 'JP +81', flag: '🇯🇵' },
    { code: '+82', label: 'KR +82', flag: '🇰🇷' },
    { code: '+49', label: 'DE +49', flag: '🇩🇪' },
    { code: '+33', label: 'FR +33', flag: '🇫🇷' },
    { code: '+39', label: 'IT +39', flag: '🇮🇹' },
    { code: '+34', label: 'ES +34', flag: '🇪🇸' },
    { code: '+7',  label: 'RU +7',  flag: '🇷🇺' },
    { code: '+55', label: 'BR +55', flag: '🇧🇷' },
    { code: '+27', label: 'ZA +27', flag: '🇿🇦' },
    { code: '+234', label: 'NG +234', flag: '🇳🇬' },
    { code: '+20', label: 'EG +20', flag: '🇪🇬' },
    { code: '+92', label: 'PK +92', flag: '🇵🇰' },
    { code: '+880', label: 'BD +880', flag: '🇧🇩' },
    { code: '+94', label: 'LK +94', flag: '🇱🇰' },
    { code: '+977', label: 'NP +977', flag: '🇳🇵' },
];

// ─── PhoneField ───────────────────────────────────────────────────────────

const PhoneField: React.FC<{
    label: string;
    country_code: string;
    number: string;
    on_country: (v: string) => void;
    on_number: (v: string) => void;
    icon?: React.ReactNode;
}> = ({ label, country_code, number, on_country, on_number, icon }) => {
    const [open, set_open] = useState(false);
    const [search, set_search] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    const filtered = search
        ? COUNTRIES.filter(c => c.label.toLowerCase().includes(search.toLowerCase()))
        : COUNTRIES;

    const selected = COUNTRIES.find(c => c.code === country_code) ?? COUNTRIES[0];

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) set_open(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest font-bold text-text-muted flex items-center gap-1.5">
                {icon} {label}
            </label>
            <div className="flex items-center gap-2">
                {/* Country code dropdown */}
                <div className="relative self-stretch flex items-center" ref={ref}>
                    <button
                        type="button"
                        onClick={() => { set_open(o => !o); set_search(''); }}
                        className="flex items-center gap-1.5 h-11 px-3 rounded-xl bg-white/5 border border-white/8 text-sm text-text-main hover:bg-white/8 transition-all whitespace-nowrap"
                    >
                        <span className="text-base">{selected.flag}</span>
                        <span className="font-mono text-[12px]">{selected.code}</span>
                        <ChevronDown size={12} className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>

                    {open && (
                        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-48 rounded-2xl border border-white/8 bg-bg-aside backdrop-blur-2xl shadow-2xl shadow-black/40 overflow-hidden">
                            <div className="p-2 border-b border-white/6">
                                <input
                                    autoFocus
                                    type="text"
                                    value={search}
                                    onChange={e => set_search(e.target.value)}
                                    placeholder="Search…"
                                    className="w-full px-2.5 py-1.5 rounded-lg bg-white/8 border border-white/6 text-xs text-text-main placeholder:text-text-muted/50 focus:outline-none"
                                />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                                {filtered.map(c => (
                                    <button
                                        key={c.code}
                                        type="button"
                                        onClick={() => { on_country(c.code); set_open(false); }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8 transition-colors ${c.code === country_code ? 'text-brand-emerald font-semibold' : 'text-text-main'}`}
                                    >
                                        <span>{c.flag}</span>
                                        <span>{c.label}</span>
                                        {c.code === country_code && <Check size={10} className="ml-auto" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Number input */}
                <input
                    type="tel"
                    value={number}
                    onChange={e => on_number(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter number"
                    maxLength={12}
                    className="flex-1 h-11 px-4 rounded-xl bg-white/5 border border-white/8 text-sm text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-brand-blue/50 focus:bg-white/8 transition-all"
                />
            </div>
        </div>
    );
};

// ─── CustomSelect ─────────────────────────────────────────────────────────

const CustomSelect: React.FC<{
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    icon?: React.ReactNode;
}> = ({ label, value, onChange, options, placeholder = 'Select…', icon }) => {
    const [open, set_open] = useState(false);
    const [rect, set_rect] = useState<DOMRect | null>(null);
    const btn_ref = useRef<HTMLButtonElement>(null);
    const dropdown_ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (
                !btn_ref.current?.contains(e.target as Node) &&
                !dropdown_ref.current?.contains(e.target as Node)
            ) set_open(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const toggle = () => {
        if (!open && btn_ref.current) set_rect(btn_ref.current.getBoundingClientRect());
        set_open(o => !o);
    };

    const selected = options.find(o => o.value === value);

    return (
        <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest font-bold text-text-muted flex items-center gap-1.5">
                {icon} {label}
            </label>
            <button
                ref={btn_ref}
                type="button"
                onClick={toggle}
                className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/8 text-sm flex items-center justify-between hover:bg-white/8 transition-all"
            >
                <span className={selected?.value ? 'text-text-main' : 'text-text-muted/40'}>
                    {selected?.label ?? placeholder}
                </span>
                <ChevronDown size={14} className={`text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && rect && createPortal(
                <div
                    ref={dropdown_ref}
                    style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }}
                    className="rounded-2xl border border-white/8 bg-bg-aside backdrop-blur-2xl shadow-2xl shadow-black/40 overflow-hidden"
                >
                    {options.map(o => (
                        <button
                            key={o.value}
                            type="button"
                            onClick={() => { onChange(o.value); set_open(false); }}
                            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-white/8 transition-colors ${o.value === value ? 'text-brand-emerald font-semibold' : 'text-text-main'}`}
                        >
                            {o.label}
                            {o.value === value && <Check size={12} />}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

// ─── DatePicker ───────────────────────────────────────────────────────────

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const DatePicker: React.FC<{
    label: string;
    value: string; // YYYY-MM-DD or ''
    onChange: (v: string) => void;
    icon?: React.ReactNode;
}> = ({ label, value, onChange, icon }) => {
    const [open, set_open] = useState(false);
    const [mode, set_mode] = useState<'day' | 'year'>('day');
    const [rect, set_rect] = useState<DOMRect | null>(null);
    const btn_ref = useRef<HTMLButtonElement>(null);
    const dropdown_ref = useRef<HTMLDivElement>(null);

    const parsed = value ? new Date(value + 'T00:00:00') : null;
    const [view_year, set_view_year] = useState(parsed?.getFullYear() ?? new Date().getFullYear());
    const [view_month, set_view_month] = useState(parsed?.getMonth() ?? new Date().getMonth());

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (
                !btn_ref.current?.contains(e.target as Node) &&
                !dropdown_ref.current?.contains(e.target as Node)
            ) { set_open(false); set_mode('day'); }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const toggle = () => {
        if (!open && btn_ref.current) set_rect(btn_ref.current.getBoundingClientRect());
        set_open(o => !o);
    };

    const first_dow = new Date(view_year, view_month, 1).getDay();
    const days_in_month = new Date(view_year, view_month + 1, 0).getDate();
    const today = new Date().toISOString().split('T')[0];

    const select_day = (d: number) => {
        const iso = `${view_year}-${String(view_month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        onChange(iso);
        set_open(false);
        set_mode('day');
    };

    const prev_month = () => {
        if (view_month === 0) { set_view_month(11); set_view_year(y => y - 1); }
        else set_view_month(m => m - 1);
    };
    const next_month = () => {
        if (view_month === 11) { set_view_month(0); set_view_year(y => y + 1); }
        else set_view_month(m => m + 1);
    };

    // Year grid: 16 years centred on view_year (rounded to nearest decade start)
    const year_start = Math.floor((view_year - 4) / 10) * 10;
    const year_grid = Array.from({ length: 16 }, (_, i) => year_start + i);

    const display = parsed
        ? parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : null;

    return (
        <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest font-bold text-text-muted flex items-center gap-1.5">
                {icon} {label}
            </label>
            <button
                ref={btn_ref}
                type="button"
                onClick={toggle}
                className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/8 text-sm flex items-center justify-between hover:bg-white/8 transition-all"
            >
                <span className={display ? 'text-text-main' : 'text-text-muted/40'}>
                    {display ?? 'Select date'}
                </span>
                <Calendar size={14} className="text-text-muted shrink-0" />
            </button>

            {open && rect && createPortal(
                <div
                    ref={dropdown_ref}
                    style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: 288, zIndex: 9999 }}
                    className="rounded-2xl border border-white/8 bg-bg-aside backdrop-blur-2xl shadow-2xl shadow-black/40 overflow-hidden"
                >
                    {/* Nav header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
                        <button
                            type="button"
                            onClick={() => mode === 'day' ? prev_month() : set_view_year(y => y - 16)}
                            className="p-1.5 rounded-lg hover:bg-white/8 text-text-muted hover:text-text-main transition-colors"
                        >
                            <ChevronLeft size={15} />
                        </button>
                        <button
                            type="button"
                            onClick={() => set_mode(m => m === 'day' ? 'year' : 'day')}
                            className="text-sm font-bold text-text-main hover:text-brand-emerald transition-colors px-2 py-1 rounded-lg hover:bg-white/6"
                        >
                            {mode === 'day' ? `${MONTHS_LONG[view_month]} ${view_year}` : `${year_start} – ${year_start + 15}`}
                        </button>
                        <button
                            type="button"
                            onClick={() => mode === 'day' ? next_month() : set_view_year(y => y + 16)}
                            className="p-1.5 rounded-lg hover:bg-white/8 text-text-muted hover:text-text-main transition-colors"
                        >
                            <ChevronRight size={15} />
                        </button>
                    </div>

                    {mode === 'day' ? (
                        <div className="p-3">
                            {/* Day-of-week headers */}
                            <div className="grid grid-cols-7 mb-1.5">
                                {WEEK_DAYS.map(d => (
                                    <div key={d} className="text-center text-[10px] font-bold text-text-muted/50 py-1">{d}</div>
                                ))}
                            </div>
                            {/* Day cells */}
                            <div className="grid grid-cols-7 gap-px">
                                {Array.from({ length: first_dow }).map((_, i) => <div key={`e${i}`} />)}
                                {Array.from({ length: days_in_month }).map((_, i) => {
                                    const d = i + 1;
                                    const iso = `${view_year}-${String(view_month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                    const is_sel = iso === value;
                                    const is_today = iso === today;
                                    return (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => select_day(d)}
                                            className={[
                                                'w-full aspect-square rounded-lg text-xs font-medium transition-all flex items-center justify-center',
                                                is_sel
                                                    ? 'bg-gradient-to-br from-brand-emerald to-brand-blue text-white font-bold shadow-md shadow-brand-emerald/20'
                                                    : is_today
                                                        ? 'border border-brand-blue/40 text-brand-blue font-semibold hover:bg-brand-blue/10'
                                                        : 'text-text-main hover:bg-white/8',
                                            ].join(' ')}
                                        >
                                            {d}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 grid grid-cols-4 gap-1.5">
                            {year_grid.map(y => {
                                const sel_y = parsed?.getFullYear();
                                return (
                                    <button
                                        key={y}
                                        type="button"
                                        onClick={() => { set_view_year(y); set_mode('day'); }}
                                        className={[
                                            'py-2 rounded-xl text-xs font-semibold transition-all',
                                            y === sel_y
                                                ? 'bg-gradient-to-br from-brand-emerald to-brand-blue text-white shadow-md'
                                                : y === new Date().getFullYear()
                                                    ? 'border border-brand-blue/40 text-brand-blue hover:bg-brand-blue/10'
                                                    : 'text-text-main hover:bg-white/8',
                                        ].join(' ')}
                                    >
                                        {y}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {value && (
                        <div className="px-3 pb-3 border-t border-white/6 pt-2">
                            <button
                                type="button"
                                onClick={() => { onChange(''); set_open(false); set_mode('day'); }}
                                className="w-full py-2 rounded-xl bg-white/5 border border-white/6 text-xs text-text-muted hover:text-text-main hover:bg-white/8 transition-colors"
                            >
                                Clear date
                            </button>
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

// ─── CropModal ────────────────────────────────────────────────────────────

const CropModal: React.FC<{
    src: string;
    onConfirm: (blob: Blob) => void;
    onCancel: () => void;
}> = ({ src, onConfirm, onCancel }) => {
    const [crop, set_crop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, set_zoom] = useState(1);
    const [pixels, set_pixels] = useState<Area | null>(null);
    const [applying, set_applying] = useState(false);

    const on_complete = useCallback((_: Area, px: Area) => set_pixels(px), []);

    const apply = async () => {
        if (!pixels) return;
        set_applying(true);
        try {
            const blob = await get_cropped_blob(src, pixels);
            onConfirm(blob);
        } finally {
            set_applying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-sm rounded-3xl border border-white/8 bg-bg-aside shadow-2xl shadow-black/60 overflow-hidden flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/6">
                    <p className="text-sm font-bold text-text-main">Crop Photo</p>
                    <button onClick={onCancel} className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/6 transition-colors">
                        <X size={15} />
                    </button>
                </div>

                {/* Cropper area */}
                <div className="relative w-full" style={{ height: 320 }}>
                    <Cropper
                        image={src}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={set_crop}
                        onZoomChange={set_zoom}
                        onCropComplete={on_complete}
                        style={{
                            containerStyle: { background: '#0A0C10' },
                            cropAreaStyle: { border: '2px solid #10B981', boxShadow: '0 0 0 9999em rgba(0,0,0,0.7)' },
                        }}
                    />
                </div>

                {/* Zoom slider */}
                <div className="px-5 py-4 border-t border-white/6 space-y-3">
                    <div className="flex items-center gap-3">
                        <button onClick={() => set_zoom(z => Math.max(1, z - 0.1))} className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/6 transition-colors">
                            <ZoomOut size={16} />
                        </button>
                        <input
                            type="range"
                            min={1} max={3} step={0.05}
                            value={zoom}
                            onChange={e => set_zoom(Number(e.target.value))}
                            className="flex-1 h-1.5 rounded-full accent-brand-emerald cursor-pointer"
                        />
                        <button onClick={() => set_zoom(z => Math.min(3, z + 0.1))} className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-white/6 transition-colors">
                            <ZoomIn size={16} />
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/8 text-sm font-semibold text-text-muted hover:text-text-main transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={apply}
                            disabled={applying}
                            className="flex-1 py-2.5 rounded-xl btn-primary text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {applying ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                            Apply
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────

export const ProfilePage: React.FC = () => {
    const file_ref = useRef<HTMLInputElement>(null);
    const [profile, set_profile] = useState<UserProfileData | null>(null);
    const [loading, set_loading] = useState(true);
    const [saving, set_saving] = useState(false);
    const [uploading, set_uploading] = useState(false);

    // form state
    const [first_name, set_first_name] = useState('');
    const [last_name, set_last_name] = useState('');
    const [gender, set_gender] = useState('');
    const [dob, set_dob] = useState('');
    const [mobile_code, set_mobile_code] = useState('+91');
    const [mobile_no, set_mobile_no] = useState('');
    const [wa_code, set_wa_code] = useState('+91');
    const [wa_no, set_wa_no] = useState('');

    // crop state
    const [crop_src, set_crop_src] = useState<string | null>(null);
    const [avatar, set_avatar] = useState<string | null>(null);

    useEffect(() => {
        get_profile().then(env => {
            if (env.success && env.data) {
                const d = env.data;
                set_profile(d);
                set_first_name(d.first_name);
                set_last_name(d.last_name);
                set_gender(d.gender ?? '');
                set_dob(d.dob ?? '');
                set_mobile_code(d.mobile_country_code ?? '+91');
                set_mobile_no(d.mobile_no ?? '');
                set_wa_code(d.whatsapp_country_code ?? '+91');
                set_wa_no(d.whatsapp_no ?? '');
                set_avatar(d.profile_picture ? `${d.profile_picture}?t=${Date.now()}` : null);
            }
        }).catch(() => toast.error('Failed to load profile'))
        .finally(() => set_loading(false));
    }, []);

    const handle_file = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.type)) {
            toast.error('Please upload a JPG, PNG, or WebP image (SVG not supported)');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => set_crop_src(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handle_crop_confirm = async (blob: Blob) => {
        set_crop_src(null);
        set_avatar(URL.createObjectURL(blob));
        set_uploading(true);
        try {
            let final_url: string | null = null;

            // Try direct R2 upload first (faster, no backend proxy).
            const url_env = await get_profile_pic_upload_url().catch(() => null);
            if (url_env?.success && url_env.data) {
                await upload_to_r2_direct(url_env.data.upload_url, blob);
                const confirm_env = await confirm_profile_pic();
                if (confirm_env.success && confirm_env.data) {
                    final_url = confirm_env.data.profile_picture;
                }
            }

            // Fall back to multipart upload through backend if R2 not configured.
            if (!final_url) {
                const file = new File([blob], 'profile.jpg', { type: 'image/jpeg' });
                const env = await update_profile_picture(file);
                if (env.success && env.data) {
                    final_url = env.data.profile_picture;
                } else {
                    toast.error(env.message || 'Upload failed');
                    set_avatar(profile?.profile_picture ?? null);
                    return;
                }
            }

            const bust = `${final_url}?t=${Date.now()}`;
            set_avatar(bust);
            toast.success('Profile photo updated');
            window.dispatchEvent(new CustomEvent('mmc:profile-updated', { detail: { avatar: bust } }));
        } catch {
            toast.error('Upload failed');
            set_avatar(profile?.profile_picture ?? null);
        } finally {
            set_uploading(false);
        }
    };

    const save = async () => {
        if (!first_name.trim()) { toast.error('First name is required'); return; }
        set_saving(true);
        try {
            const env = await update_profile({
                first_name: first_name.trim(),
                last_name: last_name.trim(),
                gender: gender || null,
                dob: dob || null,
                mobile_country_code: mobile_code || null,
                mobile_no: mobile_no.trim() || null,
                whatsapp_country_code: wa_code || null,
                whatsapp_no: wa_no.trim() || null,
            });
            if (env.success) {
                toast.success('Profile saved');
                window.dispatchEvent(new CustomEvent('mmc:profile-updated'));
            } else toast.error(env.message || 'Save failed');
        } catch {
            toast.error('Save failed');
        } finally {
            set_saving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw size={20} className="animate-spin text-text-muted" />
            </div>
        );
    }

    const initials = `${first_name[0] ?? ''}${last_name[0] ?? ''}`.toUpperCase() || profile?.username?.[0]?.toUpperCase() || 'U';

    return (
        <>
            {/* Crop modal */}
            {crop_src && (
                <CropModal
                    src={crop_src}
                    onConfirm={handle_crop_confirm}
                    onCancel={() => set_crop_src(null)}
                />
            )}

            {/* Hidden file input */}
            <input ref={file_ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handle_file} />

            {/* Page */}
            <div className="space-y-6 pb-10">

                {/* ── Hero Banner ── */}
                <div className="relative rounded-3xl overflow-hidden border border-white/8 bg-gradient-to-br from-brand-blue/15 via-brand-emerald/8 to-transparent">
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-brand-emerald/10 blur-3xl" />
                        <div className="absolute -bottom-8 left-1/3 w-56 h-56 rounded-full bg-brand-blue/12 blur-3xl" />
                    </div>
                    <div className="relative flex flex-col sm:flex-row items-center sm:items-end gap-6 px-8 pt-8 pb-7">
                        {/* Avatar */}
                        <div className="relative shrink-0">
                            <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white/12 shadow-2xl shadow-black/40 bg-gradient-to-br from-brand-emerald/40 to-brand-blue/30 flex items-center justify-center">
                                {avatar
                                    ? <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
                                    : <span className="text-3xl font-bold text-white/70">{initials}</span>}
                            </div>
                            <button
                                onClick={() => file_ref.current?.click()}
                                disabled={uploading}
                                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-gradient-to-br from-brand-emerald to-brand-blue border-2 border-bg-main flex items-center justify-center shadow-lg hover:scale-110 transition-transform disabled:opacity-60"
                            >
                                {uploading
                                    ? <RefreshCw size={14} className="animate-spin text-white" />
                                    : <Camera size={14} className="text-white" />}
                            </button>
                        </div>

                        {/* Identity */}
                        <div className="flex-1 min-w-0 text-center sm:text-left">
                            <h1 className="text-2xl font-extrabold text-text-main truncate">
                                {first_name || last_name ? `${first_name} ${last_name}`.trim() : profile?.username}
                            </h1>
                            <p className="text-sm text-text-muted mt-0.5 truncate">{profile?.email}</p>
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2.5">
                                {profile?.username && (
                                    <span className="text-[11px] text-text-muted/70 bg-white/6 border border-white/8 px-2.5 py-0.5 rounded-full">
                                        @{profile.username}
                                    </span>
                                )}
                                {profile?.register_type && (
                                    <span className="text-[11px] text-text-muted/70 bg-white/6 border border-white/8 px-2.5 py-0.5 rounded-full capitalize">
                                        {profile.register_type}
                                    </span>
                                )}
                                {gender && (
                                    <span className="text-[11px] text-text-muted/70 bg-white/6 border border-white/8 px-2.5 py-0.5 rounded-full capitalize">
                                        {gender}
                                    </span>
                                )}
                                {dob && (
                                    <span className="text-[11px] text-text-muted/70 bg-white/6 border border-white/8 px-2.5 py-0.5 rounded-full">
                                        {dob}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Change photo */}
                        <button
                            onClick={() => file_ref.current?.click()}
                            disabled={uploading}
                            className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/8 border border-white/12 text-sm font-semibold text-text-muted hover:text-text-main hover:bg-white/12 transition-all disabled:opacity-50"
                        >
                            <Camera size={15} /> Change Photo
                        </button>
                    </div>
                </div>

                {/* ── Form Grid ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* Personal Information */}
                    <div className="glass-card rounded-3xl p-6 space-y-5">
                        <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Personal Information</p>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] uppercase tracking-widest font-bold text-text-muted flex items-center gap-1.5">
                                    <User size={10} /> First Name
                                </label>
                                <input
                                    type="text"
                                    value={first_name}
                                    onChange={e => set_first_name(e.target.value)}
                                    placeholder="First name"
                                    className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/8 text-sm text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-brand-blue/50 focus:bg-white/8 transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] uppercase tracking-widest font-bold text-text-muted flex items-center gap-1.5">
                                    <User size={10} /> Last Name
                                </label>
                                <input
                                    type="text"
                                    value={last_name}
                                    onChange={e => set_last_name(e.target.value)}
                                    placeholder="Last name"
                                    className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/8 text-sm text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-brand-blue/50 focus:bg-white/8 transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase tracking-widest font-bold text-text-muted flex items-center gap-1.5">
                                <Mail size={10} /> Email Address
                            </label>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={profile?.email ?? ''}
                                    disabled
                                    className="w-full h-11 px-4 pr-20 rounded-xl bg-white/3 border border-white/5 text-sm text-text-muted cursor-not-allowed"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-text-muted/50 bg-white/5 px-2 py-0.5 rounded-full border border-white/6">
                                    read only
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <CustomSelect
                                label="Gender"
                                value={gender}
                                onChange={set_gender}
                                icon={<User size={10} />}
                                options={[
                                    { value: '', label: 'Prefer not to say' },
                                    { value: 'male', label: 'Male' },
                                    { value: 'female', label: 'Female' },
                                    { value: 'other', label: 'Other' },
                                ]}
                            />
                            <DatePicker
                                label="Date of Birth"
                                value={dob}
                                onChange={set_dob}
                                icon={<Calendar size={10} />}
                            />
                        </div>
                    </div>

                    {/* Phone Numbers */}
                    <div className="glass-card rounded-3xl p-6 space-y-5">
                        <p className="text-xs font-bold text-text-muted uppercase tracking-widest">Phone Numbers</p>

                        <PhoneField
                            label="Mobile Number"
                            icon={<Phone size={10} />}
                            country_code={mobile_code}
                            number={mobile_no}
                            on_country={set_mobile_code}
                            on_number={set_mobile_no}
                        />

                        <PhoneField
                            label="WhatsApp Number"
                            icon={<Phone size={10} className="text-[#25D366]" />}
                            country_code={wa_code}
                            number={wa_no}
                            on_country={set_wa_code}
                            on_number={set_wa_no}
                        />

                        <div className="rounded-2xl bg-white/3 border border-white/6 p-3.5 flex items-start gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] shrink-0 mt-1.5" />
                            <p className="text-[11px] text-text-muted/70 leading-relaxed">
                                Your WhatsApp number is used to send important alerts. Enable WhatsApp notifications in <span className="text-text-muted font-semibold">Notifications → Settings</span>.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Save */}
                <div className="flex justify-end">
                    <button
                        onClick={save}
                        disabled={saving}
                        className="flex items-center gap-2 px-8 py-3 rounded-2xl btn-primary text-sm font-semibold disabled:opacity-60"
                    >
                        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        Save Changes
                    </button>
                </div>
            </div>
        </>
    );
};

export default ProfilePage;
