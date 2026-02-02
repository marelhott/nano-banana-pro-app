import React from 'react';
import { ArrowLeft, Sparkles, Wand2 } from 'lucide-react';
import type { ImageSlot, StyleTransferAnalysis, StyleTransferEngine } from './utils';

type ToastType = 'success' | 'error' | 'info';

export function StyleTransferSidebar(props: {
  onBack: () => void;
  onOpenSettings: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
  reference: ImageSlot | null;
  style: ImageSlot | null;
  strength: number;
  setStrength: (v: number) => void;
  variants: 1 | 2 | 3;
  setVariants: (v: 1 | 2 | 3) => void;
  analysis: StyleTransferAnalysis | null;
  isAnalyzing: boolean;
  isGenerating: boolean;
  useAgenticVision: boolean;
  setUseAgenticVision: (v: boolean) => void;
  engine: StyleTransferEngine;
  setEngine: (v: StyleTransferEngine) => void;
  cfgScale: number;
  setCfgScale: (v: number) => void;
  denoise: number;
  setDenoise: (v: number) => void;
  steps: number;
  setSteps: (v: number) => void;
  styleOnly: boolean;
  setStyleOnly: (v: boolean) => void;
  canAnalyze: boolean;
  canGenerate: boolean;
  hasGeminiKey: boolean;
  onAnalyze: () => void;
  onGenerate: () => void;
  onSetReferenceFromFile: (file: File) => Promise<void>;
  onSetStyleFromFile: (file: File) => Promise<void>;
  onClearReference: () => void;
  onClearStyle: () => void;
  onDropToReference: (e: React.DragEvent) => Promise<void>;
  onDropToStyle: (e: React.DragEvent) => Promise<void>;
}) {
  const {
    onBack,
    onOpenSettings,
    onToast,
    reference,
    style,
    strength,
    setStrength,
    variants,
    setVariants,
    analysis,
    isAnalyzing,
    isGenerating,
    useAgenticVision,
    setUseAgenticVision,
    engine,
    setEngine,
    cfgScale,
    setCfgScale,
    denoise,
    setDenoise,
    steps,
    setSteps,
    styleOnly,
    setStyleOnly,
    canAnalyze,
    canGenerate,
    hasGeminiKey,
    onAnalyze,
    onGenerate,
    onSetReferenceFromFile,
    onSetStyleFromFile,
    onClearReference,
    onClearStyle,
    onDropToReference,
    onDropToStyle,
  } = props;

  const refInputId = React.useMemo(() => `st-ref-${Math.random().toString(36).slice(2)}`, []);
  const styleInputId = React.useMemo(() => `st-style-${Math.random().toString(36).slice(2)}`, []);

  return (
    <div className="hidden lg:flex w-[340px] shrink-0 border-r border-white/5 bg-[var(--bg-card)] flex-col h-full overflow-y-auto custom-scrollbar z-20">
      <div className="p-6 flex flex-col gap-6 min-h-full">
        <div className="space-y-3">
          <button
            type="button"
            onClick={onBack}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-white/5 hover:bg-white/10 text-white/75 hover:text-white rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
          >
            <ArrowLeft className="w-4 h-4" />
            Zpět
          </button>

          <div className="card-surface p-4 space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-[#7ed957] rounded-full"></div>
              <div className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Style Transfer</div>
            </div>
            <div className="text-[10px] text-white/45">
              Přenese malířský styl z obrázku B na obsah A.
            </div>
          </div>
        </div>

        <div className="card-surface p-4 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Vstupy</div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Reference</div>
              <div
                className="relative aspect-square rounded-lg border border-dashed border-[var(--border-color)] hover:border-[var(--text-secondary)] bg-[var(--bg-panel)]/50 transition-all overflow-hidden"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    await onDropToReference(e);
                  } catch {
                    onToast({ message: 'Drop se nepodařil.', type: 'error' });
                  }
                }}
                onClick={() => document.getElementById(refInputId)?.click()}
              >
                {reference ? (
                  <>
                    <img src={reference.dataUrl} alt="Reference" className="w-full h-full object-cover opacity-90" draggable={false} />
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
                    <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center mb-2">
                      <Wand2 className="w-5 h-5 text-[#7ed957]" />
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-white/70">Nahrát</div>
                    <div className="text-[9px] text-white/35">Klik / Drop</div>
                  </div>
                )}

                {reference && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearReference();
                    }}
                    className="absolute top-2 right-2 px-2 py-1 bg-black/60 hover:bg-black/75 text-white/80 rounded-md text-[9px] font-bold uppercase tracking-wider"
                  >
                    Odebrat
                  </button>
                )}

                <input
                  id={refInputId}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const inputEl = e.currentTarget;
                    const f = e.target.files?.[0];
                    if (!f) return;
                    await onSetReferenceFromFile(f);
                    inputEl.value = '';
                  }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Styl</div>
              <div
                className="relative aspect-square rounded-lg border border-dashed border-[var(--border-color)] hover:border-[var(--text-secondary)] bg-[var(--bg-panel)]/50 transition-all overflow-hidden"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    await onDropToStyle(e);
                  } catch {
                    onToast({ message: 'Drop se nepodařil.', type: 'error' });
                  }
                }}
                onClick={() => document.getElementById(styleInputId)?.click()}
              >
                {style ? (
                  <img src={style.dataUrl} alt="Styl" className="w-full h-full object-cover opacity-90" draggable={false} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
                    <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center mb-2">
                      <Sparkles className="w-5 h-5 text-[#7ed957]" />
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-wider text-white/70">Nahrát</div>
                    <div className="text-[9px] text-white/35">Klik / Drop</div>
                  </div>
                )}

                {style && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearStyle();
                    }}
                    className="absolute top-2 right-2 px-2 py-1 bg-black/60 hover:bg-black/75 text-white/80 rounded-md text-[9px] font-bold uppercase tracking-wider"
                  >
                    Odebrat
                  </button>
                )}

                <input
                  id={styleInputId}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const inputEl = e.currentTarget;
                    const f = e.target.files?.[0];
                    if (!f) return;
                    await onSetStyleFromFile(f);
                    inputEl.value = '';
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card-surface p-4 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Nastavení</div>

          <div className="space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Engine</div>
            <div className="flex p-1 rounded-lg control-surface">
              {([
                { id: 'replicate_pro_sdxl', label: 'PRO' },
                { id: 'replicate_flux_kontext_pro', label: 'FLUX' },
                { id: 'gemini', label: 'FLASH' },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEngine(opt.id)}
                  className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all flex-1 ${engine === opt.id
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Síla stylu</div>
              <div className="text-[9px] font-black text-white/70">{Math.round(strength)}%</div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={strength}
              onChange={(e) => setStrength(Number(e.target.value))}
              disabled={!style}
              className="w-full accent-[#7ed957] disabled:opacity-40"
            />
            {!style && <div className="text-[9px] text-white/35">Nahraj stylový obrázek pro aktivaci.</div>}
          </div>

          {engine === 'replicate_pro_sdxl' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">CFG Scale</div>
                  <div className="text-[9px] font-black text-white/70">{cfgScale.toFixed(1)}</div>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={20}
                  step={0.1}
                  value={cfgScale}
                  onChange={(e) => setCfgScale(Number(e.target.value))}
                  className="w-full accent-[#7ed957]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Denoise</div>
                  <div className="text-[9px] font-black text-white/70">{denoise.toFixed(2)}</div>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.99}
                  step={0.01}
                  value={denoise}
                  onChange={(e) => setDenoise(Number(e.target.value))}
                  className="w-full accent-[#7ed957]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Steps</div>
                  <div className="text-[9px] font-black text-white/70">{Math.round(steps)}</div>
                </div>
                <input
                  type="range"
                  min={10}
                  max={80}
                  step={1}
                  value={steps}
                  onChange={(e) => setSteps(Number(e.target.value))}
                  className="w-full accent-[#7ed957]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Style Only</div>
                  <button
                    type="button"
                    onClick={() => setStyleOnly(!styleOnly)}
                    className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${styleOnly
                      ? 'bg-[#7ed957]/15 text-[#7ed957] border border-[#7ed957]/25'
                      : 'bg-white/5 text-white/50 border border-white/10'
                      }`}
                  >
                    {styleOnly ? 'On' : 'Off'}
                  </button>
                </div>
                <div className="text-[9px] text-white/35 leading-relaxed">
                  Zapnuto = bere jen styl (barvy/štětec). Vypnuto = může kopírovat i layout ze stylové předlohy.
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Počet výstupů</div>
            <div className="flex p-1 rounded-lg control-surface">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setVariants(n)}
                  className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all flex-1 ${variants === n
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                    }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {engine === 'gemini' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Agentic Vision</div>
              <button
                type="button"
                onClick={() => setUseAgenticVision(!useAgenticVision)}
                className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${useAgenticVision
                  ? 'bg-[#7ed957]/15 text-[#7ed957] border border-[#7ed957]/25'
                  : 'bg-white/5 text-white/50 border border-white/10'
                  }`}
              >
                {useAgenticVision ? 'On' : 'Off'}
              </button>
            </div>
            <div className="text-[9px] text-white/35 leading-relaxed">
              Zlepší analýzu detailů (code execution) a přidá stylové výřezy jako další reference.
            </div>
          </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={onAnalyze}
              disabled={!canAnalyze}
              className="w-full py-2 px-3 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all bg-white/5 hover:bg-white/10 text-white/80 hover:text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale"
            >
              {isAnalyzing ? 'Analyzuji…' : 'Analyzovat vstupy'}
            </button>

            {analysis && (
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Doporučená síla</div>
                  <div className="text-[9px] font-black text-[#7ed957]">{Math.round(analysis.recommendedStrength)}%</div>
                </div>
                <div className="text-[9px] text-white/60 leading-relaxed">{analysis.styleDescription}</div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            className="w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none"
          >
            {isGenerating ? 'Generuji…' : 'Generovat'}
          </button>

          {!hasGeminiKey && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full py-2 px-3 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all bg-white/5 hover:bg-white/10 text-white/70"
            >
              {engine === 'gemini' ? 'Nastavit Gemini klíč' : 'Nastavit Replicate token'}
            </button>
          )}
        </div>

        <div className="mt-auto" />
      </div>
    </div>
  );
}
