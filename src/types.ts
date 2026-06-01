export type AuthStep = 'login' | 'forgot-password' | 'verify-otp' | 'reset-password' | 'complete-profile' | 'dashboard';

export interface UserProfile {
  firstName: string;
  lastName: string;
  avatar: string | null;
  email: string;
}

export type DisplayType = 'title' | 'subtitle' | 'description' | 'image' | 'badge' | 'text' | 'hidden_id';

export interface SelectedField {
  id: string;
  ott_id: string;
  api_node_id: string;
  path: string;
  label: string | null;
  display_type: DisplayType;
  sort_order: number;
  is_visible: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ApiNodeLatestSummary {
  http_status: number | null;
  duration_ms: number | null;
  response_preview: string | null;
  updatedAt: string | null;
}

export type CardOpenTypeExtended = 'drawer' | 'modal' | 'page' | 'inline';

export interface CardDisplayConfig {
  layout?: 'grid' | 'list' | 'table';
  show_labels?: boolean;
  image_fit?: 'cover' | 'contain';
  card_size?: 'small' | 'medium' | 'large';
  default_card_click_action_id?: string;
  [k: string]: any;
}

export type BodyMode = 'raw' | 'key_value';
export type BodyValueType = 'static' | 'variable';
export type BodyDataType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface BodyConfigEntry {
  key: string;
  value_type: BodyValueType;
  static_value?: any;
  variable_path?: string;
  data_type?: BodyDataType;
  required?: boolean;
}

export type PaginationType = 'page_number' | 'cursor' | 'id_based' | 'offset' | 'custom';

export interface PaginationConfig {
  // page_number
  page_param?: string;
  start_page?: number;
  has_next_path?: string;
  total_pages_path?: string;
  next_page_strategy?: 'increment';
  // cursor
  cursor_param?: string;
  initial_cursor?: string;
  next_cursor_path?: string;
  // id_based
  id_param?: string;
  initial_id?: string;
  next_id_path?: string;
  next_id_from_last_item?: boolean;
  next_id_field?: string;
  // offset
  offset_param?: string;
  start_offset?: number;
  total_path?: string;
  // common
  limit_param?: string;
  limit_value?: number;
  data_list_path?: string;
  max_pages?: number;
  stop_when_empty?: boolean;
  [key: string]: any;
}

export interface ApiNode {
  id: string;
  ott_id: string;
  parent_id: string | null;
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  request_body: Record<string, any> | null;
  param_mappings: Record<string, string>;
  list_path: string | null;
  card_config: CardDisplayConfig;
  card_enabled: boolean;
  quick_run: boolean;
  default_child_api_id: string | null;
  default_card_action_id: string | null;
  skip_action_modal: boolean;
  open_type: CardOpenTypeExtended;
  sort_order: number;
  status: 'not_called' | 'pending' | 'success' | 'failed' | string;
  last_http_status: number | null;
  last_error: string | null;
  pagination_enabled: boolean;
  pagination_type: PaginationType | null;
  pagination_config: PaginationConfig;
  body_mode: BodyMode | null;
  request_body_config: BodyConfigEntry[];
  selected_fields: SelectedField[];
  latest_response_summary: ApiNodeLatestSummary | null;
  children: ApiNode[];
  lastCalledAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PaginationPageLog {
  page_number: number | null;
  cursor_value: string | null;
  id_value: string | null;
  offset_value: number | null;
  request_url: string;
  http_status: number | null;
  item_count: number;
  duration_ms: number;
  status: 'success' | 'failed';
  error_message: string | null;
  log_id: string;
  /** "available" if the OTT row had a cookie_string the proxy attached. */
  cookie_status?: 'available' | 'missing';
  cookie_length?: number;
}

// ── Quick Flow visualisation ─────────────────────────────────────────────
// Shapes returned by GET /api/ott/:ott_id/quick_flow. The backend stitches
// together api_nodes + responses + selected_fields + card_actions + logs,
// so the QuickFlowPage doesn't have to fetch each separately.

/** Resolved-from-real-data preview of the first card the API would render —
 *  feeds the inline mockup the front-end draws inside an API node. */
export interface QuickFlowCardPreview {
  image_url: string | null;
  title: string | null;
  subtitle: string | null;
  badge: string | null;
  extra_fields: Array<{ label: string; value: string }>;
}

export interface QuickFlowApiNode {
  id: string;
  type: 'api_node';
  level: number;
  api: {
    id: string;
    name: string;
    method: string;
    endpoint: string;
    parent_id: string | null;
    status: string;
    last_http_status: number | null;
    pagination_enabled: boolean;
    pagination_type: string | null;
    pagination_config: Record<string, any>;
    card_enabled: boolean;
    quick_run: boolean;
    list_path: string | null;
    body_mode: string | null;
    request_body_config: BodyConfigEntry[];
    default_child_api_id: string | null;
    default_card_action_id: string | null;
    open_type: string;
    last_called_at: string | null;
  };
  selected_fields: Array<{ path: string; label: string | null; display_type: string }>;
  card_actions: Array<{
    id: string;
    label: string;
    action_type: string;
    child_api_id: string | null;
    open_type: string | null;
  }>;
  last_log: {
    log_id: string;
    status: string;
    http_status: number | null;
    duration_ms: number | null;
    called_at: string | null;
    error_message: string | null;
  } | null;
  sample_data: {
    response_preview: string | null;
    list_path_first_item: any;
    keys: string[];
  };
  card_preview: QuickFlowCardPreview | null;
}

export interface QuickFlowOttRootNode {
  id: string;
  type: 'ott_root';
  level: number;
  ott: { id: string; name: string; base_url: string; favicon_url: string | null };
  summary: { root_apis: number; total_apis: number };
}

export interface QuickFlowCaptureVideoNode {
  id: string;
  type: 'capture_video';
  level: number;
  captured_videos: number;
  source_api_ids: string[];
  types: Record<string, number>;
}

export interface QuickFlowLibraryNode {
  id: string;
  type: 'library';
  level: number;
  counts: {
    total: number;
    completed: number;
    failed: number;
    videos: number;
    images: number;
    thumbnails: number;
    playlists: number;
  };
}

export type QuickFlowNode =
  | QuickFlowApiNode
  | QuickFlowOttRootNode
  | QuickFlowCaptureVideoNode
  | QuickFlowLibraryNode;

export interface QuickFlowEdge {
  id: string;
  source: string;
  target: string;
  type: 'api_connection' | 'ott_to_root' | 'api_to_capture' | 'capture_to_library';
  label: string;
  trigger_type: 'card_click' | 'quick_run' | 'card_action' | 'manual' | 'system';
  open_type: string | null;
  param_mappings: Record<string, string>;
  body_mappings: BodyConfigEntry[];
  sample_resolved_endpoint: string | null;
  sample_resolved_body: Record<string, any> | null;
  resolved_params_preview: Record<string, any>;
}

export interface QuickFlowSummary {
  total_apis: number;
  root_apis: number;
  child_apis: number;
  paginated_apis: number;
  card_enabled_apis: number;
  quick_run_apis: number;
  failed_apis: number;
  captured_videos: number;
  library_items: number;
  library_completed: number;
  library_failed: number;
}

export interface QuickFlowResponse {
  ott: {
    id: string;
    name: string;
    base_url: string;
    description: string | null;
  };
  nodes: QuickFlowNode[];
  edges: QuickFlowEdge[];
  summary: QuickFlowSummary;
}

export interface PaginationTestResult {
  api_id: string;
  pages_fetched: number;
  total_items: number;
  stop_reason: string;
  success: boolean;
  last_http_status: number | null;
  last_error: string | null;
  pages: PaginationPageLog[];
  merged_response_preview: string | null;
}

export interface CardConfigPayload {
  api_id: string;
  card_enabled: boolean;
  list_path: string | null;
  quick_run: boolean;
  default_child_api_id: string | null;
  default_card_action_id: string | null;
  skip_action_modal: boolean;
  open_type: CardOpenTypeExtended;
  card_config: CardDisplayConfig;
  selected_fields: SelectedField[];
}

export interface SaveCardConfigPayload {
  card_enabled?: boolean;
  list_path: string;
  quick_run?: boolean;
  default_child_api_id?: string | null;
  default_card_action_id?: string | null;
  skip_action_modal?: boolean;
  open_type?: CardOpenTypeExtended;
  card_config?: CardDisplayConfig;
  selected_fields: Array<{
    path: string;
    label?: string | null;
    display_type: DisplayType;
    sort_order: number;
    is_visible?: boolean;
  }>;
}

export interface ApiCardsBundle {
  api_id: string;
  api_name: string;
  card_enabled: boolean;
  quick_run: boolean;
  default_child_api_id: string | null;
  default_card_action_id: string | null;
  skip_action_modal: boolean;
  open_type: CardOpenTypeExtended;
  list_path: string | null;
  card_config: CardDisplayConfig;
  actions: CardAction[];
  default_card_click_action_id: string | null;
  cards: BuiltCard[];
  message?: string;
}

export interface VideoAsset {
  id: string;
  ott_id: string;
  api_node_id: string | null;
  source_response_id: string | null;
  parent_api_id: string | null;
  item_key: string | null;
  title: string | null;
  description: string | null;
  thumbnail: string | null;
  video_url: string;
  video_type: string | null;
  quality: string | null;
  language: string | null;
  duration: string | null;
  metadata: Record<string, any>;
  status: string;
  is_saved_to_library?: boolean;
  library_item_id?: string | null;
  library_status?: LibraryItemStatus | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Library row status, post-R2 migration. The backend dropped the
 * `status` column entirely (a row exists only when the R2 upload
 * succeeded), but we keep this type so card/badge components have a
 * single value to render: `completed`. Old callers that still pass
 * one of the legacy strings will type-check fine.
 */
export type LibraryItemStatus = 'completed';

export interface LibraryItem {
  id: string;
  ott_id: string;
  video_asset_id: string | null;
  api_node_id: string | null;
  source_response_id: string | null;
  parent_api_id: string | null;
  item_key: string | null;
  parent_item_key: string | null;
  parent_title: string | null;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  original_video_url: string | null;
  original_video_type: string | null;
  /** R2 CDN URL — the single source the player/viewer reads. */
  file_url: string | null;
  /** 'video' | 'image' | 'thumbnail' | 'playlist' | 'audio' | null */
  file_type: string | null;
  thumbnail_display_url: string | null;
  /** Convenience pointer for <video src>. Equal to `file_url` for
   *  videos and `null` otherwise. */
  playback_url: string | null;
  /** Backend download/stream endpoints (302 → file_url). */
  download_url: string | null;
  stream_url: string | null;
  file_name: string | null;
  file_ext: string | null;
  mime_type: string | null;
  file_size: number | null;
  duration: string | null;
  quality: string | null;
  language: string | null;
  save_type: string;
  is_video?: boolean;
  metadata: Record<string, any>;
  savedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
  /** Always 'completed' after the R2 migration; kept for older
   *  badge/list components that still read it. */
  status?: LibraryItemStatus;
}

export interface SaveToLibraryPayload {
  video_asset_id: string;
  save_video?: boolean;
  save_image?: boolean;
  save_thumbnail?: boolean;
  convert_to_mp4?: boolean;
}

export interface SaveBulkToLibraryPayload {
  video_asset_ids: string[];
  save_video?: boolean;
  save_image?: boolean;
  save_thumbnail?: boolean;
  convert_to_mp4?: boolean;
}

export interface CapturedVideoSummary {
  id: string;
  title: string | null;
  video_url: string;
  video_type: string | null;
  quality: string | null;
  thumbnail: string | null;
  createdAt: string | null;
}

export interface CaptureVideoAssetsPayload {
  api_node_id: string;
  source_response_id?: string | null;
  parent_api_id?: string | null;
  item_key?: string | null;
  list_path?: string | null;
  video_url_paths: string[];
  title_path?: string | null;
  description_path?: string | null;
  thumbnail_path?: string | null;
  quality_path?: string | null;
  language_path?: string | null;
  duration_path?: string | null;
}

/** Persistent capture mapping stored on an API node. Reused across many cards. */
export interface CaptureMapping {
  list_path?: string | null;
  video_url_paths: string[];
  title_path?: string | null;
  description_path?: string | null;
  thumbnail_path?: string | null;
  quality_path?: string | null;
  language_path?: string | null;
  duration_path?: string | null;
  save_video?: boolean;
  save_image?: boolean;
  save_thumbnail?: boolean;
  convert_to_mp4?: boolean;
}

export interface SaveFromCardsPayload {
  api_node_id: string;
  source_response_id?: string | null;
  card_indices: number[];
  save_video?: boolean;
  save_image?: boolean;
  save_thumbnail?: boolean;
  convert_to_mp4?: boolean;
  // Folder grouping — captured from the parent card so the library can
  // bucket cards by show/series instead of showing one flat list.
  parent_item_key?: string | null;
  parent_title?: string | null;
  parent_api_id?: string | null;
}

export interface NestedCardsPageResponse {
  ott_id: string;
  parent_api: {
    id: string;
    name: string;
    endpoint: string;
    method: string;
    list_path: string | null;
  };
  child_api: {
    id: string;
    name: string;
    endpoint: string;
    method: string;
    list_path: string | null;
  };
  parent_card: BuiltCard | null;
  parent_card_index: number;
  parent_item_key: string | null;
  response_id: string | null;
  source_response_id: string | null;
  upstream_source_response_id: string | null;
  breadcrumb: Array<{ api_id: string; api_name: string; item_key: string }>;
  depth: number;
  cached: boolean;
  child_response: any;
  child_resolved_endpoint: string | null;
  child_http_status: number | null;
  child_call_success: boolean | null;
  child_error_message: string | null;
  child_log_id: string | null;
  cards_data: {
    api_id: string;
    card_enabled: boolean;
    list_path: string | null;
    cards: BuiltCard[];
    actions: CardAction[];
    default_card_click_action_id: string | null;
  };
  captured_videos: CapturedVideoSummary[];
}

export interface CardsFromContextResponse {
  api_id: string;
  source_response_id: string;
  item_key: string;
  card_enabled: boolean;
  list_path: string | null;
  quick_run: boolean;
  default_child_api_id: string | null;
  open_type: CardOpenTypeExtended;
  card_config?: CardDisplayConfig;
  response: any;
  cards: BuiltCard[];
  message?: string;
}

export interface ApiCallLog {
  id: string;
  ott_id: string;
  api_node_id: string | null;
  parent_api_id: string | null;
  child_api_id: string | null;
  api_name: string | null;
  parent_api_name: string | null;
  original_endpoint: string | null;
  resolved_endpoint: string | null;
  request_url: string | null;
  method: string | null;
  cookie_status: 'available' | 'missing' | null;
  cookie_length: number;
  cookie_names: string[];
  dynamic_params_used: Record<string, any>;
  status: 'pending' | 'success' | 'failed';
  http_status: number | null;
  duration_ms: number | null;
  response_preview: string | null;
  error_message: string | null;
  card_index: number | null;
  item_key: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string | null;
  request_headers?: Record<string, any>;
  request_body?: any;
  response?: any;
  error_details?: any;
}

export interface OttPlatformSummary {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  base_url: string;
  cookie_file_name: string | null;
  favicon_url: string | null;
  headers: Record<string, any>;
  status: string;
  total_apis: number;
  total_selected_sections: number;
  lastSyncedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface OttPlatformDetail {
  id: string;
  user_id: string | null;
  name: string;
  description: string | null;
  base_url: string;
  cookie_file_name: string | null;
  favicon_url: string | null;
  headers: Record<string, any>;
  status: string;
  api_tree: ApiNode[];
  lastSyncedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CardField {
  path: string;
  label: string | null;
  display_type: DisplayType;
  value: any;
}

export interface BuiltCard {
  index: number;
  item_key: string;
  fields: CardField[];
  raw_item: any;
}

export type CardActionType = 'open_detail' | 'call_child_api' | 'open_url' | 'copy_value' | 'custom_button';
export type CardButtonStyle = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type CardOpenType = 'drawer' | 'page' | 'modal';

export interface CardAction {
  id: string;
  ott_id: string;
  api_node_id: string;
  label: string;
  action_type: CardActionType;
  child_api_id: string | null;
  value_path: string | null;
  button_style: CardButtonStyle;
  icon: string | null;
  open_type: CardOpenType;
  sort_order: number;
  config: Record<string, any>;
  is_active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ApiCardsResponse {
  api_id: string;
  api_name: string;
  card_enabled?: boolean;
  quick_run?: boolean;
  default_child_api_id?: string | null;
  open_type?: CardOpenTypeExtended;
  list_path: string | null;
  card_config?: CardDisplayConfig;
  actions: CardAction[];
  default_card_click_action_id: string | null;
  cards: BuiltCard[];
  message?: string;
}

export interface OttCardsResponse {
  ott_id: string;
  sections: ApiCardsResponse[];
}

export interface CardActionsListResponse {
  api_id: string;
  default_card_click_action_id: string | null;
  actions: CardAction[];
}

export interface CreateCardActionPayload {
  label: string;
  action_type: CardActionType;
  child_api_id?: string | null;
  value_path?: string | null;
  button_style?: CardButtonStyle;
  icon?: string | null;
  open_type?: CardOpenType;
  sort_order?: number;
  config?: Record<string, any>;
  is_default_card_click?: boolean;
}

export interface UpdateCardActionPayload extends Partial<CreateCardActionPayload> {
  is_active?: boolean;
}

// Form-only payload types
export interface CreateOttPayload {
  name: string;
  description?: string;
  base_url: string;
  cookie_file_name?: string;
  cookie_raw_content?: string;
  cookie_string?: string;
  headers?: Record<string, any>;
  favicon_url?: string | null;
}

export interface UpdateOttPayload {
  name?: string;
  description?: string | null;
  base_url?: string;
  cookie_file_name?: string | null;
  cookie_raw_content?: string | null;
  cookie_string?: string | null;
  headers?: Record<string, any>;
  favicon_url?: string | null;
  status?: string;
}

export interface CreateApiNodePayload {
  parent_id?: string | null;
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  request_body?: Record<string, any> | null;
  param_mappings?: Record<string, string>;
  sort_order?: number;
  pagination_enabled?: boolean;
  pagination_type?: PaginationType | null;
  pagination_config?: PaginationConfig;
  body_mode?: BodyMode | null;
  request_body_config?: BodyConfigEntry[];
}

export interface UpdateApiNodePayload extends Partial<CreateApiNodePayload> {}

export interface SaveSelectedFieldsPayload {
  list_path: string;
  selected_fields: Array<{
    path: string;
    label?: string | null;
    display_type: DisplayType;
    sort_order: number;
    is_visible?: boolean;
  }>;
}

export interface CallFromCardPayload {
  parent_api_id: string;
  card_index: number;
  item_key?: string;
  parent_item_key?: string;
  source_response_id?: string;
}

export interface NestedApiSummary {
  id: string;
  name: string;
  endpoint: string;
  method: string;
  list_path: string | null;
  param_mappings: Record<string, string>;
  status: string;
  last_http_status: number | null;
  last_error: string | null;
  lastCalledAt: string | null;
}

export interface NestedBreadcrumbEntry {
  api_id: string;
  api_name: string;
  item_key: string;
}

export interface NestedDataResponse {
  ott_id: string;
  parent_api: NestedApiSummary;
  child_api: NestedApiSummary;
  parent_card: BuiltCard | null;
  parent_card_index: number;
  parent_item_key: string | null;
  source_response_id: string | null;
  upstream_source_response_id: string | null;
  upstream_source_type: 'root' | 'child' | null;
  breadcrumb: NestedBreadcrumbEntry[];
  depth: number;
  cached: boolean;
  child_response: any;
  child_resolved_endpoint: string | null;
  child_http_status: number | null;
  child_call_success: boolean | null;
  child_error_message: string | null;
  child_log_id: string | null;
  child_cards: BuiltCard[];
  child_actions: CardAction[];
  default_card_click_action_id: string | null;
}
