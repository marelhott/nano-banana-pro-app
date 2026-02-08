import React from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import type { ImageSlot } from './utils';
import { STYLE_REFERENCE_LIMIT } from './utils';

type ToastType = 'success' | 'error' | 'info';

export function StyleTransferMobileControls(props: {
  engine: 'fofr' | 'quick';
  setEngine: (v: 'fofr' | 'quick') => void;
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
  fofrOutputFormat: 'webp' | 'jpg' | 'png';
  setFofrOutputFormat: (v: 'webp' | 'jpg' | 'png') => void;
  fofrOutputQuality: number;
  setFofrOutputQuality: (v: number) => void;
  fofrSeed: string;
  setFofrSeed: (v: string) => void;
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
    onBack,
    onToast,
    reference,
    styles,
    strength,
    setStrength,
    merge,
    setMerge,
    mergePasses,
    variants,
    setVariants,
    fofrNumImages,
    setFofrNumImages,
    fofrModel,
    setFofrModel,
    fofrUseStructure,
    setFofrUseStructure,
    fofrWidth,
    setFofrWidth,
    fofrHeight,
    setFofrHeight,
    fofrStructureDepthStrength,
    setFofrStructureDepthStrength,
    fofrStructureDenoisingStrength,
    setFofrStructureDenoisingStrength,
    fofrOutputFormat,
    setFofrOutputFormat,
    fofrOutputQuality,
    setFofrOutputQuality,
    fofrSeed,
    setFofrSeed,
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

  const refInputId = React.useMemo(() => `st-ref-m-${Math.random().toString(36).slice(2)}`, []);
  const styleInputIds = React.useMemo(
    () => Array.from({ length: STYLE_REFERENCE_LIMIT }).map((_, idx) => `st-style-m-${idx}-${Math.random().toString(36).slice(2)}`),
    [],
  );
  const styleCount = styles.filter(Boolean).length;

  return (
    <div className="card-surface p-3 space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-white/75 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
        >
          <ArrowLeft className="w-4 h-4" />
          Zpět
        </button>
        <div className="w-1 h-4 bg-[#7ed957] rounded-full" />
      </div>

      <div className="card-surface p-3 space-y-2">
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Engine</div>
        <div className="flex p-1 rounded-lg control-surface">
          <button
            type="button"
            onClick={() => setEngine('fofr')}
            className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all flex-1 ${
              engine === 'fofr' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'
            }`}
          >
            FOFR
          </button>
          <button
            type="button"
            onClick={() => setEngine('quick')}
            className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all flex-1 ${
              engine === 'quick' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'
            }`}
          >
            Quick
          </button>
        </div>
      </div>

      <div className="space-y-3">
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

      <div className="space-y-3">
        <div className="space-y-1">
          <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Reference</div>
          <div
            className="relative aspect-[5/4] rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--bg-panel)]/50 overflow-hidden"
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearReference();
                  }}
                  className="absolute top-2 right-2 px-2 py-1 bg-black/60 text-white/80 rounded-md text-[9px] font-bold uppercase tracking-wider"
                >
                  Odebrat
                </button>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Plus className="w-4 h-4 text-gray-600" />
              </div>
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
            <div className="text-[9px] text-white/45">
              {styles.filter(Boolean).length}/{STYLE_REFERENCE_LIMIT}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: STYLE_REFERENCE_LIMIT }).map((_, idx) => {
              const style = styles[idx];
              return (
                <div
                  key={idx}
                  className="relative aspect-square rounded-lg border border-dashed border-[var(--border-color)] bg-[var(--bg-panel)]/50 overflow-hidden"
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
        {engine === 'quick' ? (
          <>
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Míra merge (struktura)</div>
                <div className="text-[9px] font-black text-white/70">{Math.round(merge)}%</div>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={merge}
                onChange={(e) => setMerge(Number(e.target.value))}
                disabled={styleCount === 0}
                className="w-full h-1 accent-[#7ed957] disabled:opacity-40"
              />
              <div className="text-[9px] text-white/35">Iterace: {mergePasses}x</div>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Model</div>
              <select
                value={fofrModel}
                onChange={(e) => setFofrModel(e.target.value as any)}
                className="w-full px-2 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px] text-[var(--text-primary)]"
              >
                <option value="fast">fast</option>
                <option value="high-quality">high-quality</option>
                <option value="realistic">realistic</option>
                <option value="cinematic">cinematic</option>
                <option value="animated">animated</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Použít strukturu</div>
              <button
                type="button"
                onClick={() => setFofrUseStructure(!fofrUseStructure)}
                className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${
                  fofrUseStructure ? 'bg-[#7ed957]/15 text-[#7ed957] border border-[#7ed957]/25' : 'bg-white/5 text-white/50 border border-white/10'
                }`}
              >
                {fofrUseStructure ? 'On' : 'Off'}
              </button>
            </div>

            {!fofrUseStructure && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={256}
                  max={2048}
                  step={64}
                  value={fofrWidth}
                  onChange={(e) => setFofrWidth(Number(e.target.value))}
                  className="w-full px-2 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px] text-[var(--text-primary)]"
                />
                <input
                  type="number"
                  min={256}
                  max={2048}
                  step={64}
                  value={fofrHeight}
                  onChange={(e) => setFofrHeight(Number(e.target.value))}
                  className="w-full px-2 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px] text-[var(--text-primary)]"
                />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Denoise</div>
                <div className="text-[9px] text-white/55">{fofrStructureDenoisingStrength.toFixed(2)}</div>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={fofrStructureDenoisingStrength}
                onChange={(e) => setFofrStructureDenoisingStrength(Number(e.target.value))}
                className="w-full h-1 accent-[#7ed957]"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Depth</div>
                <div className="text-[9px] text-white/55">{fofrStructureDepthStrength.toFixed(2)}</div>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={fofrStructureDepthStrength}
                onChange={(e) => setFofrStructureDepthStrength(Number(e.target.value))}
                className="w-full h-1 accent-[#7ed957]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={fofrOutputFormat}
                onChange={(e) => setFofrOutputFormat(e.target.value as any)}
                className="w-full px-2 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px] text-[var(--text-primary)]"
              >
                <option value="webp">webp</option>
                <option value="jpg">jpg</option>
                <option value="png">png</option>
              </select>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={fofrOutputQuality}
                onChange={(e) => setFofrOutputQuality(Number(e.target.value))}
                className="w-full px-2 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px] text-[var(--text-primary)]"
              />
            </div>

            <div className="space-y-1">
              <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">Seed</div>
              <input
                value={fofrSeed}
                onChange={(e) => setFofrSeed(e.target.value)}
                placeholder="random"
                className="w-full px-2 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-color)] text-[11px] text-[var(--text-primary)] placeholder-white/25"
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-[9px] font-bold uppercase tracking-wider text-white/55">High-res</div>
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
    </div>
  );
}
