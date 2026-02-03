import React from 'react';
import { Download, Sparkles } from 'lucide-react';
import type { OutputItem } from './utils';

export function StyleTransferOutputs(props: {
  outputs: OutputItem[];
  onDownload: (dataUrl: string, index: number) => void;
  onOpenLightbox: (dataUrl: string) => void;
}) {
  const { outputs, onDownload, onOpenLightbox } = props;

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
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md px-6 transition-all duration-300">
              <div className="w-full max-w-[200px] space-y-3">
                <div className="relative h-[2px] bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]"
                    style={{
                      width: '0%',
                      animation: 'growWidth 10s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                    }}
                  />
                  <style>{`
                    @keyframes growWidth {
                      0% { width: 0%; }
                      10% { width: 15%; }
                      40% { width: 50%; }
                      70% { width: 80%; }
                      100% { width: 95%; }
                    }
                  `}</style>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-[#7ed957] font-bold tracking-widest uppercase animate-pulse">Generuji...</span>
                </div>
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
