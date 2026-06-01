/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  X,
  Search,
  Type,
  Image as ImageIcon,
  Info,
  Tag,
  EyeOff,
  Hash,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import { ApiNode, DisplayType } from '../../../../../types';
import {
  findArrayPaths,
  extractFieldPaths,
  getValueByPath,
  detectDisplayType,
} from '../../../../../utils/apiDataUtils';

interface DraftField {
  path: string;
  label: string;
  display_type: DisplayType;
  sort_order: number;
  is_visible: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  api_node: ApiNode;
  response: any;
  onSave: (list_path: string, fields: DraftField[]) => void | Promise<void>;
  saving?: boolean;
}

const DISPLAY_OPTIONS: { type: DisplayType; label: string; icon: React.ReactNode }[] = [
  { type: 'title', label: 'Title', icon: <Type size={14} /> },
  { type: 'subtitle', label: 'Subtitle', icon: <Info size={14} /> },
  { type: 'description', label: 'Desc', icon: <Info size={14} /> },
  { type: 'image', label: 'Image', icon: <ImageIcon size={14} /> },
  { type: 'badge', label: 'Badge', icon: <Tag size={14} /> },
  { type: 'text', label: 'Text', icon: <Type size={14} /> },
  { type: 'hidden_id', label: 'ID', icon: <EyeOff size={14} /> },
];

