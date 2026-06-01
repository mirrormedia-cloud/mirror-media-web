import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import OTTBasicDetails, {
  OttBasicDetailsHandle,
  OttBasicDetailsValue,
} from './steps/OTTBasicDetails';
import CookieSection, {
  CookieSectionHandle,
  CookieSectionValue,
} from './steps/CookieSection';
import HeaderManagerSection, {
  HeaderManagerHandle,
} from './steps/HeaderManagerSection';
import { ott_service, notify_ott_list_updated } from '../../../services/ott_service';

interface Props {
  isEdit?: boolean;
}

interface DraftState extends OttBasicDetailsValue, CookieSectionValue {
  headers: Record<string, string>;
}

const empty_draft: DraftState = {
  name: '',
  description: '',
  base_url: '',
  favicon_url: '',
  cookie_file_name: null,
  cookie_raw_content: null,
  cookie_string: '',
  headers: {},
};

const RegisterOTT: React.FC<Props> = ({ isEdit = false }) => {
  const { ott_id } = useParams<{ ott_id: string }>();
  const navigate = useNavigate();

  const [draft, set_draft] = useState<DraftState>(empty_draft);
  const [submitting, set_submitting] = useState(false);
  const [submit_error, set_submit_error] = useState<string | null>(null);
  const [load_error, set_load_error] = useState<string | null>(null);
  const [loading, set_loading] = useState<boolean>(false);

  const basic_ref = useRef<OttBasicDetailsHandle>(null);
  const cookies_ref = useRef<CookieSectionHandle>(null);
  const headers_ref = useRef<HeaderManagerHandle>(null);

  useEffect(() => {
    if (!isEdit || !ott_id) return;
    let cancelled = false;
    set_loading(true);
    ott_service.get_ott_by_id(ott_id)
      .then(res => {
        if (cancelled) return;
        if (!res.success || !res.data) {
          set_load_error(res.message || 'Failed to load OTT');
          return;
        }
        const detail = res.data;
        set_draft({
          name: detail.name,
          description: detail.description ?? '',
          base_url: detail.base_url,
          favicon_url: detail.favicon_url ?? '',
          cookie_file_name: detail.cookie_file_name ?? null,
          cookie_raw_content: null,
          cookie_string: '',
          headers: (detail.headers || {}) as Record<string, string>,
        });
      })
      .catch(err => !cancelled && set_load_error(err?.message || 'Failed to load OTT'))
      .finally(() => !cancelled && set_loading(false));
    return () => { cancelled = true; };
  }, [isEdit, ott_id]);

  const handle_save = async () => {
    set_submit_error(null);
    const basic = basic_ref.current?.validate() ?? null;
    const cookies = cookies_ref.current?.validate() ?? null;
    const headers_value = headers_ref.current?.validate() ?? null;
    if (!basic || !cookies || !headers_value) return;

    const merged: DraftState = { ...draft, ...basic, ...cookies, headers: headers_value.headers };
    set_draft(merged);
    set_submitting(true);
    try {
      let saved_id = ott_id;
      if (isEdit && ott_id) {
        const payload: Record<string, any> = {
          name: merged.name,
          description: merged.description,
          base_url: merged.base_url,
          headers: merged.headers,
          favicon_url: merged.favicon_url ? merged.favicon_url : null,
        };
        if (merged.cookie_file_name) payload.cookie_file_name = merged.cookie_file_name;
        if (merged.cookie_raw_content) payload.cookie_raw_content = merged.cookie_raw_content;
        if (merged.cookie_string) payload.cookie_string = merged.cookie_string;
        const res = await ott_service.update_ott(ott_id, payload);
        if (!res.success) throw new Error(res.message || 'Failed to update OTT');
        toast.success(res.message || 'OTT updated successfully');
      } else {
        const payload: Record<string, any> = {
          name: merged.name,
          description: merged.description || '',
          base_url: merged.base_url,
          headers: merged.headers || {},
        };
        if (merged.favicon_url) payload.favicon_url = merged.favicon_url;
        if (merged.cookie_file_name) payload.cookie_file_name = merged.cookie_file_name;
        if (merged.cookie_raw_content) payload.cookie_raw_content = merged.cookie_raw_content;
        if (merged.cookie_string) payload.cookie_string = merged.cookie_string;
        const res = await ott_service.create_ott(payload as any);
        if (!res.success || !res.data) throw new Error(res.message || 'Failed to create OTT');
        toast.success(res.message || 'OTT created successfully');
        saved_id = res.data.id;
      }
      notify_ott_list_updated();
      if (saved_id) navigate(`/dashboard/ott/${saved_id}/manage`);
      else navigate('/dashboard/ott/all');
    } catch (err: any) {
      set_submit_error(err?.message || 'Failed to save OTT');
      toast.error(err?.message || 'Failed to save OTT');
    } finally {
      set_submitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-text-muted">
        <Loader2 size={36} className="animate-spin" />
        <p className="text-sm">Loading OTT…</p>
      </div>
    );
  }

  if (load_error) {
    return (
      <div className="p-12 text-center space-y-4">
        <p className="text-lg font-bold text-red-500">{load_error}</p>
        <button onClick={() => navigate('/dashboard/ott/all')} className="btn-primary px-8">Back to All OTTs</button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-10 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text-main">{isEdit ? 'Edit OTT' : 'Register New OTT'}</h1>
        <p className="text-sm text-text-muted">
          {isEdit
            ? 'Update platform details, cookies, and headers.'
            : 'Configure a new OTT platform. API endpoints can be added after creation.'}
        </p>
      </div>

      {submit_error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
          {submit_error}
        </div>
      )}

      {/* Two-column split: basic fields take ~40% on the left, cookie
          configuration takes the remaining ~60% on the right. Stacks
          vertically on smaller screens. */}
      <div className="grid grid-cols-1 lg:grid-cols-[40%_1fr] gap-10">
        <div className="lg:border-r lg:border-border-subtle lg:pr-10">
          <OTTBasicDetails ref={basic_ref} data={draft} embedded />
        </div>
        <div>
          <CookieSection ref={cookies_ref} data={draft} />
        </div>
      </div>

      <div className="h-px w-full bg-border-subtle" />

      {/* Custom Headers spans the full page width below the 2-col split. */}
      <HeaderManagerSection ref={headers_ref} data={draft} />

      <div className="h-px w-full bg-border-subtle" />

      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => navigate('/dashboard/ott/all')}
          disabled={submitting}
          className="px-6 py-3 bg-black/5 dark:bg-white/5 border border-border-subtle text-text-main font-bold rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handle_save}
          disabled={submitting}
          className="btn-primary px-8 py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting && <Loader2 size={18} className="animate-spin" />}
          {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create OTT'}
        </button>
      </div>
    </div>
  );
};

export default RegisterOTT;
