import React from 'react';

type ToastType = 'success' | 'error' | 'info';

export function LoraSdGeneratorScreen(props: {
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
}) {
  const { onOpenSettings, onToast } = props;
  const workflowSteps = [
    'Nahraj vstupní fotku',
    'Vyber SD model nebo LoRA',
    'Nastav CFG, denoise, steps',
    'Vygeneruj 1-3 varianty',
  ];
  const uploadFlow = [
    'Vyber cloud úložiště modelů (bez limitu 6.8 GB na soubor).',
    'Nahraj SD/LoRA jednou a ulož cestu do katalogu modelů.',
    'Při generaci jen vybereš model a appka pošle job na GPU endpoint.',
  ];

  return (
    <div className="flex-1 relative flex flex-col min-w-0 canvas-surface h-full overflow-y-auto custom-scrollbar">
      <div className="p-6 lg:p-10 pb-24 w-full">
        <div className="space-y-8 w-full max-w-6xl mx-auto">
          <header className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
              <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">LoRA / SD Generátor</h2>
            </div>
            <p className="text-sm text-white/70">
              Sekce je připravená pro tvé vlastní SD checkpointy a LoRA. Další krok je napojení na cloud GPU inference endpoint.
            </p>
          </header>

          <div className="card-surface p-6 min-h-[220px] flex flex-col justify-center">
            <h3 className="text-xs uppercase tracking-widest text-white/75 font-bold text-center mb-4">Průběh práce</h3>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {workflowSteps.map((step, idx) => (
                <div
                  key={step}
                  className="px-3 py-2 rounded-lg border border-zinc-700/80 bg-zinc-800/35 text-xs text-zinc-200 min-w-[160px] text-center"
                >
                  <span className="text-zinc-400 mr-1">{idx + 1}.</span>
                  {step}
                </div>
              ))}
            </div>
          </div>

          <div className="card-surface p-5 space-y-4">
            <h3 className="text-xs uppercase tracking-widest text-white/80 font-bold">Nahrávání modelů (asistence přes appku)</h3>
            <div className="space-y-2">
              {uploadFlow.map((line, idx) => (
                <div key={line} className="text-xs text-white/65">
                  {idx + 1}. {line}
                </div>
              ))}
            </div>
            <p className="text-xs text-white/50">
              Pro jeden soubor 6.8 GB je vhodné objektové úložiště (S3/R2/B2) + GPU endpoint, bez lokálního GPU.
            </p>
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
            <span className="text-xs text-white/45">UI je připravené, backend napojím na tvé modely v dalším kroku.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