const FieldSelectorModal: React.FC<Props> = ({ isOpen, onClose, api_node, response, onSave, saving = false }) => {
  const [search_term, setSearchTerm] = useState('');
  const [list_path, setListPath] = useState(api_node.list_path || '');
  const [fields, setFields] = useState<DraftField[]>(
    (api_node.selected_fields || []).map((f, idx) => ({
      path: f.path,
      label: f.label ?? f.path.split('.').pop() ?? f.path,
      display_type: f.display_type,
      sort_order: f.sort_order ?? idx,
      is_visible: f.is_visible ?? true,
    })),
  );

  useEffect(() => {
    if (isOpen) {
      setListPath(api_node.list_path || '');
      setFields(
        (api_node.selected_fields || []).map((f, idx) => ({
          path: f.path,
          label: f.label ?? f.path.split('.').pop() ?? f.path,
          display_type: f.display_type,
          sort_order: f.sort_order ?? idx,
          is_visible: f.is_visible ?? true,
        })),
      );
    }
  }, [isOpen, api_node]);

  const array_paths = useMemo(() => {
    if (!response) return [];
    const paths = findArrayPaths(response);
    return paths.length > 0 ? paths : [''];
  }, [response]);

  useEffect(() => {
    if (array_paths.length > 0 && !list_path) setListPath(array_paths[0]);
  }, [array_paths, list_path]);

  const sample_item = useMemo(() => {
    if (!response) return null;
    const arr = list_path ? getValueByPath(response, list_path) : response;
    if (Array.isArray(arr) && arr.length > 0) return arr[0];
    return null;
  }, [response, list_path]);

  const all_paths = useMemo(() => {
    if (!sample_item) return [];
    const inner = extractFieldPaths(sample_item);
    const prefix = list_path ? `${list_path}[0]` : '[0]';
    return inner.map(p => `${prefix}.${p}`);
  }, [sample_item, list_path]);

  const filtered_paths = useMemo(() => {
    if (!search_term) return all_paths;
    const term = search_term.toLowerCase();
    return all_paths.filter(p => p.toLowerCase().includes(term));
  }, [all_paths, search_term]);

  const toggle_field = (path: string) => {
    const exists = fields.find(f => f.path === path);
    if (exists) {
      setFields(prev => prev.filter(f => f.path !== path));
      return;
    }
    const last_segment = path.split('.').pop() || path;
    const sample_value = getValueByPath(response, path.replace(/\[0\]/g, '[0]'));
    const display_type = detectDisplayType(last_segment, sample_value);
    setFields(prev => [
      ...prev,
      {
        path,
        label: last_segment,
        display_type,
        sort_order: prev.length,
        is_visible: true,
      },
    ]);
  };

  const update_field = (path: string, patch: Partial<DraftField>) => {
    setFields(prev => prev.map(f => f.path === path ? { ...f, ...patch } : f));
  };

  const remove_field = (path: string) => {
    setFields(prev => prev.filter(f => f.path !== path));
  };

  const move_field = (path: string, direction: 'up' | 'down') => {
    setFields(prev => {
      const sorted = [...prev].sort((a, b) => a.sort_order - b.sort_order);
      const idx = sorted.findIndex(f => f.path === path);
      if (idx === -1) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= sorted.length) return prev;
      [sorted[idx], sorted[target]] = [sorted[target], sorted[idx]];
      return sorted.map((f, i) => ({ ...f, sort_order: i }));
    });
  };

  const handle_save = () => {
    const ordered = [...fields].sort((a, b) => a.sort_order - b.sort_order).map((f, i) => ({ ...f, sort_order: i }));
    onSave(list_path, ordered);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-6xl max-h-[90vh] bg-bg-card rounded-3xl border border-border-subtle shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-black/5 dark:bg-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-brand-emerald/10 text-brand-emerald">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-main">Choose Fields to Display</h2>
              <p className="text-xs text-text-muted">API: {api_node.name} ({api_node.endpoint})</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-1/2 border-r border-border-subtle flex flex-col bg-black/5 dark:bg-white/5">
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                  <Hash size={14} /> Main List Path
                </label>
                <select
                  value={list_path}
                  onChange={(e) => setListPath(e.target.value)}
                  className="w-full bg-black/10 dark:bg-white/10 border-none rounded-xl p-3 text-sm text-text-main outline-none focus:ring-2 focus:ring-brand-emerald/50"
                >
                  {array_paths.map(path => (
                    <option key={path || 'root'} value={path}>{path || 'Root (top-level array)'}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
                <input
                  type="text"
                  placeholder="Search keys or paths..."
                  value={search_term}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-black/10 dark:bg-white/10 border-none rounded-xl pl-12 pr-4 py-3 text-sm text-text-main outline-none focus:ring-2 focus:ring-brand-emerald/50"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {!sample_item && (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center space-y-4">
                  <AlertCircle size={48} className="text-brand-orange" />
                  <p className="text-sm text-text-muted">
                    No sample at path: <span className="font-mono text-text-main">{list_path || 'root'}</span>
                  </p>
                </div>
              )}
              {sample_item && filtered_paths.map(path => {
                const is_selected = fields.some(f => f.path === path);
                const value = getValueByPath(response, path.replace(/\[0\]/g, '[0]'));
                const is_array = Array.isArray(value);
                const is_object = value && typeof value === 'object' && !is_array;
                return (
                  <button
                    key={path}
                    onClick={() => toggle_field(path)}
                    className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all group ${
                      is_selected ? 'bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20' : 'hover:bg-black/5 dark:hover:bg-white/5 text-text-muted border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`p-1.5 rounded-lg ${is_selected ? 'bg-brand-emerald/20' : 'bg-black/10 dark:bg-white/10'}`}>
                        {is_selected ? <CheckCircle2 size={14} /> : <div className="w-[14px] h-[14px]" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-xs font-mono truncate ${is_selected ? 'text-brand-emerald font-bold' : 'text-text-main'}`}>{path}</span>
                        <span className="text-[10px] text-text-muted truncate opacity-80">
                          Value: {typeof value === 'string' ? value : JSON.stringify(value).slice(0, 40)}
                        </span>
                      </div>
                    </div>
                    {(is_array || is_object) && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 text-text-muted font-bold">
                        {is_array ? 'ARRAY' : 'OBJECT'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="w-1/2 flex flex-col bg-bg-main overflow-hidden">
            <div className="p-6 border-b border-border-subtle flex items-center justify-between">
              <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
                Selected Fields <span className="px-2 py-0.5 rounded-full bg-brand-emerald/10 text-brand-emerald text-[10px]">{fields.length}</span>
              </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {fields.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-muted">
                    <EyeOff size={32} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-text-main">No fields selected</p>
                    <p className="text-xs text-text-muted">Pick fields from the left to start building your card.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {[...fields].sort((a, b) => a.sort_order - b.sort_order).map((field, idx, arr) => (
                    <div
                      key={field.path}
                      className="p-4 rounded-2xl bg-bg-card border border-border-subtle shadow-sm space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => move_field(field.path, 'up')}
                              disabled={idx === 0}
                              className="p-0.5 hover:text-brand-emerald disabled:opacity-20"
                            >
                              <ChevronDown className="rotate-180" size={14} />
                            </button>
                            <button
                              onClick={() => move_field(field.path, 'down')}
                              disabled={idx === arr.length - 1}
                              className="p-0.5 hover:text-brand-emerald disabled:opacity-20"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <div className="flex flex-col">
                            <input
                              value={field.label}
                              onChange={(e) => update_field(field.path, { label: e.target.value })}
                              className="bg-transparent border-none p-0 text-sm font-bold text-text-main focus:ring-0 w-full"
                              placeholder="Field Label"
                            />
                            <span className="text-[10px] text-text-muted font-mono">{field.path}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => remove_field(field.path)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-text-muted hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-4 gap-2 pb-2">
                        {DISPLAY_OPTIONS.map(opt => (
                          <button
                            key={opt.type}
                            onClick={() => update_field(field.path, { display_type: opt.type })}
                            className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition-all ${
                              field.display_type === opt.type
                                ? 'bg-black/90 dark:bg-white text-bg-main border-transparent'
                                : 'bg-black/5 dark:bg-white/5 text-text-muted border-border-subtle hover:border-brand-emerald/50'
                            }`}
                          >
                            {opt.icon}
                            <span className="text-[9px] font-bold uppercase tracking-tight">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-border-subtle flex items-center justify-between bg-black/5 dark:bg-white/5">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl border border-border-subtle text-text-main font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-4">
            <p className="text-xs text-text-muted hidden md:block">
              {fields.length} fields selected from <span className="font-mono">{list_path || 'root'}</span>
            </p>
            <button
              onClick={handle_save}
              disabled={fields.length === 0 || saving}
              className="px-10 py-3 rounded-xl bg-brand-emerald text-black font-bold hover:shadow-lg hover:shadow-brand-emerald/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default FieldSelectorModal;
