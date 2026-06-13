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
    <div className="hidden lg:flex w-[340px] shrink-0 flex-col h-full overflow-y-auto custom-scrollbar cairn-panel-left z-20"
      style={{backdropFilter:'blur(32px) saturate(200%)', background:'linear-gradient(160deg,rgba(32,44,24,0.94) 0%,rgba(20,28,15,0.96) 100%)', boxShadow:'4px 0 48px rgba(0,0,0,0.50), inset 0 0 120px rgba(125,154,100,0.08)'}}>
      <div className="p-6 flex flex-col gap-6 min-h-full">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 bg-[#a8bf8f] rounded-full shadow-[0_0_10px_rgba(168,191,143,0.5)]" />
          <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Style Transfer</h2>
        </div>

        <div className="space-y-3">
          <div className="space-y-3">
            <div className="mn-section-label">Engine</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEngine('fofr')}
                className={`mn-option-button ${engine === 'fofr' ? 'mn-option-button-active' : ''}`}
              >
                FOFR (cloud)
              </button>
              <button
                type="button"
                onClick={() => setEngine('quick')}
                className={`mn-option-button ${engine === 'quick' ? 'mn-option-button-active' : ''}`}
              >
                Neural (local)
              </button>
            </div>
            {engine === 'quick' && (
              <div className="space-y-1">
                <div className="mn-section-label">Neural metoda</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['gatys', 'adain', 'wct'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setLocalMethod(m)}
                      className={`mn-option-button ${localMethod === m ? 'mn-option-button-active' : ''}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Počet výstupů</div>
              {engine === 'fofr' ? (
                <div className="space-y-2">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={Math.max(1, Math.min(10, Math.round(fofrNumImages)))}
                    onChange={(e) => setFofrNumImages(Number(e.target.value))}
                    className="range-green w-full"
                  />
                  <div className="text-[9px] text-white/45">{Math.max(1, Math.min(10, Math.round(fofrNumImages)))}x</div>
                </div>
              ) : (
                <div className="mn-count-selector">
                  {([1, 2, 3] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setVariants(n)}
                      className={`mn-count-option ${variants === n ? 'mn-count-option-active' : ''}`}
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
              className="mn-action-primary ambient-glow glow-green glow-weak"
            >
              {isGenerating ? 'Generuji…' : 'Generovat'}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="mn-section-label">Reference</div>
            <div
              className="mn-upload-zone mn-upload-zone-tall"
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
                <div className="mn-upload-placeholder">
                  <Plus className="w-4 h-4" />
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
              <div className="mn-section-label">Stylové reference</div>
              <div className="text-[9px] text-[var(--text-secondary)]">{styleCount}/{STYLE_REFERENCE_LIMIT}</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: STYLE_REFERENCE_LIMIT }).map((_, idx) => {
                const style = styles[idx];
                return (
                  <div
                    key={idx}
                    className={style ? 'mn-upload-thumb' : 'mn-upload-tile'}
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
                      <Plus className="w-4 h-4" />
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
