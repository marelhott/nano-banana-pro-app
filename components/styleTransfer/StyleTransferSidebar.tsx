import React from 'react';
import { Plus } from 'lucide-react';
import type { ImageSlot } from './utils';
import { STYLE_REFERENCE_LIMIT } from './utils';
import type { LocalStyleMethod } from '../StyleTransferScreen';

type ToastType = 'success' | 'error' | 'info';

export function StyleTransferSidebar(props: {
  engine: 'fofr' | 'quick';
  setEngine: (v: 'fofr' | 'quick') => void;
  localMethod: LocalStyleMethod;
  setLocalMethod: (v: LocalStyleMethod) => void;
  onBack: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
  reference: ImageSlot | null;
  styles: Array<ImageSlot | null>;
  strength: number;
  setStrength: (v: number) => void;
  merge: number;
  setMerge: (v: number) => void;
  mergePasses: number;
  variants: 1 | 2 | 3;
  setVariants: (v: 1 | 2 | 3) => void;
  // FOFR controls
  fofrNumImages: number;
  setFofrNumImages: (v: number) => void;
  fofrModel: 'fast' | 'high-quality' | 'realistic' | 'cinematic' | 'animated';
  setFofrModel: (v: 'fast' | 'high-quality' | 'realistic' | 'cinematic' | 'animated') => void;
  fofrUseStructure: boolean;
  setFofrUseStructure: (v: boolean) => void;
  fofrWidth: number;
  setFofrWidth: (v: number) => void;
  fofrHeight: number;
  setFofrHeight: (v: number) => void;
  fofrStructureDepthStrength: number;
  setFofrStructureDepthStrength: (v: number) => void;
  fofrStructureDenoisingStrength: number;
  setFofrStructureDenoisingStrength: (v: number) => void;
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
    engine,
    setEngine,
    localMethod,
    setLocalMethod,
    onToast,
    reference,
    styles,
    variants,
    setVariants,
    fofrNumImages,
    setFofrNumImages,
    isGenerating,
    canGenerate,
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
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]" />
          <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Style Transfer</h2>
        </div>

        <div className="space-y-3">
          <div className="card-surface p-4 space-y-3">
            <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Engine</div>
            <div className="flex p-1 rounded-lg control-surface">
              <button
                type="button"
                onClick={() => setEngine('fofr')}
                className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all flex-1 ${
                  engine === 'fofr' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'
                }`}
              >
                FOFR (cloud)
              </button>
              <button
                type="button"
                onClick={() => setEngine('quick')}
                className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all flex-1 ${
                  engine === 'quick' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'
                }`}
              >
                Neural (local)
              </button>
            </div>
            {engine === 'quick' && (
              <div className="space-y-1">
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Neural metoda</div>
                <div className="flex p-1 rounded-lg control-surface">
                  {(['gatys', 'adain', 'wct'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setLocalMethod(m)}
                      className={`px-2 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all flex-1 ${
                        localMethod === m ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card-surface p-4 space-y-3">
            <div className="space-y-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Počet výstupů</div>
              {engine === 'fofr' ? (
                <div className="space-y-2">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={Math.max(1, Math.min(10, Math.round(fofrNumImages)))}
                    onChange={(e) => setFofrNumImages(Number(e.target.value))}
                    className="w-full h-1 accent-[#7ed957]"
                  />
                  <div className="text-[9px] text-white/45">{Math.max(1, Math.min(10, Math.round(fofrNumImages)))}x</div>
                </div>
              ) : (
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
              )}
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

        <div className="mt-auto" />
      </div>
    </div>
  );
}
