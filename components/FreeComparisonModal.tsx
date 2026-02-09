/**
 * FreeComparisonModal — volné porovnání libovolných dvou obrázků.
 * Slider comparison + grid comparison (2×2).
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { GeneratedImage } from '../types';

interface FreeComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: GeneratedImage[];
}

export const FreeComparisonModal: React.FC<FreeComparisonModalProps> = ({
  isOpen,
  onClose,
  images,
}) => {
  const [selectedA, setSelectedA] = useState<string | null>(null);
  const [selectedB, setSelectedB] = useState<string | null>(null);
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [viewMode, setViewMode] = useState<'slider' | 'side-by-side' | 'grid'>('side-by-side');
  const containerRef = useRef<HTMLDivElement>(null);

  const successImages = images.filter(img => img.status === 'success' && img.url);

  useEffect(() => {
    if (isOpen && successImages.length >= 2 && !selectedA && !selectedB) {
      setSelectedA(successImages[0]?.id || null);
      setSelectedB(successImages[1]?.id || null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

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

  if (!isOpen) return null;

  const imageA = successImages.find(img => img.id === selectedA);
  const imageB = successImages.find(img => img.id === selectedB);

  return (
    <div className="fixed inset-0 z-[150] bg-black flex flex-col animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-14 bg-[#0f1512] border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#7ed957]">
            Porovnání obrázků
          </span>

          <div className="flex gap-1 bg-black/30 rounded-lg p-0.5">
            {(['side-by-side', 'slider', 'grid'] as const).map(m => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all ${viewMode === m ? 'bg-[#7ed957] text-[#0a0f0d]' : 'text-gray-400 hover:text-white'}`}
              >
                {m === 'side-by-side' ? 'Vedle sebe' : m === 'slider' ? 'Slider' : 'Mřížka'}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Image selector sidebar */}
        <div className="w-48 bg-[#0f1512] border-r border-gray-800 overflow-y-auto custom-scrollbar p-2 shrink-0">
          <div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-gray-500 px-1">Obrázek A</div>
          <div className="grid grid-cols-2 gap-1 mb-4">
            {successImages.map(img => (
              <button
                key={`a-${img.id}`}
                onClick={() => setSelectedA(img.id)}
                className={`aspect-square rounded overflow-hidden border-2 transition-all ${selectedA === img.id ? 'border-[#7ed957]' : 'border-transparent hover:border-gray-600'}`}
              >
                <img src={img.url} className="w-full h-full object-cover" alt="" />
              </button>
            ))}
          </div>

          <div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-gray-500 px-1">Obrázek B</div>
          <div className="grid grid-cols-2 gap-1">
            {successImages.map(img => (
              <button
                key={`b-${img.id}`}
                onClick={() => setSelectedB(img.id)}
                className={`aspect-square rounded overflow-hidden border-2 transition-all ${selectedB === img.id ? 'border-blue-500' : 'border-transparent hover:border-gray-600'}`}
              >
                <img src={img.url} className="w-full h-full object-cover" alt="" />
              </button>
            ))}
          </div>
        </div>

        {/* Comparison area */}
        <div className="flex-1 flex items-center justify-center p-8 min-h-0">
          {(!imageA || !imageB) ? (
            <div className="text-gray-500 text-sm">Vyberte dva obrázky k porovnání</div>
          ) : viewMode === 'slider' ? (
            /* Slider comparison */
            <div
              ref={containerRef}
              className="relative max-w-full max-h-full cursor-col-resize select-none rounded-lg overflow-hidden border border-gray-700"
              onMouseDown={() => setIsDragging(true)}
              style={{ aspectRatio: 'auto' }}
            >
              <img src={imageB.url} className="max-w-full max-h-[70vh] object-contain" draggable={false} alt="B" />
              <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}>
                <img src={imageA.url} className="max-w-full max-h-[70vh] object-contain" draggable={false} alt="A" />
              </div>
              <div className="absolute top-0 bottom-0 w-0.5 bg-[#7ed957] z-20" style={{ left: `${sliderPosition}%` }}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-[#7ed957] border-2 border-black rounded-full shadow-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M8 9l4-4 4 4m0 6l-4 4-4-4" transform="rotate(90 12 12)" />
                  </svg>
                </div>
              </div>
              {/* Labels */}
              <div className="absolute top-3 left-3 px-2 py-1 bg-[#7ed957]/90 text-black text-[9px] font-bold uppercase rounded">A</div>
              <div className="absolute top-3 right-3 px-2 py-1 bg-blue-500/90 text-white text-[9px] font-bold uppercase rounded">B</div>
            </div>
          ) : viewMode === 'side-by-side' ? (
            /* Side by side */
            <div className="flex gap-4 max-w-full max-h-full items-center">
              <div className="flex-1 flex flex-col items-center gap-2">
                <div className="px-2 py-1 bg-[#7ed957]/10 text-[#7ed957] text-[9px] font-bold uppercase rounded border border-[#7ed957]/20">A</div>
                <img src={imageA.url} className="max-h-[65vh] max-w-full object-contain rounded-lg border border-gray-700" alt="A" />
                <p className="text-[9px] text-gray-400 max-w-[300px] truncate">{imageA.prompt}</p>
              </div>
              <div className="flex-1 flex flex-col items-center gap-2">
                <div className="px-2 py-1 bg-blue-500/10 text-blue-400 text-[9px] font-bold uppercase rounded border border-blue-500/20">B</div>
                <img src={imageB.url} className="max-h-[65vh] max-w-full object-contain rounded-lg border border-gray-700" alt="B" />
                <p className="text-[9px] text-gray-400 max-w-[300px] truncate">{imageB.prompt}</p>
              </div>
            </div>
          ) : (
            /* Grid 2×2 */
            <div className="grid grid-cols-2 gap-2 max-w-[80vh]">
              {[imageA, imageB, ...(successImages.filter(i => i.id !== selectedA && i.id !== selectedB).slice(0, 2))].map((img, idx) => (
                img?.url ? (
                  <div key={img.id} className="relative rounded-lg overflow-hidden border border-gray-700">
                    <img src={img.url} className="w-full aspect-square object-cover" alt="" />
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 text-[9px] font-bold text-white rounded">
                      {idx === 0 ? 'A' : idx === 1 ? 'B' : `${idx + 1}`}
                    </div>
                    <p className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 text-[8px] text-gray-300 truncate">
                      {img.prompt}
                    </p>
                  </div>
                ) : null
              ))}
            </div>
          )}
        </div>

        {/* Details panel */}
        {imageA && imageB && (
          <div className="w-64 bg-[#0f1512] border-l border-gray-800 overflow-y-auto custom-scrollbar p-4 shrink-0 space-y-4">
            <div className="space-y-2">
              <h4 className="text-gray-500 text-[9px] uppercase tracking-widest font-bold">Obrázek A</h4>
              <p className="text-white/70 text-[10px] leading-relaxed">{imageA.prompt}</p>
              <div className="flex gap-2 text-[9px] text-gray-400">
                <span>{imageA.resolution || '—'}</span>
                <span>•</span>
                <span>{imageA.aspectRatio || '—'}</span>
              </div>
            </div>
            <div className="border-t border-gray-800 pt-4 space-y-2">
              <h4 className="text-gray-500 text-[9px] uppercase tracking-widest font-bold">Obrázek B</h4>
              <p className="text-white/70 text-[10px] leading-relaxed">{imageB.prompt}</p>
              <div className="flex gap-2 text-[9px] text-gray-400">
                <span>{imageB.resolution || '—'}</span>
                <span>•</span>
                <span>{imageB.aspectRatio || '—'}</span>
              </div>
            </div>
            {imageA.recipe && imageB.recipe && (
              <div className="border-t border-gray-800 pt-4 space-y-2">
                <h4 className="text-gray-500 text-[9px] uppercase tracking-widest font-bold">Rozdíly</h4>
                {imageA.recipe.provider !== imageB.recipe.provider && (
                  <p className="text-[9px] text-amber-400">Provider: {imageA.recipe.provider} vs {imageB.recipe.provider}</p>
                )}
                {imageA.recipe.promptMode !== imageB.recipe.promptMode && (
                  <p className="text-[9px] text-amber-400">Režim: {imageA.recipe.promptMode} vs {imageB.recipe.promptMode}</p>
                )}
                {imageA.recipe.styleStrength !== imageB.recipe.styleStrength && (
                  <p className="text-[9px] text-amber-400">Síla stylu: {imageA.recipe.styleStrength ?? '—'}% vs {imageB.recipe.styleStrength ?? '—'}%</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
