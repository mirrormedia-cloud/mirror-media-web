import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { X, Terminal, Plus, ClipboardPaste, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../../../components/ui/ConfirmDialog';

export interface HeaderManagerValue {
  headers: Record<string, string>;
}

export interface HeaderManagerHandle {
  validate: () => HeaderManagerValue | null;
}

interface Props {
  data: { headers?: Record<string, string> };
}

interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

const make_id = () => Math.random().toString(36).slice(2, 10);

function rows_from_record(rec: Record<string, string> | undefined): HeaderRow[] {
  if (!rec) return [];
  return Object.entries(rec).map(([k, v]) => ({ id: make_id(), key: k, value: String(v ?? '') }));
}

function record_from_rows(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const key = r.key.trim();
    if (!key) continue;
    out[key] = r.value;
  }
  return out;
}

function parse_headers(text: string): Record<string, string> {
  const lines = text.split('\n');
  const result: Record<string, string> = {};
  lines.forEach(line => {
    const colon_index = line.indexOf(':');
    if (colon_index !== -1) {
      const key = line.slice(0, colon_index).trim().replace(/^["']|["']$/g, '').toLowerCase();
      const value = line.slice(colon_index + 1).trim().replace(/^["']|["']$/g, '');
      if (key && value) result[key] = value;
    }
  });
  return result;
}

const HeaderManagerSection = forwardRef<HeaderManagerHandle, Props>(({ data }, ref) => {
  const confirm = useConfirm();
  const [header_rows, setHeaderRows] = useState<HeaderRow[]>(() => rows_from_record(data.headers));
  const [raw_headers, setRawHeaders] = useState('');

  const add_header = () => setHeaderRows(prev => [...prev, { id: make_id(), key: '', value: '' }]);
  const update_header_key = (id: string, key: string) =>
    setHeaderRows(prev => prev.map(r => r.id === id ? { ...r, key } : r));
  const update_header_value = (id: string, value: string) =>
    setHeaderRows(prev => prev.map(r => r.id === id ? { ...r, value } : r));
  const remove_header = (id: string) => setHeaderRows(prev => prev.filter(r => r.id !== id));

  const merge_pasted_headers = () => {
    if (!raw_headers.trim()) {
      toast('Paste headers in the textarea first');
      return;
    }
    const parsed = parse_headers(raw_headers);
    const parsed_keys = Object.keys(parsed);
    if (parsed_keys.length === 0) {
      toast.error('No valid header lines found in the paste');
      return;
    }
    setHeaderRows(prev => {
      const next = [...prev];
      let added = 0;
      let updated = 0;
      for (const k of parsed_keys) {
        const existing = next.find(r => r.key.trim().toLowerCase() === k.toLowerCase());
        if (existing) {
          existing.value = parsed[k]!;
          updated++;
        } else {
          next.push({ id: make_id(), key: k, value: parsed[k]! });
          added++;
        }
      }
      toast.success(`Merged ${added} new + ${updated} updated header${added + updated === 1 ? '' : 's'}`);
      return next;
    });
    setRawHeaders('');
  };

  const copy_all_headers = async () => {
    const valid = header_rows.filter(r => r.key.trim());
    if (valid.length === 0) {
      toast('No headers to copy');
      return;
    }
    const text = valid.map(r => `${r.key.trim()}: ${r.value}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${valid.length} header${valid.length === 1 ? '' : 's'} to clipboard`);
    } catch {
      toast.error('Failed to copy — clipboard permission denied');
    }
  };

  const clear_all_headers = async () => {
    if (header_rows.length === 0) return;
    const ok = await confirm({
      title: `Remove all ${header_rows.length} header${header_rows.length === 1 ? '' : 's'}?`,
      message: 'You will lose every header you\'ve added to this OTT.',
      confirm_label: 'Remove all',
      danger: true,
    });
    if (!ok) return;
    setHeaderRows([]);
  };

  useImperativeHandle(ref, () => ({
    validate: (): HeaderManagerValue | null => {
      const invalid = header_rows.find(r => r.value && !r.key.trim());
      if (invalid) {
        toast.error('Header key cannot be empty when a value is set');
        return null;
      }
      return { headers: record_from_rows(header_rows) };
    },
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-brand-blue/10 text-brand-blue">
            <Terminal size={18} />
          </div>
          <div>
            <h3 className="font-bold text-text-main text-sm">Custom Headers</h3>
            <p className="text-[11px] text-text-muted">
              {header_rows.length === 0
                ? 'No headers yet — add one or paste below.'
                : `${header_rows.length} header${header_rows.length === 1 ? '' : 's'} configured`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {header_rows.length > 0 && (
            <>
              <button
                type="button"
                onClick={copy_all_headers}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-brand-blue border border-border-subtle text-xs font-bold transition-colors"
                title="Copy all headers to clipboard"
              >
                <Copy size={12} />
                Copy All
              </button>
              <button
                type="button"
                onClick={clear_all_headers}
                className="text-[10px] font-bold text-text-muted hover:text-red-400 px-2 py-1.5"
              >
                Clear All
              </button>
            </>
          )}
          <button
            type="button"
            onClick={add_header}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/30 text-xs font-bold hover:bg-brand-emerald/20"
          >
            <Plus size={12} />
            Add Header
          </button>
        </div>
      </div>

      {header_rows.length > 0 && (
        <div className="space-y-2">
          {header_rows.map((row, idx) => (
            <div key={row.id} className="flex items-center gap-2 group">
              <input
                type="text"
                value={row.key}
                onChange={(e) => update_header_key(row.id, e.target.value)}
                placeholder="header-name"
                className="bg-black/10 dark:bg-white/5 border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-main placeholder-text-muted/50 focus:outline-none focus:ring-1 focus:ring-brand-emerald/50 w-1/3"
                autoFocus={idx === header_rows.length - 1 && !row.key && !row.value}
              />
              <span className="text-text-muted/60 text-xs">:</span>
              <input
                type="text"
                value={row.value}
                onChange={(e) => update_header_value(row.id, e.target.value)}
                placeholder="value"
                className="flex-1 bg-black/10 dark:bg-white/5 border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-main placeholder-text-muted/50 focus:outline-none focus:ring-1 focus:ring-brand-emerald/50"
              />
              <button
                type="button"
                onClick={() => remove_header(row.id)}
                className="p-2 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-all shrink-0"
                title="Remove header"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-border-subtle space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Bulk paste</p>
          <button
            type="button"
            onClick={merge_pasted_headers}
            disabled={!raw_headers.trim()}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-brand-blue/10 text-brand-blue border border-brand-blue/30 text-[10px] font-bold hover:bg-brand-blue/20 disabled:opacity-40"
          >
            <ClipboardPaste size={11} />
            Merge into list
          </button>
        </div>
        <textarea
          className="input-field min-h-[100px] py-2.5 font-mono text-[11px] resize-none"
          placeholder={'authorization: Bearer token\nuser-agent: Mozilla/5.0...\naccept: application/json'}
          value={raw_headers}
          onChange={(e) => setRawHeaders(e.target.value)}
        />
        <p className="text-[10px] text-text-muted">
          Paste raw headers from browser dev tools, then click <span className="font-bold">Merge into list</span> — existing keys get updated, new keys are added.
        </p>
      </div>
    </div>
  );
});

HeaderManagerSection.displayName = 'HeaderManagerSection';

export default HeaderManagerSection;
