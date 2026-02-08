import React from 'react';

type ToastType = 'success' | 'error' | 'info';

export function LoraSdGeneratorScreen(props: {
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { onOpenSettings, onToast } = props;

  return (
    <div className="flex-1 relative flex flex-col min-w-0 canvas-surface h-full overflow-y-auto custom-scrollbar">
      <div className="p-6 lg:p-10 pb-24 w-full">
        <div className="space-y-6 w-full max-w-5xl">
          <header className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
              <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">LoRA / SD Generátor</h2>
            </div>
            <p className="text-sm text-white/70">
              Sekce je připravená pro tvé vlastní SD checkpointy a LoRA. Další krok je napojení na cloud GPU inference endpoint.
            </p>
          </header>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card-surface p-5 space-y-3">
              <h3 className="text-xs uppercase tracking-widest text-white/80 font-bold">Cílový workflow</h3>
              <ul className="text-xs text-white/60 space-y-2">
                <li>1. Nahrát vstupní fotku.</li>
                <li>2. Vybrat SD model nebo LoRA preset.</li>
                <li>3. Nastavit CFG, denoise, steps, strength.</li>
                <li>4. Vygenerovat 1-3 varianty.</li>
              </ul>
            </div>

            <div className="card-surface p-5 space-y-3">
              <h3 className="text-xs uppercase tracking-widest text-white/80 font-bold">Co doplníme</h3>
              <ul className="text-xs text-white/60 space-y-2">
                <li>1. Správa profilů modelů/LoRA v appce.</li>
                <li>2. Queue + status jobů pro cloud GPU.</li>
                <li>3. Ukládání výstupů do galerie s metadaty.</li>
                <li>4. Přímé ladění parametrů bez Comfy UI.</li>
              </ul>
            </div>
          </div>

          <div className="card-surface p-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                onToast({ message: 'Nastav API klíče, pak napojíme LoRA/SD backend.', type: 'info' });
              }}
              className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] text-xs font-bold uppercase tracking-wider"
            >
              Otevřít Settings
            </button>
            <span className="text-xs text-white/45">UI je připravené, inference backend napojíme v dalším kroku.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

