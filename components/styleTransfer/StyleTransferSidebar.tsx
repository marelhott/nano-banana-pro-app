import React from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import type { ImageSlot } from './utils';
import { STYLE_REFERENCE_LIMIT } from './utils';

type ToastType = 'success' | 'error' | 'info';

export function StyleTransferSidebar(props: {
  onBack: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
  reference: ImageSlot | null;
  styles: Array<ImageSlot | null>;
  strength: number;
  setStrength: (v: number) => void;
  variants: 1 | 2 | 3;
  setVariants: (v: 1 | 2 | 3) => void;
  isGenerating: boolean;
  canGenerate: boolean;
  highRes: boolean;
  setHighRes: (v: boolean) => void;
  colorize: boolean;
  setColorize: (v: boolean) => void;
  onGenerate: () => void;
  onSetReferenceFromFile: (file: File) => Promise<void>;
  onSetStyleFromFile: (index: number, file: File) => Promise<void>;
  onClearReference: () => void;
  onClearStyle: (index: number) => void;
  onDropToReference: (e: React.DragEvent) => Promise<void>;
  onDropToStyle: (index: number, e: React.DragEvent) => Promise<void>;
}) {
  const {
    onBack,
    onToast,
    reference,
    styles,
    strength,
    setStrength,
    variants,
    setVariants,
    isGenerating,
    canGenerate,
    highRes,
    setHighRes,
    colorize,
    setColorize,
    onGenerate,
    onSetReferenceFromFile,
    onSetStyleFromFile,
    onClearReference,
    onClearStyle,
    onDropToReference,
    onDropToStyle,
  } = props;

  const refInputId = React.useMemo(() => `st-ref-${Math.random().toString(36).slice(2)}`, []);
  const styleInputIds = React.useMemo(
    () => Array.from({ length: STYLE_REFERENCE_LIMIT }).map((_, idx) => `st-style-${idx}-${Math.random().toString(36).slice(2)}`),
    [],
  );
  const styleCount = styles.filter(Boolean).length;

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

          <div className="card-surface p-4 space-y-3">
            <div className="space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Počet výstupů</div>
              <div className="flex p-1 rounded-lg control-surface">
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setVariants(n)}
                    className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all flex-1 ${
                      variants === n ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onGenerate}
              disabled={!canGenerate}
              className="w-full py-3 px-4 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-lg ambient-glow glow-green glow-weak bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[#0a0f0d] shadow-[#7ed957]/20 hover:shadow-[#7ed957]/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:grayscale disabled:shadow-none"
            >
              {isGenerating ? 'Generuji…' : 'Generovat'}
            </button>
          </div>
        </div>

        <div className="card-surface p-3 space-y-3">
          <div className="space-y-1">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Reference</div>
            <div
              className="relative aspect-[5/4] rounded-lg border border-dashed border-[var(--border-color)] hover:border-[var(--text-secondary)] bg-[var(--bg-panel)]/50 transition-all overflow-hidden"
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
                <img src={reference.dataUrl} alt="Reference" className="w-full h-full object-cover opacity-90" draggable={false} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-gray-600" />
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Stylové reference</div>
              <div className="text-[9px] text-white/45">{styleCount}/{STYLE_REFERENCE_LIMIT}</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: STYLE_REFERENCE_LIMIT }).map((_, idx) => {
                const style = styles[idx];
                return (
                  <div
                    key={idx}
                    className="relative aspect-square rounded-lg border border-dashed border-[var(--border-color)] hover:border-[var(--text-secondary)] bg-[var(--bg-panel)]/50 transition-all overflow-hidden"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        await onDropToStyle(idx, e);
                      } catch {
                        onToast({ message: 'Drop se nepodařil.', type: 'error' });
                      }
                    }}
                    onClick={() => document.getElementById(styleInputIds[idx])?.click()}
                  >
                    {style ? (
                      <img src={style.dataUrl} alt={`Styl ${idx + 1}`} className="w-full h-full object-cover opacity-90" draggable={false} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Plus className="w-4 h-4 text-gray-600" />
                      </div>
                    )}

                    {style && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearStyle(idx);
                        }}
                        className="absolute top-1 right-1 px-1.5 py-0.5 bg-black/60 hover:bg-black/75 text-white/80 rounded-md text-[8px] font-bold uppercase tracking-wider"
                      >
                        x
                      </button>
                    )}

                    <input
                      id={styleInputIds[idx]}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const inputEl = e.currentTarget;
                        const f = e.target.files?.[0];
                        if (!f) return;
                        await onSetStyleFromFile(idx, f);
                        inputEl.value = '';
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="text-[9px] text-white/35">Použij 1 až 3 stylové obrázky. Pro mix se udělá texturový patchwork.</div>
          </div>
        </div>

        <div className="card-surface p-4 space-y-3">
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
              disabled={styleCount === 0}
              className="w-full h-1 accent-[#7ed957] disabled:opacity-40"
            />
            {styleCount === 0 && <div className="text-[9px] text-white/35">Nahraj aspoň jeden stylový obrázek.</div>}
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">High-res (1024px)</div>
            <button
              type="button"
              onClick={() => setHighRes(!highRes)}
              className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${
                highRes ? 'bg-[#7ed957]/15 text-[#7ed957] border border-[#7ed957]/25' : 'bg-white/5 text-white/50 border border-white/10'
              }`}
            >
              {highRes ? 'On' : 'Off'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Zachovat barvy fotky</div>
            <button
              type="button"
              onClick={() => setColorize(!colorize)}
              className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${
                colorize ? 'bg-[#7ed957]/15 text-[#7ed957] border border-[#7ed957]/25' : 'bg-white/5 text-white/50 border border-white/10'
              }`}
            >
              {colorize ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <div className="mt-auto" />
      </div>
    </div>
  );
}
