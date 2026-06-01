import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useOTT } from '../../../context/OTTContext';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Trash2,
  Eye,
  Settings as SettingsIcon,
  Plus,
  Calendar,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { motion } from 'motion/react';
import { ott_service } from '../../../services/ott_service';
import { useConfirm } from '../../../components/ui/ConfirmDialog';

const LOCAL_UPLOADS_NAME = 'local uploads';
const is_local_uploads_name = (name: string | null | undefined): boolean =>
  (name ?? '').trim().toLowerCase() === LOCAL_UPLOADS_NAME;

const AllOTTs: React.FC = () => {
  const { otts, loading, error, remove_ott, refresh_otts } = useOTT();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [busy_id, set_busy_id] = useState<string | null>(null);

  const visible_otts = otts.filter((o) => !is_local_uploads_name(o.name));

  const handle_delete = async (ott_id: string) => {
    const ok = await confirm({
      title: 'Delete OTT?',
      message: 'This permanently removes the OTT registration. This cannot be undone.',
      confirm_label: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await remove_ott(ott_id);
      toast.success('OTT deleted successfully');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete OTT');
    }
  };

  const handle_sync = async (ott_id: string) => {
    set_busy_id(ott_id);
    try {
      const res = await ott_service.sync_ott(ott_id, 'root_only');
      if (!res.success) throw new Error(res.message || 'Sync failed');
      toast.success(res.message || 'Sync completed');
    } catch (err: any) {
      toast.error(err?.message || 'Sync failed');
    } finally {
      set_busy_id(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-main">All Registered OTTs</h1>
          <p className="text-text-muted">Manage your connected OTT platforms and their API configurations.</p>
        </div>
        <button
          onClick={() => navigate('/dashboard/ott/register')}
          className="btn-primary flex items-center justify-center gap-2"
        >
          <Plus size={20} />
          Register New OTT
        </button>
      </div>

      {loading ? (
        <div className="glass-card flex flex-col items-center justify-center py-24 gap-4 text-center">
          <Loader2 size={36} className="animate-spin text-text-muted" />
          <p className="text-sm text-text-muted">Loading OTT platforms…</p>
        </div>
      ) : error ? (
        <div className="glass-card flex flex-col items-center justify-center py-24 gap-4 text-center">
          <AlertCircle size={48} className="text-red-500" />
          <h3 className="text-xl font-bold text-text-main">Failed to load OTTs</h3>
          <p className="text-sm text-text-muted max-w-md">{error}</p>
          <button onClick={refresh_otts} className="btn-primary px-8 py-3">Retry</button>
        </div>
      ) : visible_otts.length === 0 ? (
        <div className="glass-card flex flex-col items-center justify-center py-24 gap-6 text-center">
          <div className="w-24 h-24 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-text-muted border-2 border-dashed border-border-subtle">
            <Building2 size={48} />
          </div>
          <div className="max-w-md space-y-2">
            <h3 className="text-xl font-bold text-text-main">No OTTs registered yet</h3>
            <p className="text-sm text-text-muted">Click the button below to start the registration flow.</p>
          </div>
          <button
            onClick={() => navigate('/dashboard/ott/register')}
            className="btn-primary px-8 py-3"
          >
            Start Registration
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {visible_otts.map((ott, index) => (
            <motion.div
              key={ott.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="glass-card group overflow-hidden"
            >
              <div className="p-6 space-y-6">
                <div className="flex justify-between items-start">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-brand-emerald to-brand-blue shadow-lg shadow-brand-emerald/20">
                    <Building2 size={28} className="text-white" />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/dashboard/ott/${ott.id}/manage`)}
                      className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-text-main border border-border-subtle transition-all"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => handle_sync(ott.id)}
                      disabled={busy_id === ott.id}
                      className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-brand-blue border border-border-subtle transition-all disabled:opacity-50"
                      title="Sync root APIs"
                    >
                      {busy_id === ott.id ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
                    </button>
                    <button
                      onClick={() => navigate(`/dashboard/ott/${ott.id}/edit`)}
                      className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-brand-emerald border border-border-subtle transition-all"
                    >
                      <SettingsIcon size={18} />
                    </button>
                    <button
                      onClick={() => handle_delete(ott.id)}
                      className="p-2.5 rounded-xl bg-black/5 dark:bg-white/5 text-text-muted hover:text-red-500 border border-border-subtle transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-text-main group-hover:text-brand-emerald transition-colors">{ott.name}</h3>
                  <p className="text-sm text-text-muted line-clamp-2 min-h-[40px]">
                    {ott.description || 'No description provided.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-subtle flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Total APIs</span>
                    <span className="text-sm font-bold text-text-main">{ott.total_apis} Endpoints</span>
                  </div>
                  <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-border-subtle flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Card Sections</span>
                    <span className="text-sm font-bold text-text-main">{ott.total_selected_sections}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Calendar size={14} />
                  <span>
                    {ott.createdAt ? `Created ${new Date(ott.createdAt).toLocaleDateString()}` : 'Created date unknown'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => navigate(`/dashboard/ott/${ott.id}/manage`)}
                className="w-full py-4 border-t border-border-subtle hover:bg-black/5 dark:hover:bg-white/5 flex items-center justify-center gap-2 text-sm font-bold text-text-main transition-all group"
              >
                Manage OTT Platform
                <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AllOTTs;
