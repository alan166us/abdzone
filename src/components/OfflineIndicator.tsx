import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff, AlertTriangle, RefreshCw } from 'lucide-react';

interface OfflineIndicatorProps {
  serverStatus?: 'connected' | 'stale' | 'disconnected';
  onRetry?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  serverStatus = 'connected',
  onRetry,
}) => {
  const isOnline = useOnlineStatus();
  const isDisconnected = serverStatus === 'disconnected';

  if (isOnline && !isDisconnected) return null;

  if (isDisconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-rose-600/95 backdrop-blur-md border-b border-rose-400 text-white px-3 sm:px-4 py-2 text-xs flex items-center justify-between shadow-2xl animate-in slide-in-from-top duration-200 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-white animate-pulse shrink-0" />
          <div className="truncate">
            <span className="font-bold">Server Connection Lost:</span>
            <span className="ml-1.5 text-rose-100 hidden sm:inline">
              Live market feed interrupted (&gt;45s). Running on cached / simulation anchors.
            </span>
            <span className="ml-1.5 text-rose-100 sm:hidden">
              Feed interrupted.
            </span>
          </div>
        </div>

        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1 rounded bg-white text-rose-700 font-bold hover:bg-rose-50 transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0 ml-3"
            title="Attempt immediate market data feed reconnection"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Now</span>
          </button>
        )}
      </div>
    );
  }

  // Network offline mode
  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-500/95 backdrop-blur-sm border border-amber-400 px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-xl animate-in slide-in-from-bottom duration-200">
      <WifiOff className="w-3.5 h-3.5 text-slate-950" />
      <span>Offline Mode — Cached charts and local data in use</span>
    </div>
  );
};
