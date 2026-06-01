/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ApiCallLog } from '../../types';
import {
  Terminal,
  Search,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Loader2,
  Copy,
  RefreshCcw,
  RefreshCw,
  Globe,
  FileJson,
  Cookie,
  Inbox,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { JsonTreeViewer } from '../ui/JsonTreeViewer';

type LogDetailTab = 'endpoint' | 'headers' | 'body' | 'cookies' | 'response';

/** Parse query params off a URL into a plain key/value object so the
 *  Endpoint tab can render them in a readable structured table instead
 *  of a long unparsed query string. */
function parse_query_params(url: string | null | undefined): Record<string, string> {
  if (!url) return {};
  const q = url.indexOf('?');
  if (q < 0) return {};
  const params = new URLSearchParams(url.slice(q + 1));
  const out: Record<string, string> = {};
  params.forEach((v, k) => { out[k] = v; });
  return out;
}

/** Strip the query string off a URL so the Endpoint tab can show the
 *  pure path separately from the (now structured) params. */
function strip_query(url: string | null | undefined): string {
  if (!url) return '';
  const q = url.indexOf('?');
  return q < 0 ? url : url.slice(0, q);
}

interface Props {
  /** Logs (used in legacy controlled mode). Ignored when `ott_id` is set
   *  since the console then self-fetches with server-side filters +
   *  pagination. */
  logs?: ApiCallLog[];
  onClear: () => void;
  onRetry?: (log: ApiCallLog) => void;
  className?: string;
  initialSearch?: string;
  /** OTT id. When provided, DebugConsole self-fetches logs from
   *  `/api/ott/:ott_id/logs` with server-side search + status filter +
   *  pagination, and lazy-loads each row's full detail on expand. When
   *  omitted, falls back to the legacy `logs` prop. */
  ott_id?: string;
}

const DebugConsole: React.FC<Props> = ({ logs: external_logs, onClear, onRetry, className = '', initialSearch = '', ott_id }) => {
  const [search_term, setSearchTerm] = useState(initialSearch);
  const [status_filter, setStatusFilter] = useState<'all' | 'success' | 'failed' | 'pending'>('all');
  const [expanded, setExpanded] = useState<string[]>([]);
  // Active detail tab per expanded log. Defaults to "response" since
  // that's what users open the panel to look at most often.
  const [active_tab, setActiveTab] = useState<Record<string, LogDetailTab>>({});

  // Lazy-loaded heavy fields (response body, request headers, request
  // body) per log id. Keyed off log.id; populated the first time a log
  // is expanded. Saves the frontend from receiving every response on the
  // initial /logs list call (which would balloon the payload).
  const [details, setDetails] = useState<Record<string, Partial<ApiCallLog>>>({});
  const [detail_loading, setDetailLoading] = useState<Record<string, boolean>>({});

  // ── Server-side mode (when ott_id is provided) ───────────────────────
  // Owns logs / pagination state internally and fetches against the
  // backend so search + status filter + page size all hit the API
  // directly. Default ordering is newest-first (backend default).
  const is_server_mode = !!ott_id;
  const [server_logs, setServerLogs] = useState<ApiCallLog[]>([]);
  const [server_total, setServerTotal] = useState(0);
  const [server_loading, setServerLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  // Debounced search — wait 300ms after the user stops typing before
  // hitting the API, otherwise every keystroke fires a request.
  const [debounced_search, setDebouncedSearch] = useState(initialSearch);
  const search_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (search_timer_ref.current) clearTimeout(search_timer_ref.current);
    search_timer_ref.current = setTimeout(() => setDebouncedSearch(search_term), 300);
    return () => {
      if (search_timer_ref.current) clearTimeout(search_timer_ref.current);
    };
  }, [search_term]);
  // Reset to page 1 whenever a filter narrows the result set — mirrors
  // the standard library page behaviour ("don't strand the user on
  // page 5 of 1").
  useEffect(() => {
    if (is_server_mode) setPage(1);
  }, [debounced_search, status_filter, is_server_mode]);

  const fetch_logs = async () => {
    if (!ott_id) return;
    setServerLoading(true);
    try {
      const { ott_service } = await import('../../services/ott_service');
      const params: any = { page, limit };
      if (debounced_search.trim()) params.search = debounced_search.trim();
      if (status_filter !== 'all') params.status = status_filter;
      const res = await ott_service.get_ott_logs(ott_id, params);
      if (res.success && res.data) {
        setServerLogs(res.data.items || []);
        setServerTotal(res.data.total || 0);
      } else {
        toast.error(res.message || 'Failed to load logs');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load logs');
    } finally {
      setServerLoading(false);
    }
  };

  useEffect(() => {
    if (is_server_mode) void fetch_logs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ott_id, page, limit, debounced_search, status_filter, is_server_mode]);

  // The list the rest of the component renders against — server logs in
  // server mode, otherwise the legacy controlled `logs` prop.
  const logs = is_server_mode ? server_logs : (external_logs ?? []);
  const total_pages = Math.max(1, Math.ceil(server_total / limit));
  const first_visible = server_total === 0 ? 0 : ((page - 1) * limit) + 1;
  const last_visible = Math.min(page * limit, server_total);

  /** Merge the original log row with whatever detail was lazy-loaded for
   *  it. The detail wins on `response` / `request_headers` / `request_body`
   *  / `error_details` since the list endpoint omits those fields. */
  const enrich_log = (log: ApiCallLog): ApiCallLog => {
    const extra = details[log.id];
    return extra ? { ...log, ...extra } : log;
  };

  /** Fetch the full log detail on first expansion. No-op if we already
   *  have the heavy fields (e.g. the parent passed them in directly) or
   *  if a fetch is already in flight. */
  const ensure_detail = async (log: ApiCallLog) => {
    if (!ott_id) return;
    if (details[log.id]) return;
    if (detail_loading[log.id]) return;
    // If the row already carries the response / headers / body inline,
    // there's nothing to fetch.
    if (log.response !== undefined || log.request_headers || log.request_body !== undefined) return;
    setDetailLoading(prev => ({ ...prev, [log.id]: true }));
    try {
      // Lazy import to avoid a circular dep with services/ott_service.
      const { ott_service } = await import('../../services/ott_service');
      const res = await ott_service.get_log_by_id(ott_id, log.id);
      if (res.success && res.data) {
        setDetails(prev => ({
          ...prev,
          [log.id]: {
            response: res.data!.response,
            request_headers: res.data!.request_headers,
            request_body: res.data!.request_body,
            error_details: res.data!.error_details,
          },
        }));
      }
    } catch {
      // Detail fetch is best-effort; the panel still renders summary data.
    } finally {
      setDetailLoading(prev => ({ ...prev, [log.id]: false }));
    }
  };

  const filtered_logs = useMemo(() => {
    // In server mode the API has already applied search + status, so we
    // just render whatever came back. In legacy controlled mode we keep
    // the original client-side filtering for backwards compat.
    if (is_server_mode) return logs;
    const term = search_term.toLowerCase();
    return logs.filter(log => {
      const matches_status = status_filter === 'all' || log.status === status_filter;
      const matches_search =
        !term ||
        (log.api_name || '').toLowerCase().includes(term) ||
        (log.resolved_endpoint || '').toLowerCase().includes(term) ||
        (log.request_url || '').toLowerCase().includes(term);
      return matches_status && matches_search;
    });
  }, [logs, search_term, status_filter, is_server_mode]);

  const toggle = (log: ApiCallLog) => {
    setExpanded(prev => {
      const is_open = prev.includes(log.id);
      if (is_open) return prev.filter(l => l !== log.id);
      // First-time open — kick off the detail fetch in the background.
      void ensure_detail(log);
      return [...prev, log.id];
    });
  };

  const copy = async (text: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      toast.error('Clipboard not available');
    }
  };

  const status_color = (status: string) => {
    switch (status) {
      case 'success': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'failed': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-black/5 text-text-muted border-border-subtle';
    }
  };

  // Per-method colour pill. Distinct hues so a long log list scans like
  // a request log in DevTools — GET vs POST vs DELETE pop out
  // immediately without reading the text.
  const method_pill = (method: string | null | undefined) => {
    const m = (method || 'GET').toUpperCase();
    const palette: Record<string, string> = {
      GET: 'bg-brand-blue/15 text-brand-blue border-brand-blue/25',
      POST: 'bg-brand-emerald/15 text-brand-emerald border-brand-emerald/25',
      PUT: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
      PATCH: 'bg-purple-500/15 text-purple-400 border-purple-500/25',
      DELETE: 'bg-red-500/15 text-red-400 border-red-500/25',
    };
    const cls = palette[m] || 'bg-text-muted/10 text-text-muted border-border-subtle';
    return (
      <span className={`inline-flex items-center justify-center px-2 h-[20px] rounded-md text-[10px] font-bold tracking-wide border ${cls}`}>
        {m}
      </span>
    );
  };

  // Tiny coloured dot used as the leading status indicator. Cleaner than
  // a full icon in a dense list — scans down the column like a build log.
  const status_dot = (status: string) => {
    const color =
      status === 'success' ? 'bg-emerald-500'
        : status === 'failed' ? 'bg-red-500'
          : status === 'pending' ? 'bg-amber-500'
            : 'bg-text-muted';
    return <span className={`inline-block w-2 h-2 rounded-full ${color} ${status === 'pending' ? 'animate-pulse' : ''}`} />;
  };

  // Format the started_at timestamp into HH:MM:SS — matches the
  // existing density without spilling onto a second line.
  const fmt_time = (t: string | null | undefined): string => {
    if (!t) return '—';
    try {
      return new Date(t).toLocaleTimeString([], { hour12: false });
    } catch { return '—'; }
  };

  // When this OTT has zero logs AND no filter / search is narrowing them
  // away, drop the entire Debug Console chrome (header + filter bar +
  // pagination) and show a clean centered "No logs" state. We keep the
  // full console whenever a filter is active so the user can adjust it.
  const has_active_filter = !!search_term.trim() || status_filter !== 'all';
  const total_count = is_server_mode ? server_total : logs.length;
  const show_empty_state =
    total_count === 0 && !has_active_filter && !(is_server_mode && server_loading);

  if (show_empty_state) {
    return (
      <div className={`flex flex-col items-center justify-center bg-bg-aside border border-border-subtle rounded-3xl text-text-muted ${className}`}>
        <Terminal size={40} className="mb-4 opacity-30" />
        <p className="text-sm font-semibold">No logs</p>
        <p className="text-[11px] mt-1 opacity-60">Make an API call to see request activity here.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-bg-aside border border-border-subtle rounded-3xl overflow-hidden ${className}`}>
      <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-black/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-emerald/10 text-brand-emerald flex items-center justify-center">
            <Terminal size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-main">Debug Console</h3>
            <p className="text-[10px] text-text-muted font-mono uppercase tracking-widest mt-0.5">
              {is_server_mode ? server_total : logs.length} Total Logs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {is_server_mode && (
            <button
              onClick={() => fetch_logs()}
              disabled={server_loading}
              className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-text-main transition-colors disabled:opacity-50"
              title="Refresh logs"
            >
              <RefreshCw size={16} className={server_loading ? 'animate-spin' : ''} />
            </button>
          )}
          <button
            onClick={async () => {
              try {
                await onClear();
                if (is_server_mode) {
                  setServerLogs([]);
                  setServerTotal(0);
                  setPage(1);
                }
              } catch { /* parent handles error */ }
            }}
            className="p-2 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-colors"
            title="Clear Logs"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="p-3 border-b border-border-subtle flex flex-wrap gap-2 items-center bg-black/5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
          <input
            type="text"
            placeholder="Search logs..."
            className="w-full bg-bg-main border border-border-subtle rounded-xl pl-9 pr-4 py-2 text-xs focus:ring-1 focus:ring-brand-emerald/30 outline-none"
            value={search_term}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 bg-bg-main border border-border-subtle rounded-xl p-1">
          {(['all', 'success', 'failed', 'pending'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                status_filter === s
                  ? 'bg-brand-emerald text-white shadow-sm'
                  : 'text-text-muted hover:bg-black/5'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-black/20 font-mono text-[11px] scrollbar-hide">
        {is_server_mode && server_loading && filtered_logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <Loader2 size={28} className="animate-spin mb-3" />
            <p className="text-[10px] uppercase tracking-widest">Loading logs…</p>
          </div>
        ) : filtered_logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted opacity-30">
            <Terminal size={40} className="mb-4" />
            <p>No matching logs found</p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle/50">
            {filtered_logs.map(raw_log => {
              const log = enrich_log(raw_log);
              const is_expanded = expanded.includes(log.id);
              const is_detail_loading = !!detail_loading[log.id];
              return (
                <div
                  key={log.id}
                  className={`group relative transition-colors ${
                    is_expanded
                      ? 'bg-white/[0.04]'
                      : 'hover:bg-white/[0.025]'
                  }`}
                >
                  {/* Active row gets a 2-px emerald accent on the left so
                      the eye snaps to whichever log is open. */}
                  {is_expanded && (
                    <span className="absolute inset-y-0 left-0 w-[2px] bg-brand-emerald" />
                  )}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => toggle(raw_log)}
                  >
                    {/* Disclosure chevron */}
                    <span className="shrink-0 w-4 text-text-muted">
                      {is_expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    {/* Status dot */}
                    <span className="shrink-0">{status_dot(log.status)}</span>
                    {/* Time */}
                    <span className="shrink-0 text-text-muted/80 whitespace-nowrap text-[10px] font-mono w-[68px]">
                      {fmt_time(log.startedAt)}
                    </span>
                    {/* Method pill */}
                    <span className="shrink-0">{method_pill(log.method)}</span>
                    {/* Endpoint + name. Endpoint is the prominent thing —
                        it's what the user is scanning for. The api_name
                        sits as a smaller secondary line so naming the row
                        doesn't dominate the path. */}
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span
                        className="truncate text-text-main font-mono text-[11px]"
                        title={log.resolved_endpoint ?? log.request_url ?? ''}
                      >
                        {log.resolved_endpoint || log.request_url || '—'}
                      </span>
                      {log.api_name && (
                        <span className="truncate text-text-muted/70 text-[10px] mt-0.5">
                          {log.api_name}
                          {log.parent_api_name && (
                            <>
                              <span className="mx-1.5 text-text-muted/40">·</span>
                              <span className="text-brand-blue/80">{log.parent_api_name}</span>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    {/* Duration + HTTP status — kept compact on the right. */}
                    <div className="shrink-0 flex items-center gap-2">
                      {log.duration_ms !== null && log.duration_ms !== undefined && (
                        <span className="text-text-muted/80 flex items-center gap-1 text-[10px] tabular-nums">
                          <Clock size={11} />
                          {log.duration_ms}ms
                        </span>
                      )}
                      {log.http_status !== null && log.http_status !== undefined && (
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border tabular-nums ${status_color(log.status)}`}>
                          {log.http_status}
                        </span>
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {is_expanded && (() => {
                      // Per-log tab state. Default to "response" since that's
                      // the most common reason to expand a log.
                      const tab = active_tab[log.id] ?? 'response';
                      const set_tab = (t: LogDetailTab) =>
                        setActiveTab(prev => ({ ...prev, [log.id]: t }));
                      const path_only = strip_query(log.request_url);
                      const query_params = parse_query_params(log.request_url);
                      const has_query = Object.keys(query_params).length > 0;
                      const has_dyn = Object.keys(log.dynamic_params_used || {}).length > 0;
                      const has_headers = log.request_headers && Object.keys(log.request_headers).length > 0;
                      const has_body = log.request_body !== undefined && log.request_body !== null && log.request_body !== '';
                      const has_response = log.response !== undefined && log.response !== null;

                      const tab_button = (id: LogDetailTab, label: string, icon: React.ReactNode, badge?: string | number) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => set_tab(id)}
                          className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 -mb-px ${
                            tab === id
                              ? 'border-brand-emerald text-brand-emerald'
                              : 'border-transparent text-text-muted hover:text-text-main'
                          }`}
                        >
                          {icon}
                          {label}
                          {badge !== undefined && badge !== '' && (
                            <span className="ml-1 px-1.5 rounded-md bg-black/30 text-[9px] text-text-muted">{badge}</span>
                          )}
                        </button>
                      );

                      return (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden border-t border-border-subtle/30 bg-black/20"
                        >
                          {/* Tab strip */}
                          <div className="flex items-center gap-1 px-4 border-b border-border-subtle/40 bg-black/30 overflow-x-auto py-[5px]">
                            {tab_button('endpoint', 'Endpoint', <Globe size={12} />, has_query ? Object.keys(query_params).length : '')}
                            {tab_button('headers', 'Headers', <FileJson size={12} />, has_headers ? Object.keys(log.request_headers!).length : '')}
                            {tab_button('body', 'Body', <FileJson size={12} />, has_body ? '✓' : '')}
                            {tab_button('cookies', 'Cookies', <Cookie size={12} />, log.cookie_status === 'available' ? log.cookie_names.length : '')}
                            {tab_button('response', 'Response', <Inbox size={12} />, log.http_status ?? '')}
                            {is_detail_loading && (
                              <span className="ml-auto flex items-center gap-1.5 px-3 text-[10px] text-text-muted">
                                <Loader2 size={11} className="animate-spin" />
                                Loading detail…
                              </span>
                            )}
                          </div>

                          <div className="p-4 space-y-3">
                            {/* ── Endpoint tab ─────────────────────────── */}
                            {tab === 'endpoint' && (
                              <div className="space-y-3">
                                <div className="p-3 rounded-xl bg-black/40 border border-border-subtle space-y-2">
                                  <div className="grid grid-cols-[80px_1fr] gap-2 items-start">
                                    <span className="text-text-muted">Method:</span>
                                    <span className="text-brand-emerald font-bold uppercase">{log.method || '—'}</span>
                                  </div>
                                  <div className="grid grid-cols-[80px_1fr] gap-2 items-start">
                                    <span className="text-text-muted">URL:</span>
                                    <span className="text-text-main break-all font-mono">{path_only || '—'}</span>
                                  </div>
                                  {log.original_endpoint && log.original_endpoint !== log.resolved_endpoint && (
                                    <div className="grid grid-cols-[80px_1fr] gap-2 items-start">
                                      <span className="text-text-muted">Template:</span>
                                      <span className="text-text-muted/70 break-all font-mono">{log.original_endpoint}</span>
                                    </div>
                                  )}
                                  {log.resolved_endpoint && (
                                    <div className="grid grid-cols-[80px_1fr] gap-2 items-start">
                                      <span className="text-text-muted">Resolved:</span>
                                      <span className="text-text-main break-all font-mono">{log.resolved_endpoint}</span>
                                    </div>
                                  )}
                                  {log.parent_api_name && (
                                    <div className="grid grid-cols-[80px_1fr] gap-2 items-start">
                                      <span className="text-text-muted">Parent:</span>
                                      <span className="text-brand-blue">{log.parent_api_name}</span>
                                    </div>
                                  )}
                                  {log.item_key && (
                                    <div className="grid grid-cols-[80px_1fr] gap-2 items-start">
                                      <span className="text-text-muted">Item key:</span>
                                      <span className="text-text-main break-all">{log.item_key}</span>
                                    </div>
                                  )}
                                </div>

                                {has_query && (
                                  <div>
                                    <h5 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">Query Params</h5>
                                    <JsonTreeViewer
                                      data={query_params}
                                      default_expanded_depth={2}
                                      max_height={220}
                                      hide_toolbar
                                      class_name="text-[10px]"
                                    />
                                  </div>
                                )}

                                {has_dyn && (
                                  <div>
                                    <h5 className="text-[10px] font-bold text-text-muted uppercase tracking-widest mb-1">Resolved Variables</h5>
                                    <div className="p-3 rounded-xl bg-black/40 border border-border-subtle space-y-1">
                                      {Object.entries(log.dynamic_params_used).map(([k, v]) => (
                                        <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
                                          <span className="text-text-muted">{k}</span>
                                          <span className="text-brand-emerald break-all">{String(v)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {!has_query && !has_dyn && (
                                  <p className="text-text-muted/70 italic px-1">No query params or resolved variables.</p>
                                )}
                              </div>
                            )}

                            {/* ── Headers tab ─────────────────────────── */}
                            {tab === 'headers' && (
                              has_headers ? (
                                <JsonTreeViewer
                                  data={log.request_headers}
                                  default_expanded_depth={2}
                                  max_height={420}
                                  class_name="text-[10px]"
                                />
                              ) : (
                                <p className="text-text-muted/70 italic px-1">No request headers were captured for this call.</p>
                              )
                            )}

                            {/* ── Body tab ────────────────────────────── */}
                            {tab === 'body' && (
                              has_body ? (
                                typeof log.request_body === 'string' ? (
                                  <pre className="p-3 rounded-xl bg-black/40 border border-border-subtle text-[10px] text-text-main whitespace-pre-wrap break-all font-mono max-h-[420px] overflow-auto">
                                    {log.request_body}
                                  </pre>
                                ) : (
                                  <JsonTreeViewer
                                    data={log.request_body}
                                    default_expanded_depth={2}
                                    max_height={420}
                                    class_name="text-[10px]"
                                  />
                                )
                              ) : (
                                <p className="text-text-muted/70 italic px-1">No request body — this call carried no payload.</p>
                              )
                            )}

                            {/* ── Cookies tab ─────────────────────────── */}
                            {tab === 'cookies' && (
                              <div className="p-3 rounded-xl bg-black/40 border border-border-subtle space-y-2">
                                <div className="grid grid-cols-[100px_1fr] gap-2">
                                  <span className="text-text-muted">Status:</span>
                                  <span className={log.cookie_status === 'available' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                                    {log.cookie_status === 'available' ? 'Available' : 'Missing'}
                                  </span>
                                </div>
                                {log.cookie_status === 'available' ? (
                                  <>
                                    <div className="grid grid-cols-[100px_1fr] gap-2">
                                      <span className="text-text-muted">Length:</span>
                                      <span className="text-text-main">{log.cookie_length} chars</span>
                                    </div>
                                    <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
                                      <span className="text-text-muted">Names:</span>
                                      <span className="text-text-main break-all">
                                        {(log.cookie_names || []).length > 0
                                          ? (log.cookie_names || []).map((n, i) => (
                                              <span key={n} className="inline-block mr-1.5 mb-1 px-2 py-0.5 rounded-md bg-brand-emerald/10 text-brand-emerald font-mono">{n}{i < log.cookie_names.length - 1 ? '' : ''}</span>
                                            ))
                                          : <span className="text-text-muted/70 italic">none</span>}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-text-muted/60 italic mt-1">Cookie values are not stored in logs for security.</p>
                                  </>
                                ) : (
                                  <p className="text-[10px] text-text-muted/70 italic">No cookie was attached to this request.</p>
                                )}
                              </div>
                            )}

                            {/* ── Response tab ────────────────────────── */}
                            {tab === 'response' && (
                              <div className="space-y-2">
                                {/* Tiny status row above the body */}
                                <div className="flex items-center justify-between flex-wrap gap-2 text-[10px]">
                                  <div className="flex items-center gap-3 text-text-muted">
                                    <span>HTTP <span className={`font-bold ${log.status === 'success' ? 'text-emerald-500' : log.status === 'failed' ? 'text-red-500' : 'text-amber-500'}`}>{log.http_status ?? '—'}</span></span>
                                    {log.duration_ms !== null && log.duration_ms !== undefined && (
                                      <span><Clock size={11} className="inline mr-1" />{log.duration_ms}ms</span>
                                    )}
                                  </div>
                                  {has_response && (
                                    <button
                                      onClick={() => copy(JSON.stringify(log.response, null, 2), 'Response copied')}
                                      className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/10 text-text-muted hover:text-text-main"
                                      title="Copy response JSON"
                                    >
                                      <Copy size={11} /> Copy JSON
                                    </button>
                                  )}
                                </div>

                                {log.status === 'failed' && log.error_message && (
                                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-start gap-2">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                    <span className="break-all">{log.error_message}</span>
                                  </div>
                                )}

                                {log.status === 'pending' ? (
                                  <div className="p-3 rounded-xl bg-black/40 border border-border-subtle h-[160px] flex items-center justify-center gap-2">
                                    <Loader2 size={14} className="animate-spin text-brand-emerald" />
                                    <span className="text-text-muted italic">Waiting for response...</span>
                                  </div>
                                ) : has_response ? (
                                  typeof log.response === 'string' ? (
                                    <pre className="p-3 rounded-xl bg-black/40 border border-border-subtle text-[10px] text-text-main whitespace-pre-wrap break-all font-mono max-h-[420px] overflow-auto">
                                      {log.response}
                                    </pre>
                                  ) : (
                                    <JsonTreeViewer
                                      data={log.response}
                                      default_expanded_depth={1}
                                      collapse_arrays_by_default
                                      max_height={420}
                                      class_name="text-[10px]"
                                    />
                                  )
                                ) : log.response_preview ? (
                                  <pre className="p-3 rounded-xl bg-black/40 border border-border-subtle text-[10px] text-text-muted whitespace-pre-wrap break-all font-mono max-h-[420px] overflow-auto">
                                    {log.response_preview}
                                  </pre>
                                ) : (
                                  <p className="text-text-muted/70 italic px-1">No response captured.</p>
                                )}
                              </div>
                            )}

                            {/* Footer actions — always visible */}
                            <div className="flex gap-2 pt-2 border-t border-border-subtle/30">
                              <button
                                onClick={() => copy(JSON.stringify(log, null, 2), 'Log copied')}
                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 rounded-xl border border-border-subtle transition-all font-bold text-[10px]"
                              >
                                <Copy size={14} />
                                Copy Full Log
                              </button>
                              {log.status === 'failed' && onRetry && (
                                <button
                                  onClick={() => onRetry(log)}
                                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-brand-emerald/20 hover:bg-brand-emerald/30 text-brand-emerald rounded-xl border border-brand-emerald/30 transition-all font-bold text-[10px]"
                                >
                                  <RefreshCcw size={14} />
                                  Retry API
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })()}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination — server mode only. Hidden when there's only one
          page since paging UI on a single-page list is just noise. */}
      {is_server_mode && server_total > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-2.5 text-[10px] text-text-muted border-t border-border-subtle/40 bg-black/10">
          <span>
            Showing <span className="font-medium text-text-main">{first_visible}-{last_visible}</span> of <span className="font-medium text-text-main">{server_total}</span>
          </span>
          <label className="flex items-center gap-2">
            <span>Per page</span>
            <select
              value={limit}
              onChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
              className="rounded-lg bg-bg-main border border-border-subtle px-2 py-1 text-[11px] font-bold text-text-main outline-none hover:border-brand-emerald/40 focus:border-brand-emerald"
            >
              {[12, 25, 50, 100, 200].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          {total_pages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:text-text-main hover:bg-white/5 disabled:opacity-35 disabled:pointer-events-none"
                title="First page"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex h-8 items-center gap-1 px-2 rounded-lg text-text-muted hover:text-text-main hover:bg-white/5 disabled:opacity-35 disabled:pointer-events-none"
              >
                <ChevronLeft size={14} />
                Prev
              </button>
              <span className="px-2 font-mono">
                <span className="text-text-main font-bold">{page}</span> / {total_pages}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(total_pages, p + 1))}
                disabled={page >= total_pages}
                className="flex h-8 items-center gap-1 px-2 rounded-lg text-text-muted hover:text-text-main hover:bg-white/5 disabled:opacity-35 disabled:pointer-events-none"
              >
                Next
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPage(total_pages)}
                disabled={page >= total_pages}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:text-text-main hover:bg-white/5 disabled:opacity-35 disabled:pointer-events-none"
                title="Last page"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DebugConsole;
