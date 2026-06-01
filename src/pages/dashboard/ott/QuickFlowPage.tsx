/**
 * Quick Flow — visual map of an OTT's full pipeline. Joins together:
 *   OTT root → APIs (parent → child tree) → Capture Video → Library
 *
 * Backend builds the data in one shot (`/api/ott/:ott_id/quick_flow`), so the
 * page is a pure visualiser. Each node type has its own React Flow component
 * so the canvas reads as a real pipeline rather than a row of identical
 * cards. API nodes that have card_enabled also draw a small card preview
 * mockup using the user's selected_fields resolved against the saved
 * sample response — no fake data, just what the user would actually see
 * when they click the API.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  MarkerType,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node as RFNode,
  type Edge as RFEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  RefreshCw,
  Layers,
  CheckCircle2,
  XCircle,
  Network,
  Database,
  Zap,
  LayoutGrid,
  Folder,
  Video,
  X,
  Image as ImageIcon,
  Settings as SettingsIcon,
  Globe,
  Box,
  Download,
  Maximize2,
  Lock,
  Unlock,
  Copy,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import toast from 'react-hot-toast';
import { JsonTreeViewer } from '../../../components/ui/JsonTreeViewer';
import { ott_service } from '../../../services/ott_service';
import type {
  QuickFlowResponse,
  QuickFlowNode,
  QuickFlowApiNode,
  QuickFlowOttRootNode,
  QuickFlowCaptureVideoNode,
  QuickFlowLibraryNode,
  QuickFlowEdge,
} from '../../../types';

// ── Node helpers ─────────────────────────────────────────────────────────
const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  POST: 'bg-brand-blue/15 text-brand-blue border-brand-blue/40',
  PUT: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
  PATCH: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
  DELETE: 'bg-red-500/15 text-red-400 border-red-500/40',
};

interface CustomNodeData {
  qf: QuickFlowNode;
  is_selected: boolean;
  /** Which of the four sides actually carry an edge for this node. Used
   *  to hide the handle dots on unused sides so the canvas isn't dotted
   *  with floating connection points. Computed alongside the rf_edges
   *  build so source/target sides stay in sync with the edge routing. */
  active_sides?: { top: boolean; right: boolean; bottom: boolean; left: boolean };
}

/** Four-sided handles every custom node needs so React Flow edges can
 *  attach to whichever side gives the shortest path. Each side has BOTH
 *  a source and a target handle (overlapping at the same point); the
 *  edge picks which to use via `sourceHandle` / `targetHandle` based on
 *  the relative positions of the two nodes — handled in compute_edges
 *  below. Without this, snake-layout transitions (last node of row N →
 *  first node of row N+1) loop awkwardly through left/right handles. */
const HANDLE_SIDES: Array<{ pos: Position; id: 's' | 't'; key: 'top' | 'right' | 'bottom' | 'left' }> = [
  { pos: Position.Top, id: 's', key: 'top' },
  { pos: Position.Top, id: 't', key: 'top' },
  { pos: Position.Right, id: 's', key: 'right' },
  { pos: Position.Right, id: 't', key: 'right' },
  { pos: Position.Bottom, id: 's', key: 'bottom' },
  { pos: Position.Bottom, id: 't', key: 'bottom' },
  { pos: Position.Left, id: 's', key: 'left' },
  { pos: Position.Left, id: 't', key: 'left' },
];

const NodeHandles: React.FC<{
  tone?: string;
  active_sides?: CustomNodeData['active_sides'];
}> = ({ tone = '#64748B', active_sides }) => (
  <>
    {HANDLE_SIDES.map(h => {
      // Show the dot only when this side is actually wired up to an edge
      // (or when active_sides isn't provided yet — keeps the legacy
      // 4-dot look until the edge build runs and supplies sides).
      const is_active = active_sides ? active_sides[h.key] : (h.key === 'left' || h.key === 'right');
      return (
        <Handle
          key={`${h.id}-${h.key}`}
          id={`${h.id}-${h.key}`}
          type={h.id === 's' ? 'source' : 'target'}
          position={h.pos}
          style={{
            background: is_active ? tone : 'transparent',
            width: 8,
            height: 8,
            border: is_active ? '2px solid #0A0C10' : 'none',
          }}
          isConnectable={false}
        />
      );
    })}
  </>
);

