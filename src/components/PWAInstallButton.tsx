import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Monitor, CheckCircle2, X, Smartphone } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'nav' | 'menu' | 'banner';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'nav',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  // If already running inside standalone desktop / mobile window
  if (isInstalled && variant === 'nav') {
    return (
      <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        <span>Standalone App Active</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (outcome) {
        setInstallSuccess(true);
        setTimeout(() => setInstallSuccess(false), 4000);
      }
    } else {
      setShowGuide(true);
    }
  };

  if (variant === 'menu') {
    return (
      <>
        <button
          onClick={handleInstallClick}
          className={`w-full flex items-center justify-between p-2 rounded-lg bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-sky-500/50 text-left transition-all group cursor-pointer ${className}`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-sky-950/80 border border-sky-800/80 flex items-center justify-center shrink-0 group-hover:border-sky-500">
              <Download className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white group-hover:text-sky-300 flex items-center gap-1.5">
                <span>Install Standalone App</span>
                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-sky-500/20 text-sky-300">PWA</span>
              </div>
              <div className="text-[10px] text-slate-400">Run outside browser in dedicated window with taskbar icon</div>
            </div>
          </div>
          <span className="text-[10px] font-mono text-sky-400 group-hover:translate-x-0.5 transition-transform">
            Install &rarr;
          </span>
        </button>

        {showGuide && renderGuideModal()}
      </>
    );
  }

  // TopNav variant
  return (
    <>
      <button
        onClick={handleInstallClick}
        className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg border transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-sm ${
          installSuccess
            ? 'bg-emerald-900/50 text-emerald-300 border-emerald-500'
            : isInstallable
            ? 'bg-sky-600 hover:bg-sky-500 text-white border-sky-500 shadow-sky-950/60'
            : 'text-slate-300 hover:text-white bg-slate-900/90 hover:bg-slate-800 border-slate-800 hover:border-slate-700'
        } ${className}`}
        title="Install StrataZone as an independent desktop or mobile application (PWA)"
      >
        {installSuccess ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="font-semibold text-emerald-300">Installed!</span>
          </>
        ) : (
          <>
            <Monitor className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="font-semibold hidden md:inline">Install Desktop App</span>
            <span className="font-semibold md:hidden">Install</span>
            {isInstallable && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </>
        )}
      </button>

      {showGuide && renderGuideModal()}
    </>
  );

  function renderGuideModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
        <div className="w-full max-w-md rounded-2xl bg-[#0D131F] border border-slate-800 shadow-2xl p-5 text-slate-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center">
                <Monitor className="w-4.5 h-4.5 text-sky-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white font-sans">Install StrataZone App</h3>
                <p className="text-[11px] text-slate-400">Run independently outside the browser</p>
              </div>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3.5 text-xs">
            {isIOS ? (
              <div className="space-y-2.5 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 text-sky-400 font-semibold">
                  <Smartphone className="w-4 h-4" />
                  <span>iPhone & iPad Safari Setup</span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-300">
                  <li>Tap the <strong className="text-white">Share</strong> button in the Safari navigation bar.</li>
                  <li>Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.</li>
                  <li>Tap <strong className="text-white">Add</strong> in the top-right corner.</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2.5 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 text-sky-400 font-semibold">
                  <Monitor className="w-4 h-4" />
                  <span>Desktop Chrome / Edge / Brave Setup</span>
                </div>
                <div className="space-y-2 text-slate-300">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-sky-400 font-bold shrink-0">1.</span>
                    <span>Look for the <strong>Install StrataZone</strong> icon (<Download className="w-3 h-3 inline text-sky-400 -mt-0.5" />) in your browser's address bar.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-sky-400 font-bold shrink-0">2.</span>
                    <span>Or click the browser menu (<strong>⋮</strong> or <strong>⋯</strong>) &rarr; <strong>Cast, save, and share</strong> &rarr; <strong>Install page as app...</strong></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-sky-400 font-bold shrink-0">3.</span>
                    <span>Click <strong>Install</strong> to launch StrataZone in a dedicated, high-performance borderless window with its own taskbar/dock icon!</span>
                  </div>
                </div>
              </div>
            )}

            <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 space-y-1">
              <div className="font-semibold text-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Benefits of Running as Standalone App</span>
              </div>
              <ul className="text-[11px] text-slate-300 list-disc list-inside space-y-0.5 pl-1">
                <li>Zero browser URL bar or tab distraction; maximum screen real estate for charts.</li>
                <li>Direct pinning to your Windows Taskbar, macOS Dock, or Linux Panel.</li>
                <li>Instant window switching with Alt+Tab / Cmd+Tab while trading.</li>
                <li>Hardware-accelerated 60 FPS HTML5 canvas charting.</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-mono">Progressive Web App · Standalone</span>
            <button
              onClick={() => setShowGuide(false)}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }
};
