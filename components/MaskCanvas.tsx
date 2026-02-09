/**
 * MaskCanvas — plátno pro kreslení masky (inpainting) nebo rozšíření (outpainting).
 * Umělec může štětcem označit oblasti k přegenerování.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';

interface MaskCanvasProps {
  imageUrl: string;
  width: number;
  height: number;
  onMaskComplete: (maskDataUrl: string) => void;
  onCancel: () => void;
  mode: 'inpaint' | 'outpaint';
  outpaintDirection?: 'top' | 'bottom' | 'left' | 'right' | 'all';
  outpaintPixels?: number;
}

export const MaskCanvas: React.FC<MaskCanvasProps> = ({
  imageUrl,
  width,
  height,
  onMaskComplete,
  onCancel,
  mode,
  outpaintDirection = 'all',
  outpaintPixels = 256,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [canvasReady, setCanvasReady] = useState(false);

  // Outpaint rozšíření
  const extTop = mode === 'outpaint' && (outpaintDirection === 'top' || outpaintDirection === 'all') ? outpaintPixels : 0;
  const extBottom = mode === 'outpaint' && (outpaintDirection === 'bottom' || outpaintDirection === 'all') ? outpaintPixels : 0;
  const extLeft = mode === 'outpaint' && (outpaintDirection === 'left' || outpaintDirection === 'all') ? outpaintPixels : 0;
  const extRight = mode === 'outpaint' && (outpaintDirection === 'right' || outpaintDirection === 'all') ? outpaintPixels : 0;

  const totalWidth = width + extLeft + extRight;
  const totalHeight = height + extTop + extBottom;

  // Zobrazovací scale (aby se vešel do viewportu)
  const maxDisplayWidth = Math.min(800, window.innerWidth - 80);
  const maxDisplayHeight = Math.min(600, window.innerHeight - 200);
  const scale = Math.min(maxDisplayWidth / totalWidth, maxDisplayHeight / totalHeight, 1);
  const displayWidth = Math.round(totalWidth * scale);
  const displayHeight = Math.round(totalHeight * scale);

  useEffect(() => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;

    canvas.width = totalWidth;
    canvas.height = totalHeight;
    maskCanvas.width = totalWidth;
    maskCanvas.height = totalHeight;

    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    if (!ctx || !maskCtx) return;

    // Vyplnit pozadí
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // Nakreslit obrázek na správnou pozici
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, extLeft, extTop, width, height);

      if (mode === 'outpaint') {
        // Automaticky zamaskovat rozšířené oblasti
        maskCtx.fillStyle = 'white';
        if (extTop > 0) maskCtx.fillRect(0, 0, totalWidth, extTop);
        if (extBottom > 0) maskCtx.fillRect(0, totalHeight - extBottom, totalWidth, extBottom);
        if (extLeft > 0) maskCtx.fillRect(0, 0, extLeft, totalHeight);
        if (extRight > 0) maskCtx.fillRect(totalWidth - extRight, 0, extRight, totalHeight);

        // Vizualizovat masku na hlavním canvasu
        ctx.fillStyle = 'rgba(126, 217, 87, 0.25)';
        if (extTop > 0) ctx.fillRect(0, 0, totalWidth, extTop);
        if (extBottom > 0) ctx.fillRect(0, totalHeight - extBottom, totalWidth, extBottom);
        if (extLeft > 0) ctx.fillRect(0, 0, extLeft, totalHeight);
        if (extRight > 0) ctx.fillRect(totalWidth - extRight, 0, extRight, totalHeight);
      }

      setCanvasReady(true);
    };
    img.src = imageUrl;
  }, [imageUrl, width, height, mode, totalWidth, totalHeight, extTop, extBottom, extLeft, extRight, outpaintPixels]);

  const getCanvasCoords = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }, [scale]);

  const draw = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;

    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    if (!ctx || !maskCtx) return;

    // Kreslit na masku (bílá = oblast k přegenerování)
    maskCtx.fillStyle = 'white';
    maskCtx.beginPath();
    maskCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    maskCtx.fill();

    // Vizualizovat na canvasu (zelená průsvitná)
    ctx.fillStyle = 'rgba(126, 217, 87, 0.35)';
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }, [brushSize]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    draw(x, y);
  }, [getCanvasCoords, draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDrawing) return;
    const { x, y } = getCanvasCoords(e);
    draw(x, y);
  }, [isDrawing, getCanvasCoords, draw]);

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;

    const ctx = canvas.getContext('2d');
    const maskCtx = maskCanvas.getContext('2d');
    if (!ctx || !maskCtx) return;

    // Vymazat masku
    maskCtx.clearRect(0, 0, totalWidth, totalHeight);

    // Překreslit obrázek
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, totalWidth, totalHeight);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, extLeft, extTop, width, height);
      if (mode === 'outpaint') {
        maskCtx.fillStyle = 'white';
        if (extTop > 0) { maskCtx.fillRect(0, 0, totalWidth, extTop); ctx.fillStyle = 'rgba(126, 217, 87, 0.25)'; ctx.fillRect(0, 0, totalWidth, extTop); }
        if (extBottom > 0) { maskCtx.fillRect(0, totalHeight - extBottom, totalWidth, extBottom); ctx.fillStyle = 'rgba(126, 217, 87, 0.25)'; ctx.fillRect(0, totalHeight - extBottom, totalWidth, extBottom); }
        if (extLeft > 0) { maskCtx.fillRect(0, 0, extLeft, totalHeight); ctx.fillStyle = 'rgba(126, 217, 87, 0.25)'; ctx.fillRect(0, 0, extLeft, totalHeight); }
        if (extRight > 0) { maskCtx.fillRect(totalWidth - extRight, 0, extRight, totalHeight); ctx.fillStyle = 'rgba(126, 217, 87, 0.25)'; ctx.fillRect(totalWidth - extRight, 0, extRight, totalHeight); }
      }
    };
    img.src = imageUrl;
  }, [imageUrl, width, height, mode, totalWidth, totalHeight, extTop, extBottom, extLeft, extRight]);

  const handleComplete = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const maskDataUrl = maskCanvas.toDataURL('image/png');
    onMaskComplete(maskDataUrl);
  }, [onMaskComplete]);

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center animate-fadeIn">
      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-4 bg-[#0f1512] rounded-lg p-3 border border-gray-800">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          {mode === 'inpaint' ? 'Inpainting — označte oblast k úpravě' : 'Outpainting — rozšíření plátna'}
        </span>

        <div className="flex items-center gap-2">
          <label className="text-[9px] text-gray-500 font-bold uppercase">Štětec:</label>
          <input
            type="range"
            min={5}
            max={100}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-24 accent-[#7ed957]"
          />
          <span className="text-[10px] text-gray-400 w-8 text-right">{brushSize}px</span>
        </div>

        <button
          onClick={handleClear}
          className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-gray-300 rounded-md transition-all"
        >
          Vymazat
        </button>

        <button
          onClick={handleComplete}
          disabled={!canvasReady}
          className="px-4 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-[#7ed957] hover:bg-[#6bc248] text-[#0a0f0d] rounded-md transition-all disabled:opacity-50"
        >
          Potvrdit masku
        </button>

        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md transition-all"
        >
          Zrušit
        </button>
      </div>

      {/* Canvas */}
      <div className="relative" style={{ width: displayWidth, height: displayHeight }}>
        <canvas
          ref={canvasRef}
          style={{ width: displayWidth, height: displayHeight, cursor: 'crosshair' }}
          className="rounded-lg border border-gray-700"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        {/* Skrytý mask canvas */}
        <canvas
          ref={maskCanvasRef}
          style={{ display: 'none' }}
        />
      </div>

      <p className="text-[9px] text-gray-500 mt-3">
        {mode === 'inpaint'
          ? 'Nakreslete štětcem oblasti, které chcete přegenerovat. Bílé oblasti budou nahrazeny.'
          : 'Zelené okraje budou dogenerovány. Můžete štětcem přidat další oblasti.'}
      </p>
    </div>
  );
};
