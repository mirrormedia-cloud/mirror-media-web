import React, { useEffect, useMemo, useState } from 'react';
import {
  ApiNode,
  PaginationConfig,
  PaginationType,
  PaginationTestResult,
  BodyMode,
  BodyDataType,
  BodyValueType,
  BodyConfigEntry,
} from '../../../../../types';
import { X, Save, AlertCircle, GitMerge, Loader2, Layers, FlaskConical, CheckCircle2, XCircle, Braces, Plus, Trash2, Code } from 'lucide-react';
import toast from 'react-hot-toast';
import { Input } from '../../../../../components/ui/Input';
import {
  CommonSearchSelect,
  field_path_options_to_select,
  type SearchSelectOption,
} from '../../../../../components/ui/CommonSearchSelect';
import {
  extract_endpoint_variables,
  extract_field_paths_from_list_response,
} from '../../../../../utils/apiDataUtils';
import { build_field_path_options, build_array_path_options } from '../../../../../utils/json_path_utils';
import { ott_service } from '../../../../../services/ott_service';

export interface ApiFormPayload {
  parent_id: string | null;
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  param_mappings: Record<string, string>;
  request_body?: Record<string, any> | null;
  pagination_enabled: boolean;
  pagination_type: PaginationType | null;
  pagination_config: PaginationConfig;
  body_mode: BodyMode | null;
  request_body_config: BodyConfigEntry[];
}

const BODY_DATA_TYPE_OPTIONS: SearchSelectOption[] = [
  { label: 'string', value: 'string' },
  { label: 'number', value: 'number' },
  { label: 'boolean', value: 'boolean' },
  { label: 'object', value: 'object' },
  { label: 'array', value: 'array' },
];

const METHODS_WITH_BODY: Array<ApiFormPayload['method']> = ['POST', 'PUT', 'PATCH'];