// ── OTT root node ────────────────────────────────────────────────────────
const OttRootNode: React.FC<{ data: CustomNodeData }> = ({ data }) => {
  if (data.qf.type !== 'ott_root') return null;
  const qf = data.qf;
  return (
    <div className={`relative min-w-[220px] rounded-2xl border-2 transition-all ${data.is_selected
        ? 'border-brand-emerald shadow-[0_0_0_3px_rgba(16,185,129,0.25)]'
        : 'border-brand-emerald/40 hover:border-brand-emerald/70'
      } bg-gradient-to-br from-brand-emerald/15 via-bg-card to-brand-blue/10 p-4`}>
      <NodeHandles tone="#10B981" active_sides={data.active_sides} />
      <div className="flex items-center gap-3">
        {qf.ott.favicon_url ? (
          <img
            src={qf.ott.favicon_url}
            alt=""
            className="w-10 h-10 rounded-lg bg-white/90 p-1 object-contain shrink-0"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-brand-emerald/20 text-brand-emerald flex items-center justify-center shrink-0">
            <Globe size={20} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-widest text-brand-emerald">OTT</p>
          <h4 className="text-sm font-bold text-text-main truncate">{qf.ott.name}</h4>
          <p className="text-[10px] text-text-muted font-mono truncate" title={qf.ott.base_url}>
            {qf.ott.base_url}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-[10px] text-text-muted border-t border-border-subtle/40 pt-2">
        <span><span className="text-text-main font-bold pe-1">{qf.summary.total_apis}</span> APIs</span>
        <span><span className="text-text-main font-bold pe-1">{qf.summary.root_apis}</span> root</span>
      </div>
    </div>
  );
};

// ── API node (with optional card preview mockup) ─────────────────────────
const ApiNode: React.FC<{ data: CustomNodeData }> = ({ data }) => {
  if (data.qf.type !== 'api_node') return null;
  const qf = data.qf;
  const method_class = METHOD_COLORS[qf.api.method ?? 'GET'] ?? METHOD_COLORS.GET;
  const status_dot = qf.api.status === 'success' ? 'bg-emerald-500'
    : qf.api.status === 'failed' ? 'bg-red-500'
      : 'bg-text-muted/40';
  const has_preview = qf.card_preview !== null;

  return (
    <div className={`relative w-[300px] rounded-2xl border-2 transition-all ${data.is_selected
        ? 'border-brand-emerald shadow-[0_0_0_3px_rgba(16,185,129,0.25)] bg-bg-card'
        : 'border-border-subtle bg-bg-card hover:border-brand-emerald/60'
      }`}>
      <NodeHandles tone="#10B981" active_sides={data.active_sides} />
      <div className="p-3 border-b border-border-subtle">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${method_class}`}>
            {qf.api.method}
          </span>
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${status_dot}`} />
            <span className="text-[9px] uppercase font-bold text-text-muted">
              {qf.api.last_http_status ?? qf.api.status}
            </span>
          </div>
        </div>
        <h4 className="text-sm font-bold text-text-main truncate" title={qf.api.name}>
          {qf.api.name}
        </h4>
        <p className="text-[10px] text-text-muted font-mono truncate" title={qf.api.endpoint}>
          {qf.api.endpoint}
        </p>
      </div>

      {/* Inline card preview mockup — only when the API has card_enabled
          AND we successfully resolved at least one selected_field against
          the saved sample response. Pagination/body/fields/quick-run
          details all live in the right-side panel; the canvas stays
          focused on what the user will actually SEE (the card). */}
      {has_preview && qf.card_preview && (
        <CardMockup preview={qf.card_preview} actions={qf.card_actions} />
      )}
    </div>
  );
};

const CardMockup: React.FC<{
  preview: NonNullable<QuickFlowApiNode['card_preview']>;
  actions: QuickFlowApiNode['card_actions'];
}> = ({ preview, actions }) => {
  const visible_action = actions.find(a => a.action_type === 'call_child_api') ?? actions[0];
  return (
    <div className="m-2 rounded-xl bg-bg-main border border-border-subtle overflow-hidden">
      <div className="relative bg-black/30 aspect-video">
        {preview.image_url ? (
          <img
            src={preview.image_url}
            alt={preview.title ?? ''}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted/60">
            <ImageIcon size={28} />
          </div>
        )}
        {preview.badge && (
          <span className="absolute top-1.5 left-1.5 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-black/70 text-white">
            {preview.badge}
          </span>
        )}
        <span className="absolute top-1.5 right-1.5 p-1 rounded bg-black/50 text-white/70">
          <SettingsIcon size={9} />
        </span>
      </div>
      <div className="p-2 space-y-0.5">
        {preview.title && (
          <p className="text-[11px] font-bold text-text-main line-clamp-1" title={preview.title}>
            {preview.title}
          </p>
        )}
        {preview.subtitle && (
          <p className="text-[9px] text-text-muted line-clamp-1" title={preview.subtitle}>
            {preview.subtitle}
          </p>
        )}
        {visible_action && (
          <span className="inline-block mt-1 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-brand-emerald/15 text-brand-emerald">
            {visible_action.label}
          </span>
        )}
      </div>
    </div>
  );
};

// ── Capture Video node ───────────────────────────────────────────────────
const CaptureVideoNodeEl: React.FC<{ data: CustomNodeData }> = ({ data }) => {
  if (data.qf.type !== 'capture_video') return null;
  const qf = data.qf;
  return (
    <div className={`relative min-w-[200px] rounded-2xl border-2 transition-all p-4 ${data.is_selected
        ? 'border-brand-emerald shadow-[0_0_0_3px_rgba(16,185,129,0.25)]'
        : 'border-purple-500/40 hover:border-purple-500/70'
      } bg-gradient-to-br from-purple-500/15 via-bg-card to-bg-card`}>
      <NodeHandles tone="#A855F7" active_sides={data.active_sides} />
      {/* Canvas keeps just the icon + label; counts and per-type
          breakdown render only when the user clicks (right-side panel)
          so the diagram stays clean. */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
          <Video size={18} />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-purple-400">Capture</p>
          <h4 className="text-sm font-bold text-text-main">Captured Videos</h4>
        </div>
      </div>
    </div>
  );
};

// ── Library node ─────────────────────────────────────────────────────────
const LibraryNode: React.FC<{ data: CustomNodeData }> = ({ data }) => {
  if (data.qf.type !== 'library') return null;
  const qf = data.qf;
  return (
    <div className={`relative min-w-[220px] rounded-2xl border-2 transition-all p-4 ${data.is_selected
        ? 'border-brand-emerald shadow-[0_0_0_3px_rgba(16,185,129,0.25)]'
        : 'border-amber-500/40 hover:border-amber-500/70'
      } bg-gradient-to-br from-amber-500/15 via-bg-card to-bg-card`}>
      <NodeHandles tone="#F59E0B" active_sides={data.active_sides} />
      {/* Canvas keeps just the icon + label. Total count and the
          status / save-type breakdown render only on click (right-side
          panel) so the diagram stays scannable. */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
          <Folder size={18} fill="currentColor" />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400">Library</p>
          <h4 className="text-sm font-bold text-text-main">Local Library</h4>
        </div>
      </div>
    </div>
  );
};

const node_types = {
  api_node: ApiNode,
  ott_root: OttRootNode,
  capture_video: CaptureVideoNodeEl,
  library: LibraryNode,
};

// ── Layout (snake / boustrophedon) ───────────────────────────────────────
// Instead of stretching levels into long horizontal strips, we BFS from the
// OTT root and place nodes in a 3-column grid that snakes back and forth:
//   row 0:   →→→
//   row 1:   ←←←
//   row 2:   →→→
// This keeps parent-child connectors short (consecutive nodes are
// adjacent), makes the chart fit on a normal screen, and matches the
// "real process diagram" feel the user is after.
const NODES_PER_ROW = 3;
const COL_WIDTH = 380;
// API nodes that show the card-preview mockup are ~440px tall. ROW_HEIGHT
// must clear that PLUS the multi-line edge label that sits between rows,
// otherwise row 2 visually slides under the tail of row 1.
const ROW_HEIGHT = 520;

function compute_positions(
  qf_nodes: QuickFlowNode[],
  edges: QuickFlowEdge[],
): Map<string, { x: number; y: number }> {
  // Pin synthetic boundary nodes to fixed slots in the sequence so they
  // never end up between API nodes. Without this, when there are no
  // captured videos the Library node has indegree 0 and BFS treats it
  // as a second root, dropping it into row 0 between OTT and the first
  // API — and the OTT → first-API edge then visually passes through it.
  const ott_root = qf_nodes.find(n => n.type === 'ott_root') ?? null;
  const capture = qf_nodes.find(n => n.type === 'capture_video') ?? null;
  const library = qf_nodes.find(n => n.type === 'library') ?? null;
  const api_nodes = qf_nodes.filter(n => n.type === 'api_node');

  // BFS only the API tree, starting from APIs that have no parent_id.
  // Build adjacency just from api_connection edges so capture/library
  // edges don't pull synthetic nodes back into the API ordering.
  const api_id_set = new Set(api_nodes.map(n => n.id));
  const adj = new Map<string, string[]>();
  for (const n of api_nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (e.type !== 'api_connection') continue;
    if (!api_id_set.has(e.source) || !api_id_set.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
  }
  const api_roots = api_nodes.filter(n => !n.api.parent_id);

  const ordered_apis: QuickFlowNode[] = [];
  const seen = new Set<string>();
  const queue: string[] = api_roots.map(r => r.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = api_nodes.find(n => n.id === id);
    if (node) ordered_apis.push(node);
    for (const next of adj.get(id) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  for (const n of api_nodes) {
    // Pick up any orphan APIs that BFS missed (e.g. parent filtered out)
    // so they still get a position and don't pile on top of (0,0).
    if (!seen.has(n.id)) ordered_apis.push(n);
  }

  // Final canvas order: OTT first, then API tree, then synthetic
  // boundary nodes at the end (capture before library when both exist).
  const order: QuickFlowNode[] = [
    ...(ott_root ? [ott_root] : []),
    ...ordered_apis,
    ...(capture ? [capture] : []),
    ...(library ? [library] : []),
  ];

  const out = new Map<string, { x: number; y: number }>();
  order.forEach((n, idx) => {
    const row = Math.floor(idx / NODES_PER_ROW);
    const col_in_row = idx % NODES_PER_ROW;
    // Snake: every other row reverses direction so the last node of row
    // N sits directly above the first node of row N+1, keeping the link
    // between them short.
    const col = row % 2 === 0
      ? col_in_row
      : (NODES_PER_ROW - 1 - col_in_row);
    out.set(n.id, { x: col * COL_WIDTH, y: row * ROW_HEIGHT });
  });
  return out;
}

// ── Helpers shared with image export ────────────────────────────────────
/** Estimated rendered size per node type. Used by the image export to
 *  compute the bounding box so far-out nodes are inside the captured
 *  area too. Kept in sync with the actual rendered widths above. */
function node_size(type: string | undefined, has_card_preview: boolean): { w: number; h: number } {
  if (type === 'api_node') return { w: 300, h: has_card_preview ? 440 : 100 };
  if (type === 'ott_root') return { w: 220, h: 110 };
  if (type === 'capture_video') return { w: 200, h: 70 };
  if (type === 'library') return { w: 220, h: 70 };
  return { w: 200, h: 100 };
}

// ── Page ─────────────────────────────────────────────────────────────────

const QuickFlowPage: React.FC = () => {
  const { ott_id } = useParams<{ ott_id: string }>();
  const navigate = useNavigate();

  const [data, set_data] = useState<QuickFlowResponse | null>(null);
  const [loading, set_loading] = useState(true);
  const [error_text, set_error_text] = useState<string | null>(null);
  const [selected_node_id, set_selected_node_id] = useState<string | null>(null);
  const [selected_edge_id, set_selected_edge_id] = useState<string | null>(null);
  const [body_modal, set_body_modal] = useState<null | {
    title: string;
    body: any;
    mappings?: QuickFlowEdge['body_mappings'];
  }>(null);
  // Active "show only this action's edge" highlight when the user hovers a
  // card-action chip in the API detail panel. Stores the action id so the
  // edge whose card_action source matches gets a thicker stroke.
  const [hovered_action_child_id, set_hovered_action_child_id] = useState<string | null>(null);
  // Canvas lock state. Default LOCKED so the canvas is read-only on
  // first paint (no accidental zoom on scroll, no dragging anything
  // around). Click-to-select / hover-to-highlight still work — the lock
  // only disables movement gestures. Toggling the lock unlocks ALL of:
  // canvas pan, scroll/pinch zoom, double-click zoom, and per-node drag.
  const [is_locked, set_is_locked] = useState(true);
  const flow_canvas_ref = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!ott_id) return;
    set_loading(true);
    set_error_text(null);
    try {
      const res = await ott_service.get_quick_flow(ott_id);
      if (!res.success || !res.data) throw new Error(res.message || 'Failed to load quick flow');
      set_data(res.data);
    } catch (err: any) {
      set_error_text(err?.message || 'Failed to load quick flow');
      toast.error(err?.message || 'Failed to load quick flow');
    } finally {
      set_loading(false);
    }
  }, [ott_id]);

  useEffect(() => { load(); }, [load]);

  // The search + status/feature filter UI was removed at the user's
  // request, so the only filter that survives is "drop fully-
  // disconnected nodes". Anything with no incoming AND no outgoing
  // edge is a floating box that adds noise without telling the user
  // anything about the flow.
  const visible_node_ids = useMemo(() => {
    if (!data) return new Set<string>();
    const ids = new Set<string>(data.nodes.map(n => n.id));
    const connected = new Set<string>();
    for (const e of data.edges) {
      if (ids.has(e.source) && ids.has(e.target)) {
        connected.add(e.source);
        connected.add(e.target);
      }
    }
    const final_ids = new Set<string>();
    for (const id of ids) if (connected.has(id)) final_ids.add(id);
    return final_ids;
  }, [data]);

  // React-Flow controlled state. `useNodesState` gives us the standard
  // change handler that PRESERVES dragged positions across re-renders —
  // the bug that made nodes snap back when state unrelated to position
  // changed (selection, hover-highlight, filter). The `next_*` values
  // below are the "what we'd render from scratch" computation; the
  // syncing effect merges them into state while keeping any user-dragged
  // position from the previous round.
  const [rf_nodes, set_rf_nodes, on_nodes_change] = useNodesState<CustomNodeData>([]);
  const [rf_edges, set_rf_edges, on_edges_change] = useEdgesState([]);

  const { next_nodes, next_edges } = useMemo(() => {
    if (!data) return { next_nodes: [] as RFNode<CustomNodeData>[], next_edges: [] as RFEdge[] };
    const visible_nodes = data.nodes.filter(n => visible_node_ids.has(n.id));
    // Pass the visible edges too so BFS only walks the graph the user
    // actually sees (filters can hide branches).
    const visible_edges = data.edges.filter(
      e => visible_node_ids.has(e.source) && visible_node_ids.has(e.target),
    );
    const positions = compute_positions(visible_nodes, visible_edges);
    /** Pick the shortest-path handle pair for this edge based on where
     *  source and target sit on the snake grid:
     *   - different rows  → source.bottom → target.top  (or top→bottom
     *                       if target is above)
     *   - same row, same direction → right→left  (or left→right going back)
     *  Falls back to right→left when positions are unknown. */
    const pick_handles = (src_id: string, tgt_id: string): { sourceHandle: string; targetHandle: string } => {
      const a = positions.get(src_id);
      const b = positions.get(tgt_id);
      if (!a || !b) return { sourceHandle: 's-right', targetHandle: 't-left' };
      const dy = b.y - a.y;
      if (dy > 1) return { sourceHandle: 's-bottom', targetHandle: 't-top' };
      if (dy < -1) return { sourceHandle: 's-top', targetHandle: 't-bottom' };
      // Same row.
      return b.x >= a.x
        ? { sourceHandle: 's-right', targetHandle: 't-left' }
        : { sourceHandle: 's-left', targetHandle: 't-right' };
    };

    const next_edges: RFEdge[] = data.edges
      .filter(e => visible_node_ids.has(e.source) && visible_node_ids.has(e.target))
      .map(e => {
        const stroke =
          e.type === 'ott_to_root' ? '#10B981'
            : e.type === 'api_to_capture' ? '#A855F7'
              : e.type === 'capture_to_library' ? '#F59E0B'
                : e.trigger_type === 'quick_run' ? '#F59E0B'
                  : e.trigger_type === 'card_action' ? '#3B82F6'
                    : e.trigger_type === 'card_click' ? '#10B981'
                      : '#64748B';
        // The edge is "highlighted" either because the user clicked it OR
        // because they're hovering an action chip whose target matches.
        const is_action_highlight =
          hovered_action_child_id !== null && e.target === hovered_action_child_id;
        const is_selected = selected_edge_id === e.id;
        const stroke_width = is_selected || is_action_highlight ? 3 : 2;

        // Short readable event label — what *happens* when this edge
        // fires, not what category it belongs to. Optional secondary line
        // shows the first param mapping or the body field count so the
        // user gets the gist without clicking through.
        const event_text = (() => {
          if (e.type === 'ott_to_root') return 'register';
          if (e.type === 'api_to_capture') return 'capture video';
          if (e.type === 'capture_to_library') return 'save to library';
          // api_connection
          if (e.trigger_type === 'quick_run') return 'quick run';
          if (e.trigger_type === 'card_action') return 'button action';
          if (e.trigger_type === 'card_click') return 'click + api call';
          return 'manual trigger';
        })();
        const param_entries = Object.entries(e.param_mappings).slice(0, 1);
        const label_node = (
          <div className="flex flex-col items-center gap-0.5 leading-tight">
            <span className="font-bold uppercase tracking-wider text-[9px]" style={{ color: stroke }}>
              {event_text}
            </span>
            {param_entries.map(([k, v]) => (
              <span key={k} className="text-[8px] font-mono text-text-muted/80">
                <span className="text-emerald-400">{k}</span>
                <span> ← </span>
                <span className="text-cyan-400">{v}</span>
              </span>
            ))}
            {e.body_mappings.length > 0 && param_entries.length === 0 && (
              <span className="text-[8px] font-mono text-text-muted/70">
                body · {e.body_mappings.length} field{e.body_mappings.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        );

        const handles = pick_handles(e.source, e.target);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          // smoothstep gives the "Visio" right-angle look the user wants —
          // pipeline-ish rather than the default loose bezier.
          type: 'smoothstep',
          label: label_node,
          animated: e.trigger_type === 'quick_run' || e.type === 'capture_to_library' || is_action_highlight,
          labelStyle: { fontWeight: 700 },
          labelBgStyle: { fill: 'rgba(16,18,22,0.92)', stroke, strokeWidth: 1 } as any,
          labelBgPadding: [8, 6] as [number, number],
          labelBgBorderRadius: 8,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: stroke,
            width: 18,
            height: 18,
          },
          style: { stroke, strokeWidth: stroke_width },
        } as RFEdge;
      });

    // Tally which sides of each node actually carry an edge so the node
    // components can hide unused handle dots. Walks the just-built edges
    // and reads their sourceHandle/targetHandle (e.g. "s-right" → right
    // is active for the source). Default state is "no sides active",
    // overridden as edges discovered.
    type Sides = NonNullable<CustomNodeData['active_sides']>;
    const empty_sides = (): Sides => ({ top: false, right: false, bottom: false, left: false });
    const sides_by_node = new Map<string, Sides>();
    const get_sides = (id: string): Sides => {
      let s = sides_by_node.get(id);
      if (!s) { s = empty_sides(); sides_by_node.set(id, s); }
      return s;
    };
    const side_from_handle = (h: unknown): keyof Sides | null => {
      if (typeof h !== 'string') return null;
      if (h.endsWith('-top')) return 'top';
      if (h.endsWith('-right')) return 'right';
      if (h.endsWith('-bottom')) return 'bottom';
      if (h.endsWith('-left')) return 'left';
      return null;
    };
    for (const e of next_edges) {
      const src_side = side_from_handle((e as any).sourceHandle);
      const tgt_side = side_from_handle((e as any).targetHandle);
      if (src_side) get_sides(e.source)[src_side] = true;
      if (tgt_side) get_sides(e.target)[tgt_side] = true;
    }

    const next_nodes: RFNode<CustomNodeData>[] = visible_nodes.map(n => ({
      id: n.id,
      type: n.type,
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: {
        qf: n,
        is_selected: selected_node_id === n.id,
        active_sides: sides_by_node.get(n.id) ?? empty_sides(),
      },
    }));
    return { next_nodes, next_edges };
  }, [data, visible_node_ids, selected_node_id, selected_edge_id, hovered_action_child_id]);

  // Sync the freshly-computed nodes/edges into React-Flow's controlled
  // state. For nodes we PRESERVE any position the user has dragged to —
  // we keep the previous-render position whenever the same id is still
  // present. New nodes (e.g. after a refresh) fall through to the
  // computed auto-layout position. Edges get rebuilt from scratch each
  // time since they have no per-instance state worth preserving.
  useEffect(() => {
    set_rf_nodes(prev => {
      const prev_pos = new Map(prev.map(p => [p.id, p.position]));
      return next_nodes.map(n => ({
        ...n,
        position: prev_pos.get(n.id) ?? n.position,
      }));
    });
  }, [next_nodes, set_rf_nodes]);

  useEffect(() => {
    set_rf_edges(next_edges);
  }, [next_edges, set_rf_edges]);

  /** Snapshot the React Flow viewport into an image. We export the
   *  WHOLE graph (not just the visible viewport) by:
   *    1. computing the bounding box of every visible node using the
   *       same per-type size estimates the mini-map uses,
   *    2. asking html-to-image to render at the bbox dimensions while
   *       resetting the inner transform to `translate(-min_x, -min_y)`
   *       at 1×, so far-out nodes are inside the captured area too.
   *  Without this, zoomed-out nodes sat outside the captured frame
   *  and got cropped — which was the user's first complaint. */
  /** Snapshot the WHOLE flow chart into a PNG (no cropping). Computes
   *  the bounding box of every node, mutates the viewport's CSS
   *  transform to identity-with-our-offset for the duration of the
   *  capture, then restores it. JSON / JPG / SVG exports were removed
   *  at the user's request; PNG stays as the single export format. */
  const handle_export_png = useCallback(async () => {
    if (!flow_canvas_ref.current) {
      toast.error('Canvas not ready yet');
      return;
    }
    const viewport = flow_canvas_ref.current.querySelector('.react-flow__viewport') as HTMLElement | null;
    if (!viewport) {
      toast.error('Canvas not ready yet');
      return;
    }
    if (rf_nodes.length === 0) {
      toast.error('Nothing to export yet');
      return;
    }

    let min_x = Infinity, min_y = Infinity, max_x = -Infinity, max_y = -Infinity;
    for (const n of rf_nodes) {
      const has_preview = n.data?.qf.type === 'api_node' && !!(n.data.qf as QuickFlowApiNode).card_preview;
      const { w, h } = node_size(n.type, has_preview);
      min_x = Math.min(min_x, n.position.x);
      min_y = Math.min(min_y, n.position.y);
      max_x = Math.max(max_x, n.position.x + w);
      max_y = Math.max(max_y, n.position.y + h);
    }
    const padding = 80;
    const out_w = Math.ceil(max_x - min_x + padding * 2);
    const out_h = Math.ceil(max_y - min_y + padding * 2);

    const file_base = `quick-flow-${data?.ott.name?.replace(/\s+/g, '-').toLowerCase() ?? 'ott'}`;
    const want_transform = `translate(${-min_x + padding}px, ${-min_y + padding}px) scale(1)`;
    // 1×1 transparent PNG. html-to-image swaps any image it can't fetch
    // (cross-origin without CORS, 404, network error) for this so a
    // tainted image (favicon CDN, card-preview poster from the upstream
    // OTT) doesn't abort the export with SecurityError.
    const transparent_pixel =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';
    const options = {
      backgroundColor: '#0A0C10',
      pixelRatio: 2,
      cacheBust: true,
      width: out_w,
      height: out_h,
      imagePlaceholder: transparent_pixel,
      skipAutoScale: true,
      skipFonts: true,
      style: {
        width: `${out_w}px`,
        height: `${out_h}px`,
        transform: want_transform,
        transformOrigin: '0 0',
      },
    };

    // When the canvas is locked, fitView has set a `scale(0.X)` on the
    // viewport DOM. html-to-image's `style.transform` override only
    // applies to the CLONED root; the live element drives layout
    // measurement, so without this the captured image came out cropped.
    // Mutate the live transform to identity-with-our-offset, capture,
    // restore in `finally` (~100 ms — invisible to the user).
    const original_transform = viewport.style.transform;
    const original_transform_origin = viewport.style.transformOrigin;
    viewport.style.transform = want_transform;
    viewport.style.transformOrigin = '0 0';

    try {
      const data_url = await toPng(viewport, options);
      if (!data_url || data_url.length < 100) {
        throw new Error('PNG export produced empty output');
      }
      // Blob URL — large `data:` hrefs sometimes get refused by
      // Chrome/Firefox; Blob URLs always download regardless of size.
      const blob: Blob = await (await fetch(data_url)).blob();
      const blob_url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blob_url;
      a.download = `${file_base}.png`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blob_url), 1500);
      toast.success('PNG exported');
    } catch (err: any) {
      console.error('[Quick Flow export] failed', err);
      toast.error(err?.message || 'PNG export failed');
    } finally {
      viewport.style.transform = original_transform;
      viewport.style.transformOrigin = original_transform_origin;
    }
  }, [data, rf_nodes]);

  const selected_node = useMemo(
    () => data?.nodes.find(n => n.id === selected_node_id) ?? null,
    [data, selected_node_id],
  );
  const selected_edge = useMemo(
    () => data?.edges.find(e => e.id === selected_edge_id) ?? null,
    [data, selected_edge_id],
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-text-muted">
        <Loader2 size={36} className="animate-spin" />
        <p className="text-sm">Loading Quick Flow…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-12 text-center space-y-4">
        <AlertCircle size={64} className="mx-auto text-amber-500/60" />
        <h2 className="text-2xl font-bold text-text-main">{error_text || 'Quick Flow unavailable'}</h2>
        <button onClick={() => navigate(`/dashboard/ott/${ott_id}/manage`)} className="btn-primary px-8">
          Back to OTT
        </button>
      </div>
    );
  }

  if (data.nodes.filter(n => n.type === 'api_node').length === 0) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <Header
          ott={data.ott}
          on_refresh={load}
          on_export_png={handle_export_png}
          loading={loading}
        />
        <div className="p-16 text-center bg-black/5 dark:bg-white/5 rounded-3xl border border-dashed border-border-subtle space-y-4">
          <Network size={64} className="mx-auto text-text-muted opacity-50" />
          <h3 className="text-xl font-bold text-text-main">No API flow yet</h3>
          <p className="text-sm text-text-muted">Add your first API to generate a Quick Flow.</p>
          <button
            onClick={() => navigate(`/dashboard/ott/${ott_id}/manage`)}
            className="btn-primary px-8 py-3"
          >
            Add API
          </button>
        </div>
      </div>
    );
  }

  const summary_cards: Array<{ label: string; value: number; icon: React.ReactNode; tone: string }> = [
    { label: 'Total APIs', value: data.summary.total_apis, icon: <Network size={16} />, tone: 'text-text-main' },
    { label: 'Root', value: data.summary.root_apis, icon: <Database size={16} />, tone: 'text-brand-emerald' },
    { label: 'Child', value: data.summary.child_apis, icon: <Layers size={16} />, tone: 'text-brand-blue' },
    { label: 'Paginated', value: data.summary.paginated_apis, icon: <Layers size={16} />, tone: 'text-purple-400' },
    { label: 'Cards', value: data.summary.card_enabled_apis, icon: <LayoutGrid size={16} />, tone: 'text-cyan-400' },
    { label: 'Quick Run', value: data.summary.quick_run_apis, icon: <Zap size={16} />, tone: 'text-amber-400' },
    { label: 'Failed', value: data.summary.failed_apis, icon: <XCircle size={16} />, tone: 'text-red-400' },
    { label: 'Videos', value: data.summary.captured_videos, icon: <Video size={16} />, tone: 'text-purple-400' },
    { label: 'Library', value: data.summary.library_items, icon: <Folder size={16} />, tone: 'text-amber-400' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <Header
        ott={data.ott}
        on_refresh={load}
        on_export_png={handle_export_png}
        loading={loading}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
        {summary_cards.map(c => (
          <div key={c.label} className="p-3 rounded-2xl bg-bg-card border border-border-subtle space-y-1">
            <div className={`flex items-center gap-1.5 ${c.tone}`}>
              {c.icon}
              <span className="text-[9px] font-bold uppercase text-text-muted tracking-wider">{c.label}</span>
            </div>
            <p className={`text-xl font-black ${c.tone}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Flow canvas + side detail panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div ref={flow_canvas_ref} className="quick-flow-canvas relative lg:col-span-3 h-[720px] rounded-3xl border border-border-subtle bg-bg-card overflow-hidden">
          {/* Scoped React-Flow theming for the dark canvas. Targets the
              defaults shipped by reactflow's built-in stylesheet so the
              MiniMap viewport indicator gets a coloured border + rounded
              corners, and the Controls bottom-left buttons match the
              app's dark surface. Local class so we don't bleed into any
              other react-flow instance on the page. */}
          <style>{`
            .quick-flow-canvas .react-flow__minimap-mask {
              fill: rgba(10, 12, 16, 0.62);
              stroke: rgba(16, 185, 129, 0.9);
              /* Wider stroke + round joins so the viewport-indicator
                 corners visually round off (path corners themselves are
                 sharp, but the rounded line-join smooths them). */
              stroke-width: 4;
              stroke-linejoin: round;
              stroke-linecap: round;
              rx: 10;
              ry: 10;
            }
            .quick-flow-canvas .react-flow__controls {
              box-shadow: 0 8px 24px -8px rgba(0,0,0,0.55);
              border-radius: 14px;
              overflow: hidden;
              backdrop-filter: blur(12px);
              -webkit-backdrop-filter: blur(12px);
            }
            .quick-flow-canvas .react-flow__controls-button {
              background: rgba(16, 18, 22, 0.72);
              border-color: rgba(255, 255, 255, 0.08);
              color: #94A3B8;
              fill: #94A3B8;
              transition: background 0.15s, color 0.15s;
            }
            .quick-flow-canvas .react-flow__controls-button:hover {
              background: rgba(16, 185, 129, 0.18);
              color: #F1F5F9;
              fill: #F1F5F9;
            }
            .quick-flow-canvas .react-flow__controls-button svg {
              fill: currentColor;
            }
          `}</style>
          <ReactFlow
            nodes={rf_nodes}
            edges={rf_edges}
            // Wire the change handlers from useNodesState/useEdgesState so
            // user drags actually persist (without these the position
            // updates were discarded on the next memo re-run).
            onNodesChange={on_nodes_change}
            onEdgesChange={on_edges_change}
            nodeTypes={node_types}
            onNodeClick={(_, n) => { set_selected_node_id(n.id); set_selected_edge_id(null); }}
            onEdgeClick={(_, e) => { set_selected_edge_id(e.id); set_selected_node_id(null); }}
            onPaneClick={() => { set_selected_node_id(null); set_selected_edge_id(null); }}
            // Auto-fit the whole graph into the viewport on first paint so
            // the user always sees the full pipeline without scrolling.
            // Capped at 100% zoom so small graphs don't blow up beyond their
            // designed size; users can still zoom in (up to 200%) via the
            // Controls when they want a closer look.
            fitView
            fitViewOptions={{ padding: 0.18, maxZoom: 1, minZoom: 0.3 }}
            minZoom={0.3}
            maxZoom={2}
            // Lock-aware interactivity. Default state = locked, so the
            // canvas behaves as a static diagram until the user clicks
            // Unlock. elementsSelectable stays true regardless so click
            // selection + the side-panel inspector still work.
            nodesDraggable={!is_locked}
            nodesConnectable={false}
            panOnDrag={!is_locked}
            zoomOnScroll={!is_locked}
            zoomOnPinch={!is_locked}
            zoomOnDoubleClick={!is_locked}
            // When locked we DON'T preventDefault on wheel events, so a
            // mouse-wheel scroll over the canvas scrolls the page like
            // any other element. When unlocked we capture it so the
            // wheel becomes a zoom gesture instead.
            preventScrolling={!is_locked}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#1f2937" gap={20} />
            {/* Built-in interactive lock is hidden — we use our own
                top-right button below so the canvas behaves predictably
                (locked = no zoom/pan/drag, unlocked = everything). */}
            <Controls
              showInteractive={false}
              className="!bg-bg-card !border !border-border-subtle !rounded-xl"
            />
            {/* Stock React Flow MiniMap — paints node rects only (no
                edges). User asked to revert from the custom edge-aware
                version since the lines made the small box too busy. */}
            <MiniMap
              nodeStrokeWidth={3}
              nodeColor={(n) => {
                const qf = (n.data as CustomNodeData | undefined)?.qf;
                if (!qf) return '#64748B';
                if (qf.type === 'ott_root') return '#10B981';
                if (qf.type === 'capture_video') return '#A855F7';
                if (qf.type === 'library') return '#F59E0B';
                if (qf.api.status === 'failed') return '#EF4444';
                if (qf.api.status === 'success') return '#10B981';
                return '#64748B';
              }}
              maskColor="rgba(10, 12, 16, 0.62)"
              style={{
                background: 'rgba(16, 18, 22, 0.72)',
                backdropFilter: 'blur(16px) saturate(1.1)',
                WebkitBackdropFilter: 'blur(16px) saturate(1.1)',
                borderRadius: 18,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 12px 32px -10px rgba(0, 0, 0, 0.6)',
                overflow: 'hidden',
              }}
            />
          </ReactFlow>
          {/* Lock / unlock toggle — top-right of the canvas. Locked is
              the default: read-only diagram, no zoom/pan/drag. Unlock
              flips on canvas pan, scroll/pinch zoom, and per-node drag
              so the user can rearrange to suit their reading order. */}
          <button
            type="button"
            onClick={() => set_is_locked(prev => !prev)}
            className={`absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider backdrop-blur-md transition-colors shadow-lg ${is_locked
                ? 'bg-bg-card/85 border border-border-subtle text-text-muted hover:text-text-main hover:border-brand-emerald/50'
                : 'bg-brand-emerald/15 border border-brand-emerald/40 text-brand-emerald hover:bg-brand-emerald/25'
              }`}
            title={is_locked
              ? 'Canvas is locked. Click to enable zoom, pan, and node dragging.'
              : 'Canvas is unlocked. Click to lock and stop accidental movements.'}
          >
            {is_locked ? <Lock size={13} /> : <Unlock size={13} />}
            {is_locked ? 'Locked' : 'Unlocked'}
          </button>
        </div>

        <div className="lg:col-span-1 space-y-3">
          {selected_node && (
            <NodeDetail
              node={selected_node}
              on_hover_action={set_hovered_action_child_id}
            />
          )}
          {selected_edge && (
            <EdgeDetail
              edge={selected_edge}
              all_nodes={data.nodes}
              on_open_body={(title, body, mappings) => set_body_modal({ title, body, mappings })}
            />
          )}
          {!selected_node && !selected_edge && (
            <div className="p-6 rounded-2xl bg-bg-card border border-border-subtle text-center text-xs text-text-muted">
              Click any node or edge to inspect its config + sample resolution.
            </div>
          )}
        </div>
      </div>

      {/* Resolved body modal — full-screen JSON inspector for a single
          request body. Triggered by the "Inspect" affordance in the edge
          detail panel. */}
      {body_modal && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => set_body_modal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-4xl max-h-[88vh] bg-bg-card border border-border-subtle rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-subtle bg-black/20">
              <div>
                <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest">Quick Flow</p>
                <h3 className="text-sm font-bold text-text-main">{body_modal.title}</h3>
              </div>
              <button
                onClick={() => set_body_modal(null)}
                className="p-2 rounded-lg text-text-muted hover:text-text-main hover:bg-white/5"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {body_modal.mappings && body_modal.mappings.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-brand-blue uppercase tracking-widest mb-1">Mapping</p>
                  <div className="rounded-xl bg-black/30 border border-border-subtle p-3 space-y-1">
                    {body_modal.mappings.map((b, i) => (
                      <div key={i} className="text-[11px] font-mono">
                        <span className="text-emerald-400">{b.key}</span>
                        <span className="text-text-muted"> = </span>
                        {b.value_type === 'static'
                          ? <span className="text-amber-400">"{String(b.static_value ?? '')}"</span>
                          : <span className="text-cyan-400">{b.variable_path}</span>}
                        {b.required && <span className="text-red-400 ml-1">*</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold text-brand-emerald uppercase tracking-widest mb-1">Resolved Body (sample)</p>
                <JsonTreeViewer data={body_modal.body} default_expanded_depth={2} max_height={500} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Header: React.FC<{
  ott: QuickFlowResponse['ott'];
  on_refresh: () => void;
  on_export_png: () => void;
  loading: boolean;
}> = ({ ott, on_refresh, on_export_png, loading }) => (
  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
    <div className="flex flex-col gap-2">
      <Link
        to={`/dashboard/ott/${ott.id}/manage`}
        className="flex items-center gap-2 text-xs font-bold text-text-muted hover:text-text-main transition-colors w-fit"
      >
        <ArrowLeft size={14} /> Back to OTT
      </Link>
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-brand-emerald/10 text-brand-emerald">
          <Network size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-black text-text-main tracking-tight">Quick Flow</h1>
          <p className="text-xs text-text-muted">{ott.name} <span className="font-mono">· {ott.base_url}</span></p>
        </div>
      </div>
    </div>
    <div className="flex items-center gap-2 flex-wrap">
      {/* PNG export — renders the FULL graph (not just the visible
          viewport) so far-out nodes aren't cropped. JSON / JPG / SVG
          exports were removed at the user's request. */}
      <button
        onClick={on_export_png}
        className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-bg-card border border-border-subtle text-text-muted hover:text-text-main hover:border-brand-emerald/50 text-xs font-bold"
        title="Download full flow as PNG"
      >
        <Download size={14} />
        PNG
      </button>
      <button
        onClick={on_refresh}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-bg-card border border-border-subtle text-text-main text-sm font-bold hover:border-brand-emerald/50 disabled:opacity-50"
      >
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        Refresh
      </button>
    </div>
  </div>
);

// ── Side detail panels ──────────────────────────────────────────────────
const NodeDetail: React.FC<{
  node: QuickFlowNode;
  on_hover_action?: (child_api_id: string | null) => void;
}> = ({ node, on_hover_action }) => {
  if (node.type === 'ott_root') return <OttRootDetail node={node} />;
  if (node.type === 'capture_video') return <CaptureDetail node={node} />;
  if (node.type === 'library') return <LibraryDetail node={node} />;
  return <ApiNodeDetail node={node} on_hover_action={on_hover_action} />;
};

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-2xl bg-bg-card border border-border-subtle p-4 space-y-4 max-h-[720px] overflow-y-auto">
    {children}
  </div>
);

const OttRootDetail: React.FC<{ node: QuickFlowOttRootNode }> = ({ node }) => (
  <Panel>
    <div>
      <p className="text-[9px] font-bold text-brand-emerald uppercase tracking-widest mb-1">OTT Root</p>
      <h3 className="text-sm font-bold text-text-main">{node.ott.name}</h3>
      <p className="text-[11px] text-text-muted font-mono break-all">{node.ott.base_url}</p>
    </div>
    <div className="grid grid-cols-2 gap-2 text-center">
      <div className="p-2 rounded-xl bg-bg-main border border-border-subtle">
        <p className="text-2xl font-black text-text-main">{node.summary.total_apis}</p>
        <p className="text-[9px] uppercase font-bold text-text-muted">APIs</p>
      </div>
      <div className="p-2 rounded-xl bg-bg-main border border-border-subtle">
        <p className="text-2xl font-black text-brand-emerald">{node.summary.root_apis}</p>
        <p className="text-[9px] uppercase font-bold text-text-muted">Root</p>
      </div>
    </div>
  </Panel>
);

const CaptureDetail: React.FC<{ node: QuickFlowCaptureVideoNode }> = ({ node }) => (
  <Panel>
    <div>
      <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-1">Capture Video</p>
      <h3 className="text-sm font-bold text-text-main">Captured Videos</h3>
      <p className="text-3xl font-black text-text-main mt-1">{node.captured_videos}</p>
    </div>
    {Object.keys(node.types).length > 0 && (
      <div>
        <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">By Type</p>
        <div className="space-y-1">
          {Object.entries(node.types).map(([t, n]) => (
            <div key={t} className="flex items-center justify-between text-xs">
              <span className="font-mono uppercase text-text-main">{t}</span>
              <span className="text-text-muted">{n}</span>
            </div>
          ))}
        </div>
      </div>
    )}
    <div>
      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">Source APIs</p>
      <p className="text-xs text-text-muted">{node.source_api_ids.length} API{node.source_api_ids.length === 1 ? '' : 's'} producing captured assets.</p>
    </div>
  </Panel>
);

const LibraryDetail: React.FC<{ node: QuickFlowLibraryNode }> = ({ node }) => (
  <Panel>
    <div>
      <p className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-1">Local Library</p>
      <h3 className="text-sm font-bold text-text-main">Saved Items</h3>
      <p className="text-3xl font-black text-text-main mt-1">{node.counts.total}</p>
    </div>
    {/* "Working" bucket removed with the R2 migration — library rows
        exist only once the upload succeeded, so the in-flight state is
        gone. Only Done vs Failed remain. */}
    <div className="grid grid-cols-2 gap-2 text-center">
      <div className="p-2 rounded-xl bg-brand-emerald/10 border border-brand-emerald/30">
        <p className="text-lg font-black text-brand-emerald">{node.counts.completed}</p>
        <p className="text-[9px] uppercase font-bold text-text-muted">Done</p>
      </div>
      <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30">
        <p className="text-lg font-black text-red-400">{node.counts.failed}</p>
        <p className="text-[9px] uppercase font-bold text-text-muted">Failed</p>
      </div>
    </div>
    <div>
      <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">By Save Type</p>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between"><span>Videos</span><span className="text-text-muted">{node.counts.videos}</span></div>
        <div className="flex justify-between"><span>Images</span><span className="text-text-muted">{node.counts.images}</span></div>
        <div className="flex justify-between"><span>Thumbnails</span><span className="text-text-muted">{node.counts.thumbnails}</span></div>
        <div className="flex justify-between"><span>Playlists</span><span className="text-text-muted">{node.counts.playlists}</span></div>
      </div>
    </div>
  </Panel>
);

// ── Detail panel helpers ────────────────────────────────────────────────
//
// Shared small components so every section of the API panel has the same
// rhythm: coloured section icon → bold title → indented body. The label /
// value rows align on a fixed-width label column instead of an inline
// "label · value" sentence, which scans much faster.

const METHOD_TONE: Record<string, string> = {
  GET:    'bg-brand-emerald/15 text-brand-emerald border-brand-emerald/30',
  POST:   'bg-brand-blue/15 text-brand-blue border-brand-blue/30',
  PUT:    'bg-amber-400/15 text-amber-400 border-amber-400/30',
  PATCH:  'bg-purple-400/15 text-purple-400 border-purple-400/30',
  DELETE: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const DetailSection: React.FC<{
  icon: React.ReactNode;
  tone: string;
  title: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, tone, title, trailing, children }) => (
  <section>
    <div className="flex items-center gap-2 mb-2">
      <span className={`flex h-6 w-6 items-center justify-center rounded-md ${tone}`}>
        {icon}
      </span>
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-text-main">{title}</h4>
      {trailing && <span className="ml-auto">{trailing}</span>}
    </div>
    <div className="pl-8 space-y-1.5">
      {children}
    </div>
  </section>
);

const DataRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start gap-3 text-xs">
    <span className="w-20 shrink-0 text-text-muted">{label}</span>
    <span className="min-w-0 flex-1 text-text-main">{children}</span>
  </div>
);

const CodeChip: React.FC<{ value: string; copyable?: boolean; tone?: string }> = ({
  value,
  copyable = false,
  tone = 'text-text-main',
}) => {
  const handle_copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(value).then(
      () => toast.success('Copied'),
      () => toast.error('Clipboard not available'),
    );
  };
  return (
    <span className="inline-flex items-center gap-1.5 max-w-full rounded-md bg-bg-main/70 px-1.5 py-0.5 border border-border-subtle/60">
      <span className={`font-mono text-[11px] ${tone} break-all`}>{value}</span>
      {copyable && (
        <button
          type="button"
          onClick={handle_copy}
          className="shrink-0 text-text-muted hover:text-text-main transition-colors"
          aria-label="Copy"
        >
          <Copy size={11} />
        </button>
      )}
    </span>
  );
};

const ApiNodeDetail: React.FC<{
  node: QuickFlowApiNode;
  on_hover_action?: (child_api_id: string | null) => void;
}> = ({ node, on_hover_action }) => {
  const method = (node.api.method ?? 'GET').toUpperCase();
  const method_tone = METHOD_TONE[method] ?? METHOD_TONE.GET;
  const last_ok = node.last_log?.status === 'success';
  return (
    <Panel>
      {/* HEADER — API name + endpoint code block */}
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold text-text-muted uppercase tracking-widest">API</span>
          <span className="ml-auto text-[9px] font-bold text-text-muted/60 uppercase tracking-widest">Endpoint</span>
        </div>
        <h3 className="text-base font-bold text-text-main leading-tight">{node.api.name}</h3>
        <div className="flex items-stretch rounded-xl border border-border-subtle overflow-hidden">
          <span className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider border-r ${method_tone}`}>
            {method}
          </span>
          <span className="flex-1 min-w-0 px-2.5 py-1.5 bg-bg-main/50 font-mono text-[11px] text-text-main break-all leading-snug">
            {node.api.endpoint}
          </span>
        </div>
      </header>

      {/* LAST CALL — two prominent pills */}
      {node.last_log && (
        <DetailSection
          icon={<Zap size={13} />}
          tone={last_ok ? 'bg-brand-emerald/15 text-brand-emerald' : 'bg-red-500/15 text-red-400'}
          title="Last Call"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
              last_ok
                ? 'bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/30'
                : 'bg-red-500/10 text-red-400 border border-red-500/30'
            }`}>
              {last_ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              HTTP {node.last_log.http_status ?? '—'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold bg-bg-main/60 text-text-main border border-border-subtle">
              <Clock size={11} className="text-text-muted" />
              {node.last_log.duration_ms ?? 0} ms
            </span>
          </div>
        </DetailSection>
      )}

      {/* PAGINATION */}
      {node.api.pagination_enabled && (
        <DetailSection
          icon={<Layers size={13} />}
          tone="bg-purple-400/15 text-purple-400"
          title="Pagination"
        >
          <DataRow label="Type">
            <CodeChip value={String(node.api.pagination_type ?? '—')} />
          </DataRow>
          {node.api.pagination_config?.limit_value !== undefined && (
            <DataRow label="Limit">
              <CodeChip value={String(node.api.pagination_config.limit_value)} />
            </DataRow>
          )}
          {node.api.pagination_config?.data_list_path && (
            <DataRow label="Data path">
              <CodeChip value={String(node.api.pagination_config.data_list_path)} copyable />
            </DataRow>
          )}
        </DetailSection>
      )}

      {/* REQUEST BODY */}
      {node.api.body_mode === 'key_value' && node.api.request_body_config.length > 0 && (
        <DetailSection
          icon={<Database size={13} />}
          tone="bg-brand-blue/15 text-brand-blue"
          title="Request Body"
          trailing={
            <span className="text-[10px] font-bold text-text-muted">
              {node.api.request_body_config.length} field{node.api.request_body_config.length === 1 ? '' : 's'}
            </span>
          }
        >
          <div className="rounded-lg bg-bg-main/70 border border-border-subtle/60 divide-y divide-border-subtle/60">
            {node.api.request_body_config.map((b, i) => (
              <div key={i} className="flex items-baseline gap-2 px-2.5 py-1.5 text-[11px] font-mono">
                <span className="text-brand-emerald">{b.key}</span>
                {b.required && <span className="text-red-400" title="required">*</span>}
                <span className="text-text-muted">=</span>
                {b.value_type === 'static'
                  ? <span className="text-amber-400 break-all">"{String(b.static_value ?? '')}"</span>
                  : <span className="text-cyan-400 break-all">{b.variable_path}</span>}
              </div>
            ))}
          </div>
        </DetailSection>
      )}

      {/* CARDS */}
      {node.api.card_enabled && (
        <DetailSection
          icon={<LayoutGrid size={13} />}
          tone="bg-cyan-400/15 text-cyan-400"
          title="Cards"
          trailing={
            node.api.quick_run
              ? <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">Quick Run</span>
              : undefined
          }
        >
          <DataRow label="List path">
            <CodeChip value={node.api.list_path ?? '(root)'} copyable={!!node.api.list_path} />
          </DataRow>
          <DataRow label="Fields">
            <span className="font-mono text-[11px]">{node.selected_fields.length}</span>
          </DataRow>
          <DataRow label="Open type">
            <CodeChip value={String(node.api.open_type ?? '—')} tone="text-cyan-400" />
          </DataRow>
        </DetailSection>
      )}

      {/* CARD PREVIEW */}
      {node.card_preview && (
        <DetailSection
          icon={<Box size={13} />}
          tone="bg-cyan-400/15 text-cyan-400"
          title="Card Preview"
        >
          <div className="rounded-xl border border-border-subtle bg-bg-main/60 p-3 space-y-2">
            {node.card_preview.title && (
              <p className="text-sm font-bold text-text-main leading-snug">{node.card_preview.title}</p>
            )}
            {node.card_preview.subtitle && (
              <p className="text-[11px] text-text-muted">{node.card_preview.subtitle}</p>
            )}
            {node.card_preview.extra_fields.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-border-subtle/60">
                {node.card_preview.extra_fields.map((f, i) => (
                  <DataRow key={i} label={f.label}>
                    <CodeChip value={f.value} copyable />
                  </DataRow>
                ))}
              </div>
            )}
          </div>
        </DetailSection>
      )}

      {/* CARD ACTIONS */}
      {node.card_actions.length > 0 && (
        <DetailSection
          icon={<Network size={13} />}
          tone="bg-amber-400/15 text-amber-400"
          title="Card Actions"
          trailing={
            <span className="text-[10px] font-bold text-text-muted">
              {node.card_actions.length}
            </span>
          }
        >
          <p className="text-[10px] text-text-muted/70 leading-snug">
            Hover an action to highlight which child API it triggers on the canvas.
          </p>
          <div className="space-y-1">
            {node.card_actions.map(a => {
              const has_child = !!a.child_api_id;
              return (
                <div
                  key={a.id}
                  onMouseEnter={() => has_child && on_hover_action?.(a.child_api_id)}
                  onMouseLeave={() => has_child && on_hover_action?.(null)}
                  className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] border transition-colors ${
                    has_child
                      ? 'border-border-subtle/60 bg-bg-main/40 hover:border-brand-blue/40 hover:bg-brand-blue/5 cursor-pointer'
                      : 'border-border-subtle/40 bg-bg-main/20 opacity-70'
                  }`}
                >
                  <Box size={11} className={has_child ? 'text-brand-blue' : 'text-text-muted'} />
                  <span className="font-bold text-text-main truncate">{a.label}</span>
                  <span className="ml-auto flex items-center gap-1.5 text-text-muted">
                    <span className="font-mono text-[10px]">{a.action_type}</span>
                    {a.open_type && (
                      <span className="font-mono text-[10px] text-cyan-400">· {a.open_type}</span>
                    )}
                    {has_child && (
                      <ChevronRight size={11} className="text-text-muted group-hover:text-brand-blue transition-colors" />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </DetailSection>
      )}
    </Panel>
  );
};

const EdgeDetail: React.FC<{
  edge: QuickFlowEdge;
  all_nodes: QuickFlowNode[];
  on_open_body?: (title: string, body: any, mappings?: QuickFlowEdge['body_mappings']) => void;
}> = ({ edge, all_nodes, on_open_body }) => {
  const source = all_nodes.find(n => n.id === edge.source);
  const target = all_nodes.find(n => n.id === edge.target);
  const node_label = (n: QuickFlowNode | undefined): string => {
    if (!n) return '?';
    if (n.type === 'api_node') return n.api.name || 'API';
    if (n.type === 'ott_root') return n.ott.name;
    if (n.type === 'capture_video') return 'Captured Videos';
    return 'Library';
  };

  // Plain-language summary so users new to the project can read what the
  // arrow does without parsing every JSON key. Synthesised from the same
  // edge fields the panel already shows below.
  const explanation = (() => {
    if (edge.type === 'ott_to_root') {
      return `${node_label(target)} is one of the root APIs registered for ${node_label(source)} — it's called first when this OTT is opened.`;
    }
    if (edge.type === 'api_to_capture') {
      return `${node_label(source)} produces video URLs that get pulled into Captured Videos for review and saving.`;
    }
    if (edge.type === 'capture_to_library') {
      return `Captured videos save into the Local Library — files download/convert in the background and become offline-playable.`;
    }
    // api_connection — describe trigger + how params flow.
    const trigger = (() => {
      if (edge.trigger_type === 'quick_run') return `Quick Run automatically calls ${node_label(target)} as soon as a card is clicked`;
      if (edge.trigger_type === 'card_action') return `An action button on the card triggers ${node_label(target)}`;
      if (edge.trigger_type === 'card_click') return `Clicking a card opens ${node_label(target)}`;
      return `${node_label(target)} is called manually`;
    })();
    const param_entries = Object.entries(edge.param_mappings);
    const params_phrase = param_entries.length === 0
      ? ''
      : ` Variables ${param_entries.map(([k, v]) => `${k} ← ${v}`).join(', ')} are read from the parent's response and substituted into the URL.`;
    const body_phrase = edge.body_mappings.length === 0
      ? ''
      : ` The request body carries ${edge.body_mappings.length} field${edge.body_mappings.length === 1 ? '' : 's'} resolved from the same response.`;
    const open_phrase = edge.open_type
      ? ` The result opens in ${edge.open_type === 'page' ? 'a new page' : edge.open_type === 'drawer' ? 'a drawer' : edge.open_type === 'modal' ? 'a modal' : 'the current view'}.`
      : '';
    return `${trigger}.${params_phrase}${body_phrase}${open_phrase}`;
  })();

  return (
    <Panel>
      <div>
        <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mb-1">Connection</p>
        <p className="text-xs">
          <span className="font-bold text-text-main">{node_label(source)}</span>
          {' → '}
          <span className="font-bold text-text-main">{node_label(target)}</span>
        </p>
        <p className="text-[10px] text-text-muted">
          trigger: <span className="font-mono">{edge.trigger_type}</span>
          {edge.open_type && <> · open: <span className="font-mono">{edge.open_type}</span></>}
        </p>
      </div>

      <div className="rounded-xl bg-brand-emerald/5 border border-brand-emerald/20 p-3">
        <p className="text-[9px] font-bold text-brand-emerald uppercase tracking-widest mb-1">Explanation</p>
        <p className="text-[11px] text-text-main leading-relaxed">{explanation}</p>
      </div>
      {Object.keys(edge.param_mappings).length > 0 && (
        <div>
          <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest mb-1">Endpoint Variables</p>
          <div className="space-y-1">
            {Object.entries(edge.param_mappings).map(([k, v]) => (
              <div key={k} className="text-[11px] font-mono">
                <span className="text-emerald-400">{k}</span>
                <span className="text-text-muted"> ← </span>
                <span className="text-cyan-400">{v}</span>
                {edge.resolved_params_preview[k] !== undefined && (
                  <div className="ml-3 text-text-muted">
                    sample: <span className="text-amber-400">"{String(edge.resolved_params_preview[k])}"</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {edge.sample_resolved_endpoint && (
        <div>
          <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Resolved Endpoint Preview</p>
          <p className="text-[11px] font-mono break-all text-text-main">{edge.sample_resolved_endpoint}</p>
        </div>
      )}
      {edge.body_mappings.length > 0 && (
        <div>
          <p className="text-[9px] font-bold text-brand-blue uppercase tracking-widest mb-1">Request Body</p>
          <div className="space-y-1">
            {edge.body_mappings.map((b, i) => (
              <div key={i} className="text-[11px] font-mono">
                <span className="text-emerald-400">{b.key}</span>
                <span className="text-text-muted"> = </span>
                {b.value_type === 'static'
                  ? <span className="text-amber-400">"{String(b.static_value ?? '')}"</span>
                  : <span className="text-cyan-400">{b.variable_path}</span>}
              </div>
            ))}
          </div>
          {edge.sample_resolved_body && (
            <div className="mt-2 space-y-1">
              <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">Resolved Body Preview</p>
              <button
                type="button"
                onClick={() => on_open_body?.('Resolved Request Body', edge.sample_resolved_body, edge.body_mappings)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-black/40 hover:bg-black/60 border border-border-subtle text-left transition-colors"
              >
                <span className="text-[10px] font-mono text-text-muted truncate">
                  {Object.keys(edge.sample_resolved_body).length} key{Object.keys(edge.sample_resolved_body).length === 1 ? '' : 's'}
                </span>
                <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-brand-emerald">
                  <Maximize2 size={10} />
                  Inspect
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
};

export default QuickFlowPage;
