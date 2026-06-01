import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { OttPlatformSummary } from '../types';
import { ott_service, OTT_LIST_UPDATED_EVENT, notify_ott_list_updated } from '../services/ott_service';

interface OTTContextType {
  otts: OttPlatformSummary[];
  loading: boolean;
  error: string | null;
  refresh_otts: () => Promise<void>;
  remove_ott: (ott_id: string) => Promise<void>;
}

const OTTContext = createContext<OTTContextType | undefined>(undefined);

export const OTTProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [otts, set_otts] = useState<OttPlatformSummary[]>([]);
  const [loading, set_loading] = useState<boolean>(true);
  const [error, set_error] = useState<string | null>(null);

  const refresh_otts = useCallback(async () => {
    set_loading(true);
    set_error(null);
    try {
      const res = await ott_service.get_all_otts();
      if (!res.success) throw new Error(res.message || 'Failed to load OTTs');
      set_otts(res.data || []);
    } catch (err: any) {
      set_error(err?.message || 'Failed to load OTTs');
      set_otts([]);
    } finally {
      set_loading(false);
    }
  }, []);

  useEffect(() => {
    refresh_otts();
  }, [refresh_otts]);

  useEffect(() => {
    const handler = () => refresh_otts();
    window.addEventListener(OTT_LIST_UPDATED_EVENT, handler);
    return () => window.removeEventListener(OTT_LIST_UPDATED_EVENT, handler);
  }, [refresh_otts]);

  const remove_ott = useCallback(async (ott_id: string) => {
    const res = await ott_service.delete_ott(ott_id);
    if (!res.success) throw new Error(res.message || 'Delete failed');
    set_otts(prev => prev.filter(o => o.id !== ott_id));
    notify_ott_list_updated();
  }, []);

  return (
    <OTTContext.Provider value={{ otts, loading, error, refresh_otts, remove_ott }}>
      {children}
    </OTTContext.Provider>
  );
};

export const useOTT = () => {
  const context = useContext(OTTContext);
  if (!context) throw new Error('useOTT must be used within an OTTProvider');
  return context;
};
