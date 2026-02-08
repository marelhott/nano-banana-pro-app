import React from 'react';
import { AIProviderType, ProviderSettings } from '../services/aiProvider';
import { runNeuralNeighborStyleTransfer } from '../services/replicateService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { dataUrlToBlob, getPublicUrl, uploadImage } from '../utils/supabaseStorage';
import { ImageDatabase } from '../utils/imageDatabase';
import { StyleTransferSidebar } from './styleTransfer/StyleTransferSidebar';
import { StyleTransferMobileControls } from './styleTransfer/StyleTransferMobileControls';
import { StyleTransferOutputs } from './styleTransfer/StyleTransferOutputs';
import { downloadDataUrl, fileToDataUrl, getDataUrlMime, resolveDropToFile, STYLE_REFERENCE_LIMIT, composeStylePatchwork } from './styleTransfer/utils';
import type { ImageSlot, OutputItem } from './styleTransfer/utils';

type ToastType = 'success' | 'error' | 'info';

export function StyleTransferScreen(props: {
  providerSettings: ProviderSettings;
  onOpenSettings: () => void;
  onBack: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
  isHoveringGallery: boolean;
}) {
  const { providerSettings, onOpenSettings, onBack, onToast, isHoveringGallery } = props;

  const [reference, setReference] = React.useState<ImageSlot | null>(null);
  const [styles, setStyles] = React.useState<Array<ImageSlot | null>>(
    () => Array.from({ length: STYLE_REFERENCE_LIMIT }, () => null),
  );
  const [strength, setStrength] = React.useState(60);
  const [variants, setVariants] = React.useState<1 | 2 | 3>(1);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [highRes, setHighRes] = React.useState(false);
  const [colorize, setColorize] = React.useState(true);
  const [outputs, setOutputs] = React.useState<OutputItem[]>([]);
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const marginRight = isHoveringGallery && window.innerWidth >= 1024 ? '340px' : '0';
  const replicateToken = providerSettings[AIProviderType.REPLICATE]?.apiKey?.trim();
  const activeStyles = React.useMemo(() => styles.filter((slot): slot is ImageSlot => !!slot), [styles]);
  const canGenerate = !!reference && activeStyles.length > 0 && !!replicateToken && !isGenerating;

  const replicateUrlCacheRef = React.useRef<Map<string, string>>(new Map());
  const buildReplicateCacheKey = React.useCallback((role: string, dataUrl: string) => {
    const head = dataUrl.slice(0, 64);
    const tail = dataUrl.slice(-64);
    return `${role}:${dataUrl.length}:${head}:${tail}`;
  }, []);

  const shrinkForReplicate = React.useCallback(async (dataUrl: string) => {
    const estimateBytes = (url: string) => {
      const commaIdx = url.indexOf(',');
      const b64 = commaIdx >= 0 ? url.slice(commaIdx + 1) : url;
      return Math.floor((b64.length * 3) / 4);
    };

    const MAX_BYTES = 256 * 1024;
    if (estimateBytes(dataUrl) <= MAX_BYTES) return dataUrl;

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Nepodařilo se načíst obrázek pro zmenšení.'));
      i.src = dataUrl;
    });

    const maxDim = 768;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.floor(img.width * scale));
    const h = Math.max(1, Math.floor(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    const qualities = [0.86, 0.78, 0.7, 0.6, 0.5, 0.4];
    for (const q of qualities) {
      const out = canvas.toDataURL('image/jpeg', q);
      if (estimateBytes(out) <= MAX_BYTES) return out;
    }
    return canvas.toDataURL('image/jpeg', 0.35);
  }, []);

  const ensureReplicateImageInput = React.useCallback(async (dataUrl: string, role: string) => {
    const cacheKey = buildReplicateCacheKey(role, dataUrl);
    const cached = replicateUrlCacheRef.current.get(cacheKey);
    if (cached) return cached;

    try {
      const blob = await dataUrlToBlob(dataUrl);
      const path = await uploadImage(blob, 'generated');
      const url = getPublicUrl(path);
      replicateUrlCacheRef.current.set(cacheKey, url);
      return url;
    } catch {
      const small = await shrinkForReplicate(dataUrl);
      replicateUrlCacheRef.current.set(cacheKey, small);
      return small;
    }
  }, [buildReplicateCacheKey, shrinkForReplicate]);

  const setReferenceFromFile = React.useCallback(async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    replicateUrlCacheRef.current.clear();
    setReference({ file, dataUrl });
    try {
      await ImageDatabase.add(file, dataUrl, 'reference');
    } catch {
    }
  }, []);

  const setStyleFromFile = React.useCallback(async (index: number, file: File) => {
    const dataUrl = await fileToDataUrl(file);
    replicateUrlCacheRef.current.clear();
    setStyles((prev) => {
      const next = [...prev];
      next[index] = { file, dataUrl };
      return next;
    });
    try {
      await ImageDatabase.add(file, dataUrl, 'style');
    } catch {
    }
  }, []);

  const clearReference = React.useCallback(() => {
    replicateUrlCacheRef.current.clear();
    setReference(null);
  }, []);

  const clearStyle = React.useCallback((index: number) => {
    replicateUrlCacheRef.current.clear();
    setStyles((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }, []);

  const dropToReference = React.useCallback(async (e: React.DragEvent) => {
    const f = await resolveDropToFile(e);
    if (!f) throw new Error('Nepodařilo se načíst obrázek z dropu.');
    await setReferenceFromFile(f);
  }, [setReferenceFromFile]);

  const dropToStyle = React.useCallback(async (index: number, e: React.DragEvent) => {
    const f = await resolveDropToFile(e);
    if (!f) throw new Error('Nepodařilo se načíst obrázek z dropu.');
    await setStyleFromFile(index, f);
  }, [setStyleFromFile]);

  const handleDownload = React.useCallback((dataUrl: string, index: number) => {
    downloadDataUrl(dataUrl, `style-transfer-${index + 1}.png`);
  }, []);

  const handleGenerate = React.useCallback(async () => {
    if (!reference) {
      onToast({ message: 'Nahraj Reference obrázek.', type: 'info' });
      return;
    }
    if (activeStyles.length === 0) {
      onToast({ message: 'Nahraj aspoň jednu stylovou referenci.', type: 'info' });
      return;
    }
    if (!replicateToken) {
      onToast({ message: 'Chybí Replicate API token. Nastav ho v Settings.', type: 'error' });
      onOpenSettings();
      return;
    }

      const outputIds = Array.from({ length: variants }).map((_, i) => `nst-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`);
      setOutputs(outputIds.map((id) => ({ id, status: 'loading' })));
      setIsGenerating(true);

      try {
        onToast({ message: 'NST může trvat 1–10 minut podle fronty. U více variant běží max 2 současně.', type: 'info' });
        const strengthValue = Math.max(0, Math.min(100, Math.round(strength)));
        // NNST alpha is reversed: alpha=1 -> preserve content (weak stylization).
        const alpha = Math.max(0.02, Math.min(0.98, 1 - strengthValue / 100));

      const contentUrl = await ensureReplicateImageInput(reference.dataUrl, 'nst-content');

      const concurrency = variants >= 3 ? 2 : 1;
      const queue = Array.from({ length: variants }).map((_, i) => i);
      let cursor = 0;

      const worker = async () => {
        while (cursor < queue.length) {
          const i = queue[cursor++];
          try {
            // Mix 1-3 styles into a single texture board (different seed per variant).
            const patchwork = await composeStylePatchwork(activeStyles.map((s) => s.dataUrl), {
              size: highRes ? 1024 : 512,
              seed: (Date.now() + i * 9973) | 0,
            });
            const styleUrl = await ensureReplicateImageInput(patchwork, `nst-style-${i}`);

            const url = await runNeuralNeighborStyleTransfer({
              token: replicateToken,
              contentImage: contentUrl,
              styleImage: styleUrl,
              alpha,
              highRes,
              colorize,
            });

            const thumb = await createThumbnail(url, 420);
            try {
              await saveToGallery({
                url,
                thumbnail: thumb,
                prompt: `Style Transfer (NST) | strength=${strengthValue}`,
                resolution: highRes ? '1024' : '512',
                aspectRatio: 'Original',
                params: {
                  mode: 'style-transfer-nst',
                  strength: strengthValue,
                  alpha,
                  highRes,
                  colorize,
                  styleReferences: activeStyles.length,
                  variant: i + 1,
                  variants,
                },
              });
            } catch {
            }

            setOutputs((prev) => prev.map((p, idx) => idx === i ? ({ id: outputIds[i], status: 'success', url }) : p));
          } catch (e: any) {
            setOutputs((prev) => prev.map((p, idx) => idx === i ? ({ id: outputIds[i], status: 'error', error: e?.message || 'Chyba generování.' }) : p));
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }).map(() => worker()));

      onToast({ message: 'Hotovo.', type: 'success' });
    } catch (e: any) {
      const msg = e?.message || 'Chyba generování.';
      setOutputs((prev) => prev.map((p) => (p.status === 'loading' ? ({ ...p, status: 'error', error: msg }) : p)));
      onToast({ message: msg, type: 'error' });
    } finally {
      if (mountedRef.current) setIsGenerating(false);
    }
  }, [activeStyles, colorize, ensureReplicateImageInput, highRes, onOpenSettings, onToast, reference, replicateToken, strength, variants]);

  return (
    <>
      <StyleTransferSidebar
        onBack={onBack}
        onOpenSettings={onOpenSettings}
        onToast={onToast}
        reference={reference}
        styles={styles}
        strength={strength}
        setStrength={setStrength}
        variants={variants}
        setVariants={setVariants}
        isGenerating={isGenerating}
        canGenerate={canGenerate}
        hasReplicateKey={!!replicateToken}
        highRes={highRes}
        setHighRes={setHighRes}
        colorize={colorize}
        setColorize={setColorize}
        onGenerate={handleGenerate}
        onSetReferenceFromFile={setReferenceFromFile}
        onSetStyleFromFile={setStyleFromFile}
        onClearReference={clearReference}
        onClearStyle={clearStyle}
        onDropToReference={dropToReference}
        onDropToStyle={dropToStyle}
      />

      <div
        className="flex-1 relative flex flex-col min-w-0 canvas-surface h-full overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out"
        style={{ marginRight }}
      >
        <div className="p-6 lg:p-10 pb-32 w-full">
          <div className="space-y-6 md:space-y-8 w-full">
            <div className="lg:hidden">
              <StyleTransferMobileControls
                onBack={onBack}
                onOpenSettings={onOpenSettings}
                onToast={onToast}
                reference={reference}
                styles={styles}
                strength={strength}
                setStrength={setStrength}
                variants={variants}
                setVariants={setVariants}
                isGenerating={isGenerating}
                canGenerate={canGenerate}
                hasReplicateKey={!!replicateToken}
                highRes={highRes}
                setHighRes={setHighRes}
                colorize={colorize}
                setColorize={setColorize}
                onGenerate={handleGenerate}
                onSetReferenceFromFile={setReferenceFromFile}
                onSetStyleFromFile={setStyleFromFile}
                onClearReference={clearReference}
                onClearStyle={clearStyle}
                onDropToReference={dropToReference}
                onDropToStyle={dropToStyle}
              />
            </div>

            <header className="hidden lg:flex flex-col md:flex-row md:items-end justify-between gap-4 px-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-[#7ed957] rounded-full" />
                  <h2 className="text-[11px] font-[900] uppercase tracking-[0.28em] text-white/80">
                    Style Transfer (NST)
                  </h2>
                </div>
                <div className="text-[10px] text-white/45 max-w-[520px] leading-relaxed">
                  Promptless přenos malířské textury ze stylových předloh na fotku. Pro 2–3 styly se udělá texturový patchwork.
                </div>
              </div>
            </header>

            <StyleTransferOutputs
              outputs={outputs}
              onDownload={handleDownload}
              onOpenLightbox={(url) => setLightboxUrl(url)}
            />
          </div>
        </div>

        {lightboxUrl && (
          <button
            type="button"
            className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setLightboxUrl(null)}
            title="Zavřít"
          >
            <img src={lightboxUrl} alt="Preview" className="max-w-[95vw] max-h-[92vh] rounded-lg shadow-2xl" />
          </button>
        )}
      </div>
    </>
  );
}
