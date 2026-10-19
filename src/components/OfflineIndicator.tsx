import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-500/90 backdrop-blur-sm border border-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-xl animate-in slide-in-from-bottom duration-200">
      <WifiOff className="w-3.5 h-3.5 text-slate-950" />
      <span>Offline Mode — Cached charts and local data in use</span>
    </div>
  );
};
