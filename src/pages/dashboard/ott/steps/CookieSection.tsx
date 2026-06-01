import React, { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { Upload, FileText, X, ShieldCheck } from 'lucide-react';
import { normalizeCookieInput } from '../../../../utils/cookieUtils';

export interface CookieSectionValue {
  cookie_file_name: string | null;
  cookie_raw_content: string | null;
  cookie_string: string;
}

export interface CookieSectionHandle {
  validate: () => CookieSectionValue;
}

interface Props {
  data: Partial<CookieSectionValue>;
}

const CookieSection = forwardRef<CookieSectionHandle, Props>(({ data }, ref) => {
  const [cookie_file_name, setCookieFileName] = useState<string | null>(data.cookie_file_name ?? null);
  const [cookie_raw_content, setCookieRawContent] = useState<string | null>(data.cookie_raw_content ?? null);
  const [manual_cookie, setManualCookie] = useState<string>(data.cookie_string ?? '');
  const file_input_ref = useRef<HTMLInputElement>(null);

  const handle_file_upload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      setCookieFileName(file.name);
      setCookieRawContent(content);
      if (!manual_cookie) setManualCookie(normalizeCookieInput(content));
    };
    reader.readAsText(file);
  };

  useImperativeHandle(ref, () => ({
    validate: (): CookieSectionValue => ({
      cookie_file_name,
      cookie_raw_content,
      cookie_string: normalizeCookieInput(manual_cookie || cookie_raw_content || ''),
    }),
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand-emerald/10 text-brand-emerald">
            <FileText size={20} />
          </div>
          <div>
            <h3 className="font-bold text-text-main">Authentication Cookie File</h3>
            <p className="text-xs text-text-muted">Upload a .txt or .json cookie export</p>
          </div>
        </div>

        {!cookie_file_name ? (
          <div
            onClick={() => file_input_ref.current?.click()}
            className="border-2 border-dashed border-border-subtle rounded-2xl p-10 flex flex-col items-center justify-center gap-4 hover:border-brand-emerald/50 hover:bg-brand-emerald/5 transition-all cursor-pointer group"
          >
            <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Upload size={32} className="text-text-muted" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-text-main">Click to upload</p>
              <p className="text-xs text-text-muted mt-1">Accepts .txt, .json, .cookies</p>
            </div>
          </div>
        ) : (
          <div className="bg-black/5 dark:bg-white/5 border border-brand-emerald/20 rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-emerald/10 flex items-center justify-center text-brand-emerald">
                  <FileText size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-text-main truncate max-w-[150px]">{cookie_file_name}</p>
                  <p className="text-[10px] text-brand-emerald font-bold uppercase tracking-wider">Cookie File Ready</p>
                </div>
              </div>
              <button
                onClick={() => { setCookieFileName(null); setCookieRawContent(null); }}
                className="p-2 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-all"
              >
                <X size={18} />
              </button>
            </div>
            {cookie_raw_content && (
              <div className="h-24 bg-black/20 dark:bg-black/40 rounded-xl p-3 font-mono text-[10px] overflow-auto text-text-muted break-all">
                {cookie_raw_content.slice(0, 600)}
              </div>
            )}
          </div>
        )}
        <input type="file" ref={file_input_ref} onChange={handle_file_upload} className="hidden" />
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand-emerald/10 text-brand-emerald">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="font-bold text-text-main">Manual Cookie String</h3>
            <p className="text-xs text-text-muted">Paste a raw cookie string (overrides the file)</p>
          </div>
        </div>

        <div className="space-y-2">
          <textarea
            className="input-field min-h-[160px] py-4 font-mono text-xs resize-none"
            placeholder="jwtToken=abc; preferred_lang=hi; ..."
            value={manual_cookie}
            onChange={(e) => setManualCookie(e.target.value)}
          />
          <p className="text-[10px] text-text-muted">If provided, this is what is sent as the Cookie header.</p>
        </div>
      </div>
    </div>
  );
});

CookieSection.displayName = 'CookieSection';

export default CookieSection;
