import React from 'react';
import { Download, Sparkles } from 'lucide-react';
import type { OutputItem } from './utils';

export function StyleTransferOutputs(props: {
  outputs: OutputItem[];
  onDownload: (dataUrl: string, index: number) => void;
  onOpenLightbox: (dataUrl: string) => void;
}) {
  const { outputs, onDownload, onOpenLightbox } = props;

  const startedAtRef = React.useRef<Map<string, number>>(new Map());
  const [, forceTick] = React.useState(0);
  React.useEffect(() => {
    const now = Date.now();
    for (const o of outputs) {
      if (o.status === 'loading' && !startedAtRef.current.has(o.id)) {
        startedAtRef.current.set(o.id, now);
      }
      if (o.status !== 'loading' && startedAtRef.current.has(o.id)) {
        startedAtRef.current.delete(o.id);
      }
    }
  }, [outputs]);

  React.useEffect(() => {
    const i = window.setInterval(() => forceTick((v) => v + 1), 1000);
    return () => window.clearInterval(i);
  }, []);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  if (outputs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 bg-[#0f1512]/50 rounded-lg flex items-center justify-center mb-4 border border-white/10">
          <Sparkles className="w-8 h-8 text-white/30" />
        </div>
        <div className="text-[12px] font-black uppercase tracking-wider text-white/60">Zatím žádné výstupy</div>
        <div className="text-[10px] text-white/35 mt-2">Nahraj Reference + Styl a klikni na Generovat.</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {outputs.map((o, idx) => (
        <div key={o.id} className="group relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-[var(--bg-panel)]/60">
          {o.status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <div className="w-full max-w-[420px] bg-[#0f1512] border border-[#7ed957]/30 rounded-lg shadow-2xl p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-[#7ed957] animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <div className="flex-1">
                    <div className="font-black text-sm text-[#e0e0e0]">Generuji obrázek</div>
                    <div className="text-[10px] text-gray-400 font-medium">0 / 1 dokončeno</div>
                  </div>
                  <div className="text-xl font-[900] text-[#7ed957]">0%</div>
                </div>

                <div className="mt-3 relative w-full h-2.5 bg-gray-800 rounded-full overflow-hidden" />

                {(() => {
                  const startedAt = startedAtRef.current.get(o.id) || Date.now();
                  const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
                  const estimate = 25;
                  const remaining = Math.max(0, estimate - elapsed);
                  return (
                    <div className="mt-3 flex items-center justify-between text-[9px] text-gray-500 uppercase tracking-widest font-black">
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>UPLYNULO: {formatTime(elapsed)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        <span>ZBÝVÁ: ~{formatTime(remaining)}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          {o.status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <div className="text-[10px] font-bold uppercase tracking-wider text-red-300">Chyba</div>
              <div className="text-[10px] text-white/40 mt-2">{o.error || 'Nepodařilo se vygenerovat obrázek.'}</div>
            </div>
          )}
          {o.status === 'success' && o.url && (
            <>
              <button
                type="button"
                onClick={() => onOpenLightbox(o.url || '')}
                className="absolute inset-0"
                title="Otevřít"
              />
              <img src={o.url} alt={`Output ${idx + 1}`} className="w-full h-full object-cover opacity-95 group-hover:opacity-100 transition-opacity" draggable={false} />
              <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/70">Varianta {idx + 1}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!o.url) return;
                      onDownload(o.url, idx);
                    }}
                    className="flex items-center gap-1.5 px-2 py-1 bg-white/10 hover:bg-white/15 text-white/80 rounded-md text-[9px] font-bold uppercase tracking-wider"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Stáhnout
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
