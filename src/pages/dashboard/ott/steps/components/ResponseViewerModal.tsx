import React, { useMemo, useState } from 'react';
import { ApiNode } from '../../../../../types';
import { X, AlertCircle, Info, ChevronRight, Search } from 'lucide-react';
import { extractFieldPaths } from '../../../../../utils/apiDataUtils';
import { JsonTreeViewer } from '../../../../../components/ui/JsonTreeViewer';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  api_node: ApiNode | null;
  response: any;
  onPickFields?: () => void;
}

const ResponseViewerModal: React.FC<Props> = ({ isOpen, onClose, api_node, response, onPickFields }) => {
  const [path_search, set_path_search] = useState('');

  const all_paths = useMemo(() => (response ? extractFieldPaths(response) : []), [response]);
  const filtered_paths = useMemo(() => {
    if (!path_search) return all_paths;
    return all_paths.filter(p => p.toLowerCase().includes(path_search.toLowerCase()));
  }, [all_paths, path_search]);

  if (!isOpen || !api_node) return null;

  const is_empty = !response || (typeof response === 'object' && Object.keys(response).length === 0);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-5xl h-[85vh] bg-bg-main border border-border-subtle rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Info size={28} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-text-main">{api_node.name} Response Explorer</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{api_node.method}</span>
                <span className="text-xs text-text-muted font-mono">{api_node.endpoint}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-text-muted transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {is_empty ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-12">
              <div className="w-20 h-20 rounded-3xl bg-red-500/10 text-red-500 flex items-center justify-center border-2 border-dashed border-red-500/20">
                <AlertCircle size={40} />
              </div>
              <div>
                <h4 className="text-lg font-bold text-text-main">No response saved</h4>
                <p className="text-sm text-text-muted max-w-sm mt-1">Call the API to capture a response.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-hidden flex flex-col p-4 border-r border-border-subtle">
                <JsonTreeViewer
                  data={response}
                  default_expanded_depth={1}
                  collapse_arrays_by_default
                  class_name="flex-1"
                />
              </div>

              <div className="w-80 bg-black/5 dark:bg-white/5 flex flex-col">
                <div className="p-6 border-b border-border-subtle">
                  <h4 className="text-xs font-bold uppercase text-text-muted tracking-widest mb-1">Detected paths</h4>
                  <p className="text-[10px] text-text-muted">{filtered_paths.length} of {all_paths.length}</p>
                  <div className="relative mt-3">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Search paths..."
                      className="w-full bg-black/10 dark:bg-white/10 border border-border-subtle rounded-lg pl-7 pr-2 py-1 text-xs text-text-main"
                      value={path_search}
                      onChange={(e) => set_path_search(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-1">
                  {filtered_paths.map(path => (
                    <div
                      key={path}
                      className="p-2 rounded-xl border border-transparent hover:border-border-subtle hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <span className="text-[11px] font-mono text-text-main break-all">{path}</span>
                    </div>
                  ))}
                  {filtered_paths.length === 0 && (
                    <p className="text-center text-xs text-text-muted py-12">
                      {path_search ? `No paths matching "${path_search}"` : 'No paths detected'}
                    </p>
                  )}
                </div>

                {onPickFields && (
                  <div className="p-6 bg-bg-main border-t border-border-subtle">
                    <button
                      onClick={onPickFields}
                      className="w-full btn-primary py-3 font-bold flex items-center justify-center gap-2"
                    >
                      Choose Fields
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResponseViewerModal;
