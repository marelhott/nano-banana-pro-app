import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, X, ChevronLeft, ChevronRight, Pencil, ImagePlus } from 'lucide-react';
import type { GeneratedImage } from '../types';

interface ImageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  image: GeneratedImage | null;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  onUseImage?: (image: GeneratedImage) => void;
  onRegenerate?: (image: GeneratedImage, newPrompt: string) => void | Promise<void>;
  onUndo?: (image: GeneratedImage) => void;
  canUndo?: boolean;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'právě teď';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} hod ago`;
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function buildSettingsTags(image: GeneratedImage): string[] {
  const tags: string[] = [];
  if (image.aspectRatio && image.aspectRatio !== 'Original') tags.push(image.aspectRatio);
  if (image.resolution) tags.push(image.resolution);
  if (image.recipe?.provider) tags.push(image.recipe.provider);
  if (image.recipe?.promptMode === 'advanced') tags.push('advanced');
  if (image.recipe?.useGrounding) tags.push('grounding');
  if (image.recipe?.operation && image.recipe.operation !== 'generate') tags.push(image.recipe.operation);
  return tags;
}

export const ImageDetailModal: React.FC<ImageDetailModalProps> = ({
  isOpen, onClose, image, onNext, onPrev, hasNext, hasPrev, onUseImage, onRegenerate, onUndo, canUndo = false,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'compare'>('details');
  const [editPrompt, setEditPrompt] = useState('');
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (image) setEditPrompt(image.prompt || '');
  }, [image?.id]);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPosition((x / rect.width) * 100);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => isDragging && handleMove(e.clientX);
    const onMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, handleMove]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && hasNext) onNext?.();
      if (e.key === 'ArrowLeft' && hasPrev) onPrev?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, onNext, onPrev, hasNext, hasPrev]);

  if (!isOpen || !image) return null;

  const sourceImageUrl = image.lineage?.sourceImageUrls?.[0] ?? null;
  const hasSource = !!sourceImageUrl;
  const settingsTags = buildSettingsTags(image);
  const sourceCount = image.lineage?.sourceImageIds?.length ?? 0;
  const styleCount = image.lineage?.styleImageIds?.length ?? 0;
  const isEditing = Boolean(image.isEditing);

  const handleDownload = () => {
    if (!image.url) return;
    const a = document.createElement('a');
    a.href = image.url;
    const slug = (image.prompt || 'image').slice(0, 40).replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    a.download = `${image.timestamp || Date.now()}-${slug}.jpg`;
    a.click();
  };

  const panelBg = 'linear-gradient(180deg,rgba(26,38,20,0.98) 0%,rgba(14,20,10,0.99) 100%)';
  const panelBorder = 'rgba(168,191,143,0.16)';

  return (
    <div
      className="fixed inset-0 z-[200] flex animate-fadeIn"
      style={{ background: 'rgba(6,10,5,0.92)', backdropFilter: 'blur(12px)' }}
    >
      {/* Left: Image viewer */}
      <div
        className="relative flex-1 flex items-center justify-center overflow-hidden"
        onClick={onClose}
      >
        {/* Nav arrows */}
        {hasPrev && (
          <button
            onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full transition-all"
            style={{ background: 'rgba(32,44,24,0.70)', border: '1px solid rgba(168,191,143,0.20)', color: 'rgba(168,191,143,0.70)' }}
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {hasNext && (
          <button
            onClick={(e) => { e.stopPropagation(); onNext?.(); }}
            className="absolute right-[420px] top-1/2 -translate-y-1/2 z-10 p-3 rounded-full transition-all"
            style={{ background: 'rgba(32,44,24,0.70)', border: '1px solid rgba(168,191,143,0.20)', color: 'rgba(168,191,143,0.70)' }}
          >
            <ChevronRight size={20} />
          </button>
        )}

        <div className="p-8 md:p-16 w-full h-full flex items-center justify-center" onClick={e => e.stopPropagation()}>
          {activeTab === 'compare' && hasSource ? (
            <div
              ref={containerRef}
              className="relative max-h-full select-none cursor-col-resize rounded-xl overflow-hidden shadow-2xl"
              style={{ maxWidth: '80%', aspectRatio: 'auto', border: '1px solid rgba(168,191,143,0.15)' }}
              onMouseDown={() => setIsDragging(true)}
            >
              <img src={image.url} className="max-w-full max-h-[80vh] object-contain block" draggable={false} />
              <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}>
                <img src={sourceImageUrl!} className="max-w-full max-h-[80vh] object-contain block" draggable={false} />
              </div>
              <div className="absolute top-0 bottom-0 w-0.5 z-20" style={{ left: `${sliderPosition}%`, background: '#a8bf8f' }}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                  style={{ background: '#a8bf8f', border: '2px solid rgba(14,20,10,0.80)' }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="rgba(14,20,10,0.90)">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 9l4-4 4 4m0 6l-4 4-4-4" transform="rotate(90 12 12)" />
                  </svg>
                </div>
              </div>
            </div>
          ) : (
            <img
              src={image.url}
              className={`max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl transition-all duration-500 ${isEditing ? 'blur-md scale-[0.99] opacity-70' : ''}`}
              style={{ border: '1px solid rgba(168,191,143,0.12)' }}
            />
          )}
          {isEditing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="rounded-xl border px-5 py-3 text-[10px] font-black uppercase tracking-[0.22em]"
                style={{ background: 'rgba(14,20,10,0.78)', borderColor: 'rgba(168,191,143,0.28)', color: '#a8bf8f' }}>
                Upravují se detaily…
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Details panel */}
      <div
        className="w-[400px] shrink-0 h-full flex flex-col"
        style={{ background: panelBg, borderLeft: `1px solid ${panelBorder}`, boxShadow: '-4px 0 40px rgba(0,0,0,0.50)' }}
      >
        {/* Tabs + close */}
        <div className="flex items-center px-5 pt-4 pb-0 gap-0 shrink-0" style={{ borderBottom: `1px solid ${panelBorder}` }}>
          <div className="flex flex-1 gap-0">
            {(['details', 'compare'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] transition-colors relative"
                style={{
                  color: activeTab === tab ? 'var(--accent)' : 'rgba(168,191,143,0.45)',
                  borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
                disabled={tab === 'compare' && !hasSource}
              >
                {tab === 'details' ? 'Detaily' : 'Porovnat'}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg mb-1 transition-colors"
            style={{ color: 'rgba(168,191,143,0.50)', background: 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#a8bf8f')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(168,191,143,0.50)')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5 min-h-0">
          {/* Download + timestamp */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg transition-all"
              style={{ color: 'rgba(168,191,143,0.60)', border: '1px solid rgba(168,191,143,0.16)', background: 'rgba(24,34,18,0.60)' }}
              title="Stáhnout"
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#a8bf8f'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(168,191,143,0.60)'; }}
            >
              <Download size={15} />
            </button>
            <span className="text-[9px] font-medium" style={{ color: 'rgba(168,191,143,0.45)' }}>
              {image.timestamp ? formatTimestamp(image.timestamp) : ''}
              {image.timestamp ? ' · Uloženo v projektu' : ''}
            </span>
          </div>

          {/* Source image thumbnail (img2img) */}
          {hasSource && (
            <div className="space-y-1.5">
              <div className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'rgba(168,191,143,0.45)' }}>Zdrojový obrázek</div>
              <div className="flex gap-2 flex-wrap">
                {image.lineage!.sourceImageUrls.slice(0, 3).map((url, i) => (
                  <img key={i} src={url} alt="" className="w-14 h-14 object-cover rounded-lg"
                    style={{ border: '1px solid rgba(168,191,143,0.20)' }} />
                ))}
                {image.lineage!.styleImageUrls.slice(0, 2).map((url, i) => (
                  <div key={i} className="relative w-14 h-14">
                    <img src={url} alt="" className="w-14 h-14 object-cover rounded-lg opacity-70"
                      style={{ border: '1px solid rgba(168,191,143,0.14)' }} />
                    <div className="absolute top-0.5 right-0.5 text-[7px] font-black uppercase px-1 rounded"
                      style={{ background: 'rgba(168,191,143,0.20)', color: '#a8bf8f' }}>styl</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prompt */}
          <div className="space-y-1.5">
            <div className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'rgba(168,191,143,0.45)' }}>Prompt</div>
            <p className="text-[11px] leading-relaxed font-medium" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {image.prompt}
            </p>
          </div>

          {/* Settings tags */}
          {settingsTags.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'rgba(168,191,143,0.45)' }}>Nastavení</div>
              <div className="flex flex-wrap gap-1.5">
                {settingsTags.map(tag => (
                  <span key={tag} className="text-[9px] font-bold uppercase px-2 py-0.5 rounded"
                    style={{ background: 'rgba(168,191,143,0.10)', color: 'rgba(168,191,143,0.75)', border: '1px solid rgba(168,191,143,0.18)' }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Lineage */}
          {(sourceCount > 0 || styleCount > 0) && (
            <div className="space-y-1.5">
              <div className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'rgba(168,191,143,0.45)' }}>Lineage</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Zdroj', value: sourceCount > 0 ? `A${sourceCount}` : '—' },
                  { label: 'Reference', value: styleCount > 0 ? String(styleCount) : '—' },
                  { label: 'Výstupy', value: '1' },
                  { label: 'Latence', value: image.recipe?.createdAt ? '—' : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg px-3 py-2 space-y-0.5"
                    style={{ background: 'rgba(20,28,16,0.70)', border: '1px solid rgba(168,191,143,0.12)' }}>
                    <div className="text-[8px] font-black uppercase tracking-[0.15em]" style={{ color: 'rgba(168,191,143,0.40)' }}>{label}</div>
                    <div className="text-[11px] font-bold" style={{ color: 'rgba(168,191,143,0.85)' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit prompt */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Pencil size={10} style={{ color: 'rgba(168,191,143,0.55)' }} />
                <span className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: 'rgba(168,191,143,0.45)' }}>Upravit prompt</span>
              </div>
              <button className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded"
                style={{ color: 'rgba(168,191,143,0.65)', border: '1px solid rgba(168,191,143,0.18)', background: 'rgba(24,34,18,0.50)' }}>
                <ImagePlus size={9} />
                + Obrázky
              </button>
            </div>
            <textarea
              value={editPrompt}
              onChange={e => setEditPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-[11px] leading-relaxed resize-none custom-scrollbar"
              style={{
                background: 'rgba(18,26,13,0.80)',
                border: '1px solid rgba(168,191,143,0.18)',
                color: 'rgba(255,255,255,0.80)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => void onRegenerate?.(image, editPrompt)}
              disabled={isEditing || !editPrompt.trim()}
              className="w-full py-2.5 rounded-lg text-[10px] font-black uppercase tracking-[0.18em] transition-all"
              style={{
                background: 'rgba(32,44,24,0.70)',
                border: '1px solid rgba(168,191,143,0.25)',
                color: isEditing || !editPrompt.trim() ? 'rgba(168,191,143,0.35)' : 'rgba(168,191,143,0.85)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(42,58,30,0.85)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,191,143,0.45)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(32,44,24,0.70)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(168,191,143,0.25)';
              }}
            >
              {isEditing ? 'Upravuji…' : 'Upravit obrázek'}
            </button>
            <button
              onClick={() => onUndo?.(image)}
              disabled={!canUndo || isEditing}
              className="w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.18em] transition-all"
              style={{
                background: 'rgba(18,26,13,0.70)',
                border: '1px solid rgba(168,191,143,0.14)',
                color: canUndo && !isEditing ? 'rgba(168,191,143,0.65)' : 'rgba(168,191,143,0.25)',
              }}
            >
              Undo
            </button>
          </div>
        </div>

        {/* Bottom action */}
        <div className="p-5 shrink-0" style={{ borderTop: `1px solid ${panelBorder}` }}>
          <button
            onClick={() => { onUseImage?.(image); onClose(); }}
            className="w-full py-3.5 rounded-xl text-[10px] font-black uppercase tracking-[0.20em] transition-all flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#b8cfa0 0%,#a8bf8f 40%,#7d9a64 100%)', color: 'rgba(14,20,10,0.90)', boxShadow: '0 4px 20px rgba(125,154,100,0.30)' }}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
            Použít obrázek
          </button>
        </div>
      </div>
    </div>
  );
};