const PAGINATION_TYPE_OPTIONS: SearchSelectOption[] = [
  { label: 'Page Number', value: 'page_number', description: '?page=1&limit=20 + hasNext / total_pages' },
  { label: 'Cursor / Token', value: 'cursor', description: '?cursor=abc → response.next_cursor' },
  { label: 'ID Based', value: 'id_based', description: '?last_id=100 → next id from response' },
  { label: 'Offset', value: 'offset', description: '?offset=20&limit=20' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (api: ApiFormPayload) => void | Promise<void>;
  editing_api: ApiNode | null;
  initial_parent_id: string | null;
  available_apis: ApiNode[];
  ott_id: string;
  saving?: boolean;
}

const ApiFormModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  editing_api,
  initial_parent_id,
  available_apis,
  ott_id,
  saving = false,
}) => {
  const [name, set_name] = useState('');
  const [endpoint, set_endpoint] = useState('');
  const [method, set_method] = useState<ApiFormPayload['method']>('GET');
  const [parent_id, set_parent_id] = useState<string | null>(null);
  const [param_mappings, set_param_mappings] = useState<Record<string, string>>({});
  const [errors, set_errors] = useState<Record<string, string>>({});

  const [parent_response, set_parent_response] = useState<any>(null);
  const [parent_response_loading, set_parent_response_loading] = useState(false);

  // Pagination state. Mirrors the three columns on the api_node, but flat in the
  // form so we can rebuild the nested config object on submit.
  const [pagination_enabled, set_pagination_enabled] = useState(false);
  const [pagination_type, set_pagination_type] = useState<PaginationType | null>(null);
  const [pagination_config, set_pagination_config] = useState<PaginationConfig>({});
  const [test_result, set_test_result] = useState<PaginationTestResult | null>(null);
  const [test_running, set_test_running] = useState(false);

  // Request body builder state. body_mode null = "raw" (default for back-compat).
  // raw_body_text holds the JSON string in raw mode; entries holds the array in
  // key_value mode. Both persist in state so flipping modes doesn't lose work.
  const [body_mode, set_body_mode] = useState<BodyMode>('raw');
  const [raw_body_text, set_raw_body_text] = useState<string>('');
  const [body_entries, set_body_entries] = useState<BodyConfigEntry[]>([]);
  const [raw_body_error, set_raw_body_error] = useState<string | null>(null);

  // Sample response used to populate field-path dropdowns. For root APIs we use
  // the API's OWN saved response (since it's the response we'd be paginating);
  // for child APIs we fall back to the parent response so something is selectable.
  const [own_response, set_own_response] = useState<any>(null);
  const [own_response_loading, set_own_response_loading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editing_api) {
      // Seed from the tree object first (so the form fills instantly), then
      // re-fetch fresh from the backend. This guards against tree-staleness
      // and confirms what's actually persisted in the DB — the user reported
      // saved pagination values not loading on re-edit, which was tree drift.
      set_name(editing_api.name);
      set_endpoint(editing_api.endpoint);
      set_method((editing_api.method || 'GET') as ApiFormPayload['method']);
      set_parent_id(editing_api.parent_id ?? null);
      set_param_mappings({ ...(editing_api.param_mappings || {}) });
      set_pagination_enabled(editing_api.pagination_enabled ?? false);
      set_pagination_type(editing_api.pagination_type ?? null);
      set_pagination_config({ ...(editing_api.pagination_config ?? {}) });

      set_body_mode((editing_api.body_mode ?? 'raw') as BodyMode);
      set_body_entries(Array.isArray(editing_api.request_body_config) ? [...editing_api.request_body_config] : []);
      set_raw_body_text(editing_api.request_body ? JSON.stringify(editing_api.request_body, null, 2) : '');
      set_raw_body_error(null);

      // Background refresh — overrides the seed values with whatever's actually
      // in the DB. If the user is mid-typing it'd be jarring, but this fires
      // ONLY on open (deps gate on isOpen edge) so the form is freshly mounted.
      let cancelled = false;
      ott_service.get_api_node(ott_id, editing_api.id)
        .then(res => {
          if (cancelled || !res.success || !res.data) return;
          const fresh = res.data;
          set_pagination_enabled(fresh.pagination_enabled ?? false);
          set_pagination_type(fresh.pagination_type ?? null);
          set_pagination_config({ ...(fresh.pagination_config ?? {}) });
          set_param_mappings({ ...(fresh.param_mappings || {}) });
          set_body_mode((fresh.body_mode ?? 'raw') as BodyMode);
          set_body_entries(Array.isArray(fresh.request_body_config) ? [...fresh.request_body_config] : []);
          set_raw_body_text(fresh.request_body ? JSON.stringify(fresh.request_body, null, 2) : '');
          // eslint-disable-next-line no-console
          console.log('[api-form] loaded fresh node:', {
            id: fresh.id,
            pagination_enabled: fresh.pagination_enabled,
            pagination_type: fresh.pagination_type,
            body_mode: fresh.body_mode,
            request_body_config_count: fresh.request_body_config?.length ?? 0,
          });
        })
        .catch(() => { /* keep the tree-seeded values */ });
      return () => { cancelled = true; };
    } else {
      set_name('');
      set_endpoint('');
      set_method('GET');
      set_parent_id(initial_parent_id);
      set_param_mappings({});
      set_pagination_enabled(false);
      set_pagination_type(null);
      set_pagination_config({});
      set_body_mode('raw');
      set_body_entries([]);
      set_raw_body_text('');
      set_raw_body_error(null);
    }
    set_errors({});
    set_test_result(null);
    return;
  }, [editing_api, isOpen, initial_parent_id, ott_id]);

  // Load this API's own response once when editing — gives field-path dropdowns
  // something to pick from when configuring `data_list_path`, `next_cursor_path`, etc.
  useEffect(() => {
    if (!isOpen || !editing_api) {
      set_own_response(null);
      return;
    }
    let cancelled = false;
    set_own_response_loading(true);
    ott_service.get_api_response(ott_id, editing_api.id)
      .then(res => {
        if (cancelled) return;
        if (res.success && res.data) set_own_response(res.data.response ?? null);
        else set_own_response(null);
      })
      .catch(() => !cancelled && set_own_response(null))
      .finally(() => !cancelled && set_own_response_loading(false));
    return () => { cancelled = true; };
  }, [isOpen, editing_api, ott_id]);

  const parent_api = useMemo(
    () => (parent_id ? available_apis.find(a => a.id === parent_id) ?? null : null),
    [parent_id, available_apis],
  );

  // Available parents = APIs not equal to the editing one and not its descendants (avoid cycles)
  const parent_options = useMemo(() => {
    if (!editing_api) return available_apis;
    const banned = new Set<string>([editing_api.id]);
    const queue = [editing_api];
    while (queue.length) {
      const node = queue.shift()!;
      for (const child of node.children || []) {
        if (!banned.has(child.id)) {
          banned.add(child.id);
          queue.push(child);
        }
      }
    }
    return available_apis.filter(a => !banned.has(a.id));
  }, [editing_api, available_apis]);

  useEffect(() => {
    if (!isOpen || !parent_id) {
      set_parent_response(null);
      return;
    }
    let cancelled = false;
    set_parent_response_loading(true);
    ott_service.get_api_response(ott_id, parent_id)
      .then(res => {
        if (cancelled) return;
        if (res.success && res.data) set_parent_response(res.data.response ?? null);
        else set_parent_response(null);
      })
      .catch(() => !cancelled && set_parent_response(null))
      .finally(() => !cancelled && set_parent_response_loading(false));
    return () => { cancelled = true; };
  }, [isOpen, parent_id, ott_id]);

  const detected_variables = useMemo(() => extract_endpoint_variables(endpoint), [endpoint]);

  const dropdown_options = useMemo(() => {
    if (!parent_api || !parent_api.list_path || !parent_response) return [];
    return extract_field_paths_from_list_response(parent_response, parent_api.list_path);
  }, [parent_api, parent_response]);

  // ── Hooks must run on every render ──────────────────────────────────
  // These must live ABOVE `if (!isOpen) return null` so the hook count is
  // stable across the closed→open transition. (Putting them below caused a
  // black screen when the user clicked "Register new" because the hook count
  // jumped, violating the Rules of Hooks.)
  //
  // Field-path dropdowns are populated from TWO sources, shown as separate
  // groups in the picker so the user can pick from either:
  //   • "This API" — paths from the API's own saved response. This is the
  //     primary source for pagination config (next_cursor_path, has_next_path,
  //     data_list_path, etc. all live in the API's OWN response).
  //   • "Parent API" — paths from the parent's response. Useful for child APIs
  //     where pagination might reference a parent field, and for parity with
  //     variable-mapping which already uses parent paths.
  const all_field_path_options: SearchSelectOption[] = useMemo(() => {
    const out: SearchSelectOption[] = [];
    if (own_response) {
      const opts = build_field_path_options({ response: own_response, include_arrays: true });
      // Override the type-based group with the SOURCE group so users see the
      // dropdown organised by which response the path comes from. The type is
      // still visible via the `badge` (string/url/number/etc.).
      for (const o of opts) {
        out.push({
          label: o.value,
          value: o.value,
          description: `${o.type} • ${o.sample}`,
          group: 'This API',
          badge: o.type,
        });
      }
    }
    if (parent_response) {
      const opts = build_field_path_options({ response: parent_response, include_arrays: true });
      for (const o of opts) {
        out.push({
          label: o.value,
          value: o.value,
          description: `${o.type} • ${o.sample}`,
          group: 'Parent API',
          badge: o.type,
        });
      }
    }
    return out;
  }, [own_response, parent_response]);

  const array_path_options: SearchSelectOption[] = useMemo(() => {
    const out: SearchSelectOption[] = [];
    if (own_response) {
      out.push(...build_array_path_options(own_response).map(o => ({
        label: o.label, value: o.value, description: o.sample, group: 'This API', badge: 'array',
      })));
    }
    if (parent_response) {
      out.push(...build_array_path_options(parent_response).map(o => ({
        label: o.label, value: o.value, description: o.sample, group: 'Parent API', badge: 'array',
      })));
    }
    return out;
  }, [own_response, parent_response]);

  if (!isOpen) return null;

  const handle_submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next_errors: Record<string, string> = {};
    if (!name || name.length < 3) next_errors.name = 'Name must be at least 3 characters';
    if (!endpoint) next_errors.endpoint = 'Endpoint is required';
    if (parent_id) {
      for (const v of detected_variables) {
        if (!param_mappings[v]) {
          next_errors.param_mappings = `Map every endpoint variable (missing: ${v})`;
          break;
        }
      }
    }
    if (pagination_enabled) {
      if (!pagination_type) {
        next_errors.pagination = 'Choose a pagination type';
      } else if (pagination_type === 'page_number' && !pagination_config.page_param) {
        next_errors.pagination = 'page_param is required for Page Number pagination';
      } else if (pagination_type === 'cursor' && (!pagination_config.cursor_param || !pagination_config.next_cursor_path)) {
        next_errors.pagination = 'cursor_param and next_cursor_path are required for Cursor pagination';
      } else if (pagination_type === 'id_based' && !pagination_config.id_param) {
        next_errors.pagination = 'id_param is required for ID-Based pagination';
      } else if (pagination_type === 'id_based' && !pagination_config.next_id_from_last_item && !pagination_config.next_id_path) {
        next_errors.pagination = 'Pick "Use last item field" or set next_id_path for ID-Based pagination';
      } else if (pagination_type === 'offset' && !pagination_config.offset_param) {
        next_errors.pagination = 'offset_param is required for Offset pagination';
      }
    }
    if (Object.keys(next_errors).length) {
      set_errors(next_errors);
      return;
    }
    // Resolve the body section. In raw mode we parse the JSON text once here
    // so a malformed body fails on Save (with a clear error) rather than on
    // first call. In key_value mode we send the array as-is and let the
    // backend's resolver coerce values per data_type at call time.
    let outgoing_body: Record<string, any> | null = null;
    if (METHODS_WITH_BODY.includes(method)) {
      if (body_mode === 'raw') {
        const trimmed = raw_body_text.trim();
        if (trimmed.length > 0) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              outgoing_body = parsed;
              set_raw_body_error(null);
            } else {
              set_raw_body_error('Raw body must be a JSON object');
              return;
            }
          } catch (err: any) {
            set_raw_body_error(err?.message || 'Invalid JSON');
            return;
          }
        }
      } else {
        // key_value mode → static placeholder; the resolver constructs the
        // real body at call time from request_body_config.
        outgoing_body = null;
        for (const e of body_entries) {
          if (!e.key) {
            next_errors.body = 'Every body entry needs a key';
            break;
          }
          if (e.value_type === 'variable' && !e.variable_path) {
            next_errors.body = `Body field "${e.key}" is variable but has no path`;
            break;
          }
        }
      }
    }
    if (Object.keys(next_errors).length) {
      set_errors(next_errors);
      return;
    }

    // Always persist type+config so toggling off → on later restores the user's
    // settings instead of starting from blank. Only `pagination_enabled` actually
    // gates whether the runtime fetches multiple pages.
    onSave({
      parent_id,
      name,
      endpoint,
      method,
      param_mappings,
      request_body: outgoing_body,
      pagination_enabled,
      pagination_type: pagination_type ?? null,
      pagination_config: pagination_config ?? {},
      body_mode: METHODS_WITH_BODY.includes(method) ? body_mode : null,
      request_body_config: METHODS_WITH_BODY.includes(method) ? body_entries : [],
    });
  };

  const update_body_entry = (idx: number, patch: Partial<BodyConfigEntry>) => {
    set_body_entries(prev => prev.map((e, i) => i === idx ? { ...e, ...patch } : e));
  };
  const add_body_entry = () => {
    set_body_entries(prev => [...prev, {
      key: '',
      value_type: 'static',
      static_value: '',
      data_type: 'string',
      required: false,
    }]);
  };
  const remove_body_entry = (idx: number) => {
    set_body_entries(prev => prev.filter((_, i) => i !== idx));
  };

  const handle_test_pagination = async () => {
    if (!editing_api) {
      toast.error('Save the API first, then test pagination.');
      return;
    }
    if (!pagination_type) {
      toast.error('Pick a pagination type first');
      return;
    }
    set_test_running(true);
    set_test_result(null);
    try {
      const res = await ott_service.test_api_pagination(ott_id, editing_api.id, {
        pagination_type,
        pagination_config,
      });
      if (!res.success || !res.data) {
        toast.error(res.message || 'Test failed');
        return;
      }
      set_test_result(res.data);
      if (res.data.success) {
        toast.success(`Fetched ${res.data.pages_fetched} page(s) — ${res.data.total_items} item(s)`);
      } else {
        toast(`Stopped: ${res.data.stop_reason}${res.data.last_error ? ` — ${res.data.last_error}` : ''}`, { duration: 5000 });
      }
    } catch (err: any) {
      toast.error(err?.message || 'Test failed');
    } finally {
      set_test_running(false);
    }
  };

  const update_config = (patch: Partial<PaginationConfig>) =>
    set_pagination_config(prev => ({ ...prev, ...patch }));

  const update_mapping = (var_name: string, value: string) => {
    set_param_mappings(prev => ({ ...prev, [var_name]: value }));
    set_errors(prev => ({ ...prev, param_mappings: '' }));
  };

  const parent_has_list_path = !!parent_api?.list_path;
  const parent_has_response = !!parent_response;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-bg-main border border-border-subtle rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-brand-blue/10 text-brand-blue flex items-center justify-center">
              <GitMerge size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-main">
                {editing_api ? 'Edit API Config' : 'Register New API'}
              </h3>
              <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest mt-0.5">
                {parent_api ? `Child of ${parent_api.name}` : 'Root entry point'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handle_submit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Top row — Name / Method / Parent. 3 columns on desktop so the
              identifying fields fit on one line; collapses to a single column
              on narrow screens. Endpoint stays full-width below since it's
              typically the longest value. */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-5">
              <Input
                label="Identifier Name"
                placeholder="e.g. get_show_detail"
                value={name}
                onChange={set_name}
                error={errors.name}
              />
            </div>
            <div className="md:col-span-2">
              <CommonSearchSelect
                label="Method"
                size="md"
                value={method}
                on_change={(v) => set_method((v ?? 'GET') as ApiFormPayload['method'])}
                options={[
                  { label: 'GET', value: 'GET' },
                  { label: 'POST', value: 'POST' },
                  { label: 'PUT', value: 'PUT' },
                  { label: 'PATCH', value: 'PATCH' },
                  { label: 'DELETE', value: 'DELETE' },
                ]}
                placeholder="GET"
              />
            </div>
            <div className="md:col-span-5">
              <CommonSearchSelect
                label="Parent API"
                size="md"
                value={parent_id}
                on_change={(v) => set_parent_id(v)}
                is_clearable
                options={[
                  ...parent_options.map(api => ({ label: api.name, value: api.id, description: api.endpoint })),
                ]}
                placeholder="No parent / Root API"
                search_placeholder="Search APIs..."
                empty_message="No other APIs available"
              />
            </div>
          </div>
          {parent_id && (
            <p className="text-[10px] text-text-muted ml-1 -mt-2">
              Selecting a parent makes this a child API that resolves variables from the parent response.
            </p>
          )}

          <Input
            label="API Endpoint"
            placeholder="/api/v1/show/<slug>  or  /api/v1/show/{slug}  or  /api/v1/show/:slug"
            value={endpoint}
            onChange={set_endpoint}
            error={errors.endpoint}
          />

          {detected_variables.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Detected variables:</span>
              {detected_variables.map(v => (
                <span key={v} className="text-[10px] font-bold text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded">
                  {v}
                </span>
              ))}
            </div>
          )}

          {detected_variables.length > 0 && parent_id && (
            <div className="space-y-3 p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-subtle">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-bold uppercase text-text-muted tracking-widest">Variable mapping (from parent)</h4>
                {parent_response_loading && <Loader2 size={12} className="animate-spin text-text-muted" />}
              </div>

              {!parent_has_list_path && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle size={14} className="text-amber-500 mt-0.5" />
                  <p className="text-[11px] text-amber-600 dark:text-amber-300">
                    Parent "{parent_api?.name}" has no list_path. Open the parent's "Choose Fields" first to set a list path.
                  </p>
                </div>
              )}

              {parent_has_list_path && !parent_has_response && !parent_response_loading && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle size={14} className="text-amber-500 mt-0.5" />
                  <p className="text-[11px] text-amber-600 dark:text-amber-300">
                    Parent "{parent_api?.name}" has no saved response yet. Call the parent API first so we can build dropdown options from it.
                  </p>
                </div>
              )}

              {errors.param_mappings && (
                <p className="text-xs text-red-500">{errors.param_mappings}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detected_variables.map(var_name => (
                  <div key={var_name} className="flex flex-col gap-2 p-3 bg-bg-card rounded-xl border border-border-subtle">
                    <span className="text-[10px] font-bold text-brand-blue uppercase tracking-widest">
                      Variable: {var_name}
                    </span>
                    {dropdown_options.length > 0 ? (
                      <CommonSearchSelect
                        size="sm"
                        value={param_mappings[var_name] || null}
                        on_change={(v) => update_mapping(var_name, v ?? '')}
                        options={dropdown_options.map(opt => ({ label: opt, value: opt }))}
                        is_clearable
                        placeholder="Choose mapped field from parent..."
                        search_placeholder="Search paths..."
                      />
                    ) : (
                      <input
                        type="text"
                        className="input-field py-2 text-xs font-mono"
                        placeholder="data[0].slug"
                        value={param_mappings[var_name] || ''}
                        onChange={(e) => update_mapping(var_name, e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {detected_variables.length > 0 && !parent_id && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertCircle size={14} className="text-amber-500 mt-0.5" />
              <p className="text-[11px] text-amber-600 dark:text-amber-300">
                The endpoint contains dynamic variables. Pick a parent API above to map them to parent response fields.
              </p>
            </div>
          )}

          {/* ── Request Body Builder (POST/PUT/PATCH only) ──────────── */}
          {METHODS_WITH_BODY.includes(method) && (
            <div className="space-y-3 p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-subtle">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Braces size={14} className="text-brand-blue" />
                  <h4 className="text-[10px] font-bold uppercase text-text-muted tracking-widest">Request Body</h4>
                </div>
                {/* Mode toggle: raw JSON vs key-value builder. Each mode keeps
                    its own state so flipping back and forth doesn't lose work. */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-bg-card border border-border-subtle">
                  <button
                    type="button"
                    onClick={() => set_body_mode('raw')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all ${
                      body_mode === 'raw' ? 'bg-brand-blue/10 text-brand-blue' : 'text-text-muted hover:text-text-main'
                    }`}
                  >
                    <Code size={12} /> Raw JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => set_body_mode('key_value')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all ${
                      body_mode === 'key_value' ? 'bg-brand-blue/10 text-brand-blue' : 'text-text-muted hover:text-text-main'
                    }`}
                  >
                    <Layers size={12} /> Key-Value
                  </button>
                </div>
              </div>

              {body_mode === 'raw' ? (
                <div className="space-y-1.5">
                  <textarea
                    value={raw_body_text}
                    onChange={(e) => { set_raw_body_text(e.target.value); set_raw_body_error(null); }}
                    placeholder={`{\n  "lang": "hindi",\n  "limit": 20\n}`}
                    rows={8}
                    className={`w-full bg-black/40 border rounded-xl p-3 text-xs font-mono text-text-main placeholder-text-muted/40 focus:outline-none focus:ring-2 focus:ring-brand-emerald/40 ${
                      raw_body_error ? 'border-red-500/50' : 'border-border-subtle'
                    }`}
                  />
                  {raw_body_error && <p className="text-xs text-red-400">{raw_body_error}</p>}
                  <p className="text-[10px] text-text-muted">
                    JSON object sent as-is. For dynamic values from a parent response, switch to <span className="font-bold">Key-Value</span>.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {body_entries.length === 0 && (
                    <p className="text-[11px] text-text-muted italic">
                      No body fields yet. Click <span className="font-bold">Add Field</span> to start.
                    </p>
                  )}
                  {body_entries.map((entry, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-bg-card border border-border-subtle space-y-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={entry.key}
                          onChange={(ev) => update_body_entry(idx, { key: ev.target.value })}
                          placeholder="key (e.g. show_slug)"
                          className="flex-1 bg-black/20 border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-main placeholder-text-muted/60 focus:outline-none focus:ring-1 focus:ring-brand-emerald/50"
                        />
                        <label className="flex items-center gap-1.5 text-[10px] text-text-main cursor-pointer whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={!!entry.required}
                            onChange={(ev) => update_body_entry(idx, { required: ev.target.checked })}
                            className="rounded accent-brand-emerald"
                          />
                          required
                        </label>
                        <button
                          type="button"
                          onClick={() => remove_body_entry(idx)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10"
                          title="Remove"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <CommonSearchSelect
                          size="sm"
                          value={entry.value_type}
                          on_change={(v) => update_body_entry(idx, { value_type: (v ?? 'static') as BodyValueType })}
                          options={[
                            { label: 'static', value: 'static', description: 'fixed value' },
                            { label: 'variable', value: 'variable', description: 'from parent response' },
                          ]}
                          placeholder="value type"
                        />
                        <CommonSearchSelect
                          size="sm"
                          value={entry.data_type ?? 'string'}
                          on_change={(v) => update_body_entry(idx, { data_type: (v ?? 'string') as BodyDataType })}
                          options={BODY_DATA_TYPE_OPTIONS}
                          placeholder="data type"
                        />
                        {entry.value_type === 'static' ? (
                          <input
                            type="text"
                            value={entry.static_value ?? ''}
                            onChange={(ev) => update_body_entry(idx, { static_value: ev.target.value })}
                            placeholder="static value (e.g. hindi)"
                            className="bg-black/20 border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono text-text-main placeholder-text-muted/60 focus:outline-none focus:ring-1 focus:ring-brand-emerald/50"
                          />
                        ) : (
                          <CommonSearchSelect
                            size="sm"
                            value={entry.variable_path ?? null}
                            on_change={(v) => update_body_entry(idx, { variable_path: v ?? '' })}
                            options={all_field_path_options}
                            is_clearable
                            placeholder="parent path (data[0].slug)"
                            search_placeholder="Search paths..."
                            empty_message={all_field_path_options.length === 0
                              ? "Call parent API first to load fields"
                              : "No matching paths"}
                            group_order={['Parent API', 'This API', 'Custom']}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={add_body_entry}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/30 hover:bg-brand-emerald/20"
                  >
                    <Plus size={12} /> Add Field
                  </button>
                  {!parent_id && body_entries.some(e => e.value_type === 'variable') && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <AlertCircle size={14} className="text-amber-500 mt-0.5" />
                      <p className="text-[11px] text-amber-600 dark:text-amber-300">
                        Variable body fields need a parent API context. Pick a parent above, or change variable fields to static.
                      </p>
                    </div>
                  )}
                  {errors.body && <p className="text-xs text-red-500">{errors.body}</p>}
                </div>
              )}
            </div>
          )}

          {/* ── Pagination ──────────────────────────────────────────── */}
          <div className={`space-y-3 p-4 rounded-2xl border transition-all ${
            pagination_enabled
              ? 'bg-brand-emerald/5 border-brand-emerald/40 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]'
              : 'bg-black/5 dark:bg-white/5 border-border-subtle'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers size={14} className={pagination_enabled ? 'text-brand-emerald' : 'text-brand-blue'} />
                <h4 className={`text-[10px] font-bold uppercase tracking-widest ${pagination_enabled ? 'text-brand-emerald' : 'text-text-muted'}`}>
                  Pagination {pagination_enabled && '· enabled'}
                </h4>
              </div>
              {/* Visible pill toggle — easier to see than a tiny <input type=checkbox>
                  in the dark theme. Clicking the pill or its label flips the state. */}
              <button
                type="button"
                onClick={() => set_pagination_enabled(!pagination_enabled)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  pagination_enabled
                    ? 'bg-brand-emerald text-white shadow-md shadow-brand-emerald/20'
                    : 'bg-black/10 dark:bg-white/10 text-text-muted hover:text-text-main border border-border-subtle'
                }`}
                aria-pressed={pagination_enabled}
              >
                <span className={`w-2 h-2 rounded-full ${pagination_enabled ? 'bg-white' : 'bg-text-muted/50'}`} />
                {pagination_enabled ? 'Enabled' : 'Enable pagination'}
              </button>
            </div>

            {pagination_enabled && (
              <>
                <CommonSearchSelect
                  // size="md" matches the height of <Input> (py-3) used by every
                  // other pagination field — keeps the form visually uniform.
                  size="md"
                  value={pagination_type}
                  on_change={(v) => {
                    set_pagination_type(v as PaginationType | null);
                    set_test_result(null);
                  }}
                  options={PAGINATION_TYPE_OPTIONS}
                  placeholder="Choose pagination type..."
                  search_placeholder="Search types..."
                  is_clearable
                />

                {pagination_type && (
                  <>
                    {!editing_api && (
                      <p className="text-[10px] text-text-muted">
                        Save the API first, then come back to test pagination against the live upstream.
                      </p>
                    )}
                    {own_response_loading && (
                      <p className="text-[10px] text-text-muted flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" /> Loading sample response for path dropdowns…
                      </p>
                    )}

                    {/* Type-specific fields */}
                    {pagination_type === 'page_number' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input label="Page param" placeholder="page_no" value={pagination_config.page_param ?? ''} onChange={(v) => update_config({ page_param: v })} />
                        <Input label="Start page" type="number" placeholder="1" value={String(pagination_config.start_page ?? 1)} onChange={(v) => update_config({ start_page: Number(v) || 1 })} />
                        <PathSelect label="Has next path" value={pagination_config.has_next_path ?? ''} on_change={(v) => update_config({ has_next_path: v ?? '' })} options={all_field_path_options} placeholder="response.hasNext" />
                        <PathSelect label="Total pages path (optional)" value={pagination_config.total_pages_path ?? ''} on_change={(v) => update_config({ total_pages_path: v ?? '' })} options={all_field_path_options} placeholder="pagination.total_pages" />
                      </div>
                    )}

                    {pagination_type === 'cursor' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input label="Cursor param" placeholder="cursor" value={pagination_config.cursor_param ?? ''} onChange={(v) => update_config({ cursor_param: v })} />
                        <Input label="Initial cursor (optional)" placeholder="" value={pagination_config.initial_cursor ?? ''} onChange={(v) => update_config({ initial_cursor: v })} />
                        <PathSelect label="Next cursor path" value={pagination_config.next_cursor_path ?? ''} on_change={(v) => update_config({ next_cursor_path: v ?? '' })} options={all_field_path_options} placeholder="pagination.next_cursor" />
                      </div>
                    )}

                    {pagination_type === 'id_based' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input label="ID param" placeholder="last_id" value={pagination_config.id_param ?? ''} onChange={(v) => update_config({ id_param: v })} />
                          <Input label="Initial ID (optional)" placeholder="" value={pagination_config.initial_id ?? ''} onChange={(v) => update_config({ initial_id: v })} />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-text-main cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!pagination_config.next_id_from_last_item}
                            onChange={(e) => update_config({ next_id_from_last_item: e.target.checked })}
                            className="rounded accent-brand-emerald"
                          />
                          Use last item field (next_id = last_item[id_field])
                        </label>
                        {pagination_config.next_id_from_last_item ? (
                          <Input label="ID field on last item" placeholder="id" value={pagination_config.next_id_field ?? ''} onChange={(v) => update_config({ next_id_field: v })} />
                        ) : (
                          <PathSelect label="Next ID path" value={pagination_config.next_id_path ?? ''} on_change={(v) => update_config({ next_id_path: v ?? '' })} options={all_field_path_options} placeholder="pagination.next_id" />
                        )}
                        <PathSelect label="Has next path (optional)" value={pagination_config.has_next_path ?? ''} on_change={(v) => update_config({ has_next_path: v ?? '' })} options={all_field_path_options} placeholder="hasNext" />
                      </div>
                    )}

                    {pagination_type === 'offset' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input label="Offset param" placeholder="offset" value={pagination_config.offset_param ?? ''} onChange={(v) => update_config({ offset_param: v })} />
                        <Input label="Start offset" type="number" placeholder="0" value={String(pagination_config.start_offset ?? 0)} onChange={(v) => update_config({ start_offset: Number(v) || 0 })} />
                        <PathSelect label="Total path (optional)" value={pagination_config.total_path ?? ''} on_change={(v) => update_config({ total_path: v ?? '' })} options={all_field_path_options} placeholder="pagination.total" />
                      </div>
                    )}

                    {/* Common fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border-subtle">
                      <Input label="Limit param (optional)" placeholder="limit" value={pagination_config.limit_param ?? ''} onChange={(v) => update_config({ limit_param: v })} />
                      <Input label="Limit value" type="number" placeholder="20" value={pagination_config.limit_value !== undefined ? String(pagination_config.limit_value) : ''} onChange={(v) => update_config({ limit_value: v ? Number(v) : undefined })} />
                      <PathSelect label="Data list path" value={pagination_config.data_list_path ?? ''} on_change={(v) => update_config({ data_list_path: v ?? '' })} options={array_path_options} placeholder="data" />
                      <Input label="Max pages safety cap" type="number" placeholder="50" value={String(pagination_config.max_pages ?? 50)} onChange={(v) => update_config({ max_pages: Number(v) || 50 })} />
                    </div>
                    <label className="flex mt-5 items-center gap-2 text-xs text-text-main cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pagination_config.stop_when_empty !== false}
                        onChange={(e) => update_config({ stop_when_empty: e.target.checked })}
                        className="rounded accent-brand-emerald"
                      />
                      Stop when data list is empty
                    </label>

                    {errors.pagination && (
                      <p className="text-xs text-red-500">{errors.pagination}</p>
                    )}

                    {/* Test button + result */}
                    <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
                      <p className="text-[10px] text-text-muted">
                        Test fetches at most 2 pages — verifies your config without persisting.
                      </p>
                      <button
                        type="button"
                        onClick={handle_test_pagination}
                        disabled={test_running || !editing_api}
                        className="px-3 py-1.5 rounded-xl bg-brand-blue/10 text-brand-blue border border-brand-blue/30 text-xs font-bold flex items-center gap-1.5 hover:bg-brand-blue/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {test_running ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
                        Test Pagination
                      </button>
                    </div>

                    {test_result && (
                      <div className="space-y-2 p-3 rounded-xl bg-black/40 border border-border-subtle">
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          {test_result.success ? (
                            <CheckCircle2 size={14} className="text-brand-emerald" />
                          ) : (
                            <XCircle size={14} className="text-red-500" />
                          )}
                          <span className="font-bold text-text-main">
                            {test_result.pages_fetched} page(s), {test_result.total_items} item(s)
                          </span>
                          <span className="text-text-muted">
                            stop: <span className="font-mono">{test_result.stop_reason}</span>
                          </span>
                          {test_result.last_error && (
                            <span className="text-red-400 font-mono break-all">· {test_result.last_error}</span>
                          )}
                        </div>
                        <div className="space-y-1">
                          {test_result.pages.map((p, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] text-text-muted font-mono">
                              <span className={p.status === 'success' ? 'text-brand-emerald' : 'text-red-500'}>
                                {p.http_status ?? 'ERR'}
                              </span>
                              <span className="text-brand-blue">
                                {p.page_number !== null ? `p${p.page_number}` : p.cursor_value !== null ? `c=${p.cursor_value.slice(0, 12)}` : p.id_value !== null ? `id=${p.id_value}` : p.offset_value !== null ? `o=${p.offset_value}` : '—'}
                              </span>
                              <span className="text-text-main">→ {p.item_count} items</span>
                              <span className="text-text-muted">{p.duration_ms}ms</span>
                              {p.cookie_status && (
                                <span className={p.cookie_status === 'available' ? 'text-brand-emerald' : 'text-red-400'}>
                                  cookies:{p.cookie_status}{p.cookie_length ? `(${p.cookie_length})` : ''}
                                </span>
                              )}
                              <span className="truncate flex-1 text-text-muted/70" title={p.request_url}>{p.request_url}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </form>

        <div className="p-6 bg-black/5 dark:bg-white/5 border-t border-border-subtle flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 text-sm font-bold text-text-muted hover:text-text-main transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handle_submit}
            disabled={saving}
            className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {editing_api ? 'Update Changes' : 'Register API'}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Path picker with a graceful fallback. When the API has a saved response
 * we show a searchable dropdown of all field paths; when it doesn't, we
 * fall back to a plain text input so the user is never blocked from
 * configuring pagination — they can always just type the path they know
 * (e.g. "data", "pagination.next_cursor"). Always keeps the typed value.
 */
const PathSelect: React.FC<{
  label: string;
  value: string;
  on_change: (v: string | null) => void;
  options: SearchSelectOption[];
  placeholder?: string;
}> = ({ label, value, on_change, options, placeholder }) => {
  const has_options = options.length > 0;
  // Augment options with the current value if it's not in the list (so a path
  // the user typed but the response doesn't expose stays visible/selected).
  const augmented = useMemo(() => {
    if (!has_options) return options;
    if (!value || options.some(o => o.value === value)) return options;
    return [{ label: value, value, group: 'Custom', badge: 'custom' as const }, ...options];
  }, [value, options, has_options]);

  if (!has_options) {
    return (
      <div className="space-y-2 w-full">
        <label className="text-sm font-medium text-text-muted ml-1 block">{label}</label>
        <input
          type="text"
          value={value}
          onChange={(e) => on_change(e.target.value || null)}
          placeholder={placeholder ?? 'data.list_path'}
          // Default `.input-field` padding (py-3) matches the <Input> component
          // used elsewhere in the pagination form — keeps row heights uniform.
          className="input-field text-sm font-mono"
        />
        <p className="text-[10px] text-text-muted ml-1">
          Type the path manually — call this API at least once for a searchable dropdown.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 w-full">
      <label className="text-sm font-medium text-text-muted ml-1 block">{label}</label>
      <CommonSearchSelect
        // size="md" matches the height of every <Input> in the form (py-3).
        size="md"
        value={value || null}
        on_change={on_change}
        options={augmented}
        is_clearable
        placeholder={placeholder ?? 'Pick a path...'}
        search_placeholder="Search paths..."
        empty_message="No matching paths"
        // Surface "This API" paths above "Parent API" paths so the primary
        // source is what the user sees first.
        group_order={['This API', 'Parent API', 'Custom']}
      />
    </div>
  );
};

export default ApiFormModal;
