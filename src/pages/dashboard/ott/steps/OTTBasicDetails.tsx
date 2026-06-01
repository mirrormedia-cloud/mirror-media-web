import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Input } from '../../../../components/ui/Input';
import { ChevronRight, Image as ImageIcon } from 'lucide-react';

export interface OttBasicDetailsValue {
  name: string;
  description: string;
  base_url: string;
  favicon_url: string;
}

export interface OttBasicDetailsHandle {
  /** Run validation and return the form value, or null when invalid (errors
   *  are surfaced inline on the fields). Used by the parent when this step
   *  is rendered embedded inside a unified CRUD page. */
  validate: () => OttBasicDetailsValue | null;
}

interface Props {
  data: Partial<OttBasicDetailsValue>;
  /** Only invoked in standalone (non-embedded) mode. */
  onNext?: (data: OttBasicDetailsValue) => void;
  onCancel?: () => void;
  /** When true: no glass-card wrapper, no action buttons. Parent provides
   *  layout + a single Save action and drives validation via the ref. */
  embedded?: boolean;
}

const OTTBasicDetails = forwardRef<OttBasicDetailsHandle, Props>(({ data, onNext, onCancel, embedded = false }, ref) => {
  const [name, setName] = useState(data.name || '');
  const [description, setDescription] = useState(data.description || '');
  const [base_url, setBaseUrl] = useState(data.base_url || '');
  const [favicon_url, setFaviconUrl] = useState(data.favicon_url || '');
  const [favicon_load_error, setFaviconLoadError] = useState(false);
  const [name_error, setNameError] = useState('');
  const [base_url_error, setBaseUrlError] = useState('');

  useEffect(() => {
    setName(data.name || '');
    setDescription(data.description || '');
    setBaseUrl(data.base_url || '');
    setFaviconUrl(data.favicon_url || '');
    setFaviconLoadError(false);
  }, [data.name, data.description, data.base_url, data.favicon_url]);

  const validate_internal = (): OttBasicDetailsValue | null => {
    let has_error = false;
    if (!name || name.length < 3) {
      setNameError('OTT Name must be at least 3 characters');
      has_error = true;
    } else {
      setNameError('');
    }
    if (!base_url || !/^https:\/\//i.test(base_url)) {
      setBaseUrlError('A valid base URL starting with https:// is required');
      has_error = true;
    } else {
      setBaseUrlError('');
    }
    if (has_error) return null;
    return { name, description, base_url, favicon_url: favicon_url.trim() };
  };

  useImperativeHandle(ref, () => ({ validate: validate_internal }));

  const handle_submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate_internal();
    if (result && onNext) onNext(result);
  };

  const wrapper_cls = embedded
    ? 'space-y-6'
    : 'glass-card p-6 max-w-2xl mx-auto space-y-6';

  return (
    <div className={wrapper_cls}>
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-text-main">Basic Information</h2>
        <p className="text-text-muted text-xs">Provide a name and base URL for this OTT integration.</p>
      </div>

      <form onSubmit={handle_submit} className="space-y-5">
        <Input
          label="OTT Name"
          placeholder="e.g. Kuku TV, Disney+, MyCustomOTT"
          value={name}
          onChange={(val) => {
            setName(val);
            if (val.length >= 3) setNameError('');
          }}
          error={name_error}
        />

        <Input
          label="Base API URL (https only)"
          placeholder="https://api.example.com"
          value={base_url}
          onChange={(val) => {
            setBaseUrl(val);
            if (/^https:\/\//i.test(val)) setBaseUrlError('');
          }}
          error={base_url_error}
        />

        {/* Favicon — preview shown when the URL loads. Falls back to a
            placeholder icon when empty or broken so the user gets feedback. */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text-muted ml-1">Favicon URL (optional)</label>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 border border-border-subtle flex items-center justify-center overflow-hidden shrink-0">
              {favicon_url && !favicon_load_error ? (
                <img
                  src={favicon_url}
                  alt="favicon"
                  className="w-full h-full object-contain"
                  onError={() => setFaviconLoadError(true)}
                  onLoad={() => setFaviconLoadError(false)}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <ImageIcon size={16} className="text-text-muted" />
              )}
            </div>
            <input
              type="text"
              value={favicon_url}
              onChange={(e) => { setFaviconUrl(e.target.value); setFaviconLoadError(false); }}
              placeholder="https://example.com/favicon.ico"
              className="input-field py-2 text-sm flex-1"
            />
          </div>
          {favicon_url && favicon_load_error && (
            <p className="text-[10px] text-amber-500 ml-1">Couldn't load that image — check the URL.</p>
          )}
          <p className="text-[10px] text-text-muted ml-1">Shown in the sidebar and OTT header. Paste a public icon URL.</p>
        </div>

        <div className="space-y-1.5 flex flex-col">
          <label className="text-sm font-medium text-text-muted ml-1">Description (Optional)</label>
          <textarea
            className="input-field min-h-[100px] py-2.5 resize-none text-sm"
            placeholder="Talk about the purpose or region of this OTT..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {!embedded && (
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-5 py-3 bg-black/5 dark:bg-white/5 border border-border-subtle text-text-main text-sm font-bold rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 btn-primary py-3 text-sm flex items-center justify-center gap-2"
            >
              Next Step
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </form>
    </div>
  );
});

OTTBasicDetails.displayName = 'OTTBasicDetails';

export default OTTBasicDetails;
