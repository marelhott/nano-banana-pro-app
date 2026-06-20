import React from 'react';
import { AIProviderType, ProviderSettings } from '../services/aiProvider';
import { runArbitraryStyleTransferTfjs } from '../services/arbitraryStyleTransferTfjs';
import { runGatysStyleTransfer, runWctStyleTransfer } from '../services/neuralStyleTransferAlgorithms';
import { runFofrStyleTransfer } from '../services/replicateService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { dataUrlToBlob, getPublicUrl, uploadImage } from '../utils/supabaseStorage';
import { ImageDatabase } from '../utils/imageDatabase';
import { StyleTransferSidebar } from './styleTransfer/StyleTransferSidebar';
import { StyleTransferMobileControls } from './styleTransfer/StyleTransferMobileControls';
import { StyleTransferOutputs } from './styleTransfer/StyleTransferOutputs';
import { downloadDataUrl, fileToDataUrl, resolveDropToFile, STYLE_REFERENCE_LIMIT, composeStylePatchwork } from './styleTransfer/utils';
import type { ImageSlot, OutputItem } from './styleTransfer/utils';
import { AtelierInfoRows, AtelierRightPanel, AtelierSection } from './atelier/AtelierLayout';
import { runConcurrentTasks } from '../utils/concurrencyRunner';
import { toUserFacingAiError } from '../utils/aiErrorMessage';

type ToastType = 'success' | 'error' | 'info';
export type LocalStyleMethod = 'gatys' | 'adain' | 'wct';

export function StyleTransferScreen(props: {
  providerSettings: ProviderSettings;
  onOpenSettings: () => void;
  onOpenLibrary?: () => void;
  onBack: () => void;
  onToast: (toast: { message: string; type: ToastType }) => void;
  isHoveringGallery: boolean;
  theme?: 'dark' | 'light';
}) {
  const { providerSettings, onOpenSettings, onBack, onOpenLibrary, onToast, isHoveringGallery, theme = 'dark' } = props;

  async function normalizeDataUrlPixels(
    dataUrl: string,
    opts?: { maxDim?: number; mime?: 'image/jpeg' | 'image/png'; quality?: number },
  ): Promise<string> {
    const maxDim = Math.max(256, Math.min(4096, Math.round(opts?.maxDim ?? 1600)));
    const mime = opts?.mime ?? 'image/jpeg';
    const quality = typeof opts?.quality === 'number' ? opts.quality : 0.92;

    // Important: browsers render EXIF orientation here; canvas export bakes pixels (no EXIF).
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Nepodařilo se načíst obrázek pro normalizaci.'));
      i.src = dataUrl;
    });

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(iw, ih));
    const w = Math.max(1, Math.round(iw * scale));
    const h = Math.max(1, Math.round(ih * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    if (mime === 'image/png') return canvas.toDataURL('image/png');
    return canvas.toDataURL('image/jpeg', Math.max(0.1, Math.min(1, quality)));
  }

  const getMergePasses = React.useCallback((mergeValue: number, isHighRes: boolean) => {
    const v = Math.max(0, Math.min(100, Math.round(mergeValue)));
    const maxPasses = isHighRes ? 2 : 4;
    // 0..100 -> 1..(maxPasses) passes
    const passes = 1 + Math.floor(v / 34);
    return Math.max(1, Math.min(maxPasses, passes));
  }, []);

  type Engine = 'fofr' | 'quick';
  const [engine, setEngine] = React.useState<Engine>('fofr');
  const [localMethod, setLocalMethod] = React.useState<LocalStyleMethod>('adain');

  const [reference, setReference] = React.useState<ImageSlot | null>(null);
  const [styles, setStyles] = React.useState<Array<ImageSlot | null>>(
    () => Array.from({ length: STYLE_REFERENCE_LIMIT }, () => null),
  );
  const [strength, setStrength] = React.useState(60);
  const [merge, setMerge] = React.useState(55);
  const [variants, setVariants] = React.useState<1 | 2 | 3>(1);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [highRes, setHighRes] = React.useState(false);
  const [preserveColors, setPreserveColors] = React.useState(false);
  const [outputs, setOutputs] = React.useState<OutputItem[]>([]);
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const mountedRef = React.useRef(true);

  // Replicate (fofr/style-transfer) controls
  const [fofrModel, setFofrModel] = React.useState<'fast' | 'high-quality' | 'realistic' | 'cinematic' | 'animated'>('high-quality');
  const [fofrNumImages, setFofrNumImages] = React.useState<number>(1);
  const [fofrUseStructure, setFofrUseStructure] = React.useState<boolean>(true);
  const [fofrWidth, setFofrWidth] = React.useState<number>(1024);
  const [fofrHeight, setFofrHeight] = React.useState<number>(1024);
  const [fofrStructureDepthStrength, setFofrStructureDepthStrength] = React.useState<number>(1.2);
  const [fofrStructureDenoisingStrength, setFofrStructureDenoisingStrength] = React.useState<number>(0.75);
  // keep outputs deterministic/random entirely on Replicate side; don't expose format/quality/seed in UI

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const marginRight = isHoveringGallery && window.innerWidth >= 1024 ? '340px' : '0';
  const activeStyles = React.useMemo(() => styles.filter((slot): slot is ImageSlot => !!slot), [styles]);
  const canGenerate = !!reference && activeStyles.length > 0 && !isGenerating;
  const localIterationHint = React.useMemo(() => {
    if (localMethod === 'adain') return getMergePasses(merge, highRes);
    if (localMethod === 'gatys') return Math.round(40 + (Math.max(0, Math.min(100, merge)) / 100) * 120);
    return Math.round(28 + (Math.max(0, Math.min(100, merge)) / 100) * 70);
  }, [getMergePasses, highRes, localMethod, merge]);

  const setReferenceFromFile = React.useCallback(async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setReference({ file, dataUrl });
    try {
      await ImageDatabase.add(file, dataUrl, 'reference');
    } catch {
    }
  }, []);

  const setStyleFromFile = React.useCallback(async (index: number, file: File) => {
    const dataUrl = await fileToDataUrl(file);
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
    setReference(null);
  }, []);

  const clearStyle = React.useCallback((index: number) => {
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

    const count = engine === 'fofr' ? Math.max(1, Math.min(10, Math.round(fofrNumImages))) : variants;
    const outputIds = Array.from({ length: count }).map(
      (_, i) => `st-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
    );
    // Append new run outputs so older results remain visible.
    setOutputs((prev) => [...prev, ...outputIds.map((id) => ({ id, status: 'pending' as const }))]);
    setIsGenerating(true);

    try {
      if (engine === 'quick') {
        onToast({
          message: `Neural styl transfer (${localMethod.toUpperCase()}) běží lokálně v prohlížeči. První běh může chvíli načítat model.`,
          type: 'info',
        });
      } else {
        onToast({ message: 'FOFR styl transfer běží přes Replicate (cloud).', type: 'info' });
      }

      if (engine === 'fofr') {
        const token = providerSettings?.[AIProviderType.REPLICATE]?.apiKey;
        if (!token) {
          throw new Error('Chybí Replicate API klíč. Otevři Nastavení a vlož klíč pro Replicate.');
        }

        // Build a single "style image" from up to 3 refs.
        const seedBase = (Date.now() ^ Math.floor(Math.random() * 1e9)) | 0;
        const stylePatch = await composeStylePatchwork(activeStyles.map((s) => s.dataUrl), { size: 1024, seed: seedBase });

        // Upload inputs to storage and pass URLs to Replicate (much more robust than base64).
        // Normalize reference pixels to avoid EXIF orientation issues (Replicate often ignores EXIF).
        const refNormalized = await normalizeDataUrlPixels(reference.dataUrl, { maxDim: 1800, mime: 'image/jpeg', quality: 0.94 });
        const [refBlob, styleBlob] = await Promise.all([dataUrlToBlob(refNormalized), dataUrlToBlob(stylePatch)]);
        const [refPath, stylePath] = await Promise.all([uploadImage(refBlob, 'generated'), uploadImage(styleBlob, 'generated')]);
        const structureUrl = getPublicUrl(refPath);
        const styleUrl = getPublicUrl(stylePath);

        const cloudResults = await runConcurrentTasks({
          items: outputIds,
          concurrency: 2,
          onTaskStateChange: ({ index, status, attempt }) => {
            const id = outputIds[index];
            setOutputs((prev) =>
              prev.map((p) =>
                p.id === id
                  ? {
                      ...p,
                      status: status === 'done' ? 'success' : status === 'error' ? 'error' : status,
                      attempt,
                    }
                  : p,
              ),
            );
          },
          worker: async (_id, context) => {
            const data = await runFofrStyleTransfer({
              token,
              styleImage: styleUrl,
              structureImage: fofrUseStructure ? structureUrl : undefined,
              prompt: '',
              negativePrompt: '',
              width: fofrWidth,
              height: fofrHeight,
              model: fofrModel,
              numberOfImages: 1,
              structureDepthStrength: fofrStructureDepthStrength,
              structureDenoisingStrength: fofrStructureDenoisingStrength,
              outputFormat: 'webp',
              outputQuality: 90,
              seed: seedBase + context.index * 97,
            });

            const dataUrl = data[0];
            const thumb = await createThumbnail(dataUrl, 420);
            let finalUrl = dataUrl;
            try {
              const blob = await dataUrlToBlob(dataUrl);
              const path = await uploadImage(blob, 'generated');
              finalUrl = getPublicUrl(path);
              await saveToGallery({
                url: finalUrl,
                thumbnail: thumb,
                prompt: `Style Transfer (FOFR) | model=${fofrModel} denoise=${fofrStructureDenoisingStrength}`,
                resolution: 'match',
                aspectRatio: 'Original',
                params: {
                  mode: 'style-transfer-fofr',
                  engine: 'replicate',
                  model: fofrModel,
                  number_of_images: 1,
                  structure_depth_strength: fofrStructureDepthStrength,
                  structure_denoising_strength: fofrStructureDenoisingStrength,
                  output_format: 'webp',
                  output_quality: 90,
                  seed: seedBase + context.index * 97,
                  prompt: null,
                  negative_prompt: null,
                  styleReferences: activeStyles.length,
                  useStructure: fofrUseStructure,
                },
              });
            } catch {
              // keep local result visible
            }
            setOutputs((prev) =>
              prev.map((p) => (p.id === outputIds[context.index] ? { ...p, status: 'success', url: finalUrl, attempt: context.attempt } : p)),
            );
            return finalUrl;
          },
        });

        cloudResults.forEach((entry) => {
          const id = outputIds[entry.index];
          if (entry.status === 'fulfilled') {
            setOutputs((prev) =>
              prev.map((p) => (p.id === id ? { ...p, attempt: entry.attempts } : p)),
            );
            return;
          }

          setOutputs((prev) =>
            prev.map((p) => (p.id === id ? { ...p, status: 'error', error: toUserFacingAiError(entry.error, 'Cloud styl transfer selhal.'), attempt: entry.attempts } : p)),
          );
        });

        onToast({ message: 'Hotovo.', type: 'success' });
        return;
      }

      const strengthValue = Math.max(0, Math.min(100, Math.round(strength)));
      const mergeValue = Math.max(0, Math.min(100, Math.round(merge)));
      const strength01 = strengthValue / 100;
      const merge01 = mergeValue / 100;
      const adainPasses = getMergePasses(mergeValue, highRes);
      const localMaxDim = highRes ? 768 : 512;

      for (let i = 0; i < variants; i++) {
        try {
          // Each click should produce a fresh variant even with identical inputs.
          // (User can increase Variants to see several at once.)
          const seed = ((Date.now() + i * 9973) ^ Math.floor(Math.random() * 1e9)) | 0;
          let dataUrl = reference.dataUrl;

          if (localMethod === 'adain') {
            let contentDataUrl = reference.dataUrl;
            for (let pass = 0; pass < adainPasses; pass++) {
              const out = await runArbitraryStyleTransferTfjs({
                contentDataUrl,
                styleDataUrls: activeStyles.map((s) => s.dataUrl),
                strength01,
                maxDim: highRes ? 1024 : 512,
                preserveContentColors: preserveColors,
                variantSeed: seed + pass * 1337,
              });
              contentDataUrl = out.dataUrl;
            }
            dataUrl = contentDataUrl;
          } else if (localMethod === 'gatys') {
            const out = await runGatysStyleTransfer({
              contentDataUrl: reference.dataUrl,
              styleDataUrls: activeStyles.map((s) => s.dataUrl),
              strength01,
              merge01,
              maxDim: localMaxDim,
              preserveContentColors: preserveColors,
              variantSeed: seed,
            });
            dataUrl = out.dataUrl;
          } else {
            const out = await runWctStyleTransfer({
              contentDataUrl: reference.dataUrl,
              styleDataUrls: activeStyles.map((s) => s.dataUrl),
              strength01,
              merge01,
              maxDim: localMaxDim,
              preserveContentColors: preserveColors,
              variantSeed: seed,
            });
            dataUrl = out.dataUrl;
          }

          // Show instantly (local data URL), then upload+persist in background.
          setOutputs((prev) =>
            prev.map((p) => (p.id === outputIds[i] ? { id: outputIds[i], status: 'success', url: dataUrl, attempt: 1 } : p)),
          );

          const thumb = await createThumbnail(dataUrl, 420);
          try {
            const blob = await dataUrlToBlob(dataUrl);
            const path = await uploadImage(blob, 'generated');
            const publicUrl = getPublicUrl(path);

            setOutputs((prev) =>
              prev.map((p) => (p.id === outputIds[i] ? { id: outputIds[i], status: 'success', url: publicUrl, attempt: 1 } : p)),
            );

            await saveToGallery({
              url: publicUrl,
              thumbnail: thumb,
              prompt: `Style Transfer (${localMethod.toUpperCase()}) | strength=${strengthValue} merge=${mergeValue}`,
              resolution: localMethod === 'adain' ? (highRes ? '1024' : '512') : (highRes ? '768' : '512'),
              aspectRatio: 'Original',
              params: {
                mode:
                  localMethod === 'adain'
                    ? 'style-transfer-adain'
                    : localMethod === 'gatys'
                      ? 'style-transfer-gatys'
                      : 'style-transfer-wct',
                method: localMethod,
                strength: strengthValue,
                merge: mergeValue,
                passes: localMethod === 'adain' ? adainPasses : null,
                iterations: localMethod === 'adain' ? null : localIterationHint,
                highRes,
                preserveColors,
                styleReferences: activeStyles.length,
                variant: i + 1,
                variants,
                seed,
              },
            });
          } catch {
            // If Supabase upload fails, we still keep the local result visible.
          }
        } catch (e: any) {
          setOutputs((prev) =>
            prev.map((p) => (p.id === outputIds[i] ? { id: outputIds[i], status: 'error', error: e?.message || 'Chyba generování.', attempt: 1 } : p)),
          );
        }
      }

      onToast({ message: 'Hotovo.', type: 'success' });
    } catch (e: any) {
      const msg = e?.message || 'Chyba generování.';
      const newIds = new Set(outputIds);
      setOutputs((prev) =>
        prev.map((p) => (newIds.has(p.id) && ['pending', 'running', 'retrying'].includes(p.status) ? { ...p, status: 'error', error: msg } : p)),
      );
      onToast({ message: msg, type: 'error' });
    } finally {
      if (mountedRef.current) setIsGenerating(false);
    }
  }, [
    activeStyles,
    engine,
    fofrHeight,
    fofrModel,
    fofrNumImages,
    fofrStructureDenoisingStrength,
    fofrStructureDepthStrength,
    fofrUseStructure,
    fofrWidth,
    getMergePasses,
    highRes,
    merge,
    onToast,
    preserveColors,
    localIterationHint,
    localMethod,
    providerSettings,
    reference,
    strength,
    variants,
  ]);

  return (
    <>
      <StyleTransferSidebar
        engine={engine}
        setEngine={setEngine}
        localMethod={localMethod}
        setLocalMethod={setLocalMethod}
        onBack={onBack}
        onToast={onToast}
        reference={reference}
        styles={styles}
        strength={strength}
        setStrength={setStrength}
        merge={merge}
        setMerge={setMerge}
        mergePasses={localIterationHint}
        variants={variants}
        setVariants={setVariants}
        fofrNumImages={fofrNumImages}
        setFofrNumImages={setFofrNumImages}
        fofrModel={fofrModel}
        setFofrModel={setFofrModel}
        fofrUseStructure={fofrUseStructure}
        setFofrUseStructure={setFofrUseStructure}
        fofrWidth={fofrWidth}
        setFofrWidth={setFofrWidth}
        fofrHeight={fofrHeight}
        setFofrHeight={setFofrHeight}
        fofrStructureDepthStrength={fofrStructureDepthStrength}
        setFofrStructureDepthStrength={setFofrStructureDepthStrength}
        fofrStructureDenoisingStrength={fofrStructureDenoisingStrength}
        setFofrStructureDenoisingStrength={setFofrStructureDenoisingStrength}
        isGenerating={isGenerating}
        canGenerate={canGenerate}
        highRes={highRes}
        setHighRes={setHighRes}
        colorize={preserveColors}
        setColorize={setPreserveColors}
        onGenerate={handleGenerate}
        onSetReferenceFromFile={setReferenceFromFile}
        onSetStyleFromFile={setStyleFromFile}
        onClearReference={clearReference}
        onClearStyle={clearStyle}
        onDropToReference={dropToReference}
        onDropToStyle={dropToStyle}
        theme={theme}
      />

      <div
        className="flex-1 relative flex flex-col min-w-0 canvas-surface h-full overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out"
        style={{ marginRight }}
      >
        <div className="p-6 lg:p-10 pb-32 w-full">
          <div className="space-y-6 md:space-y-8 w-full">
            <div className="lg:hidden">
              <StyleTransferMobileControls
                engine={engine}
                setEngine={setEngine}
                localMethod={localMethod}
                setLocalMethod={setLocalMethod}
                onBack={onBack}
                onToast={onToast}
                reference={reference}
                styles={styles}
                strength={strength}
                setStrength={setStrength}
                merge={merge}
                setMerge={setMerge}
                mergePasses={localIterationHint}
                variants={variants}
                setVariants={setVariants}
                fofrNumImages={fofrNumImages}
                setFofrNumImages={setFofrNumImages}
                fofrModel={fofrModel}
                setFofrModel={setFofrModel}
                fofrUseStructure={fofrUseStructure}
                setFofrUseStructure={setFofrUseStructure}
                fofrWidth={fofrWidth}
                setFofrWidth={setFofrWidth}
                fofrHeight={fofrHeight}
                setFofrHeight={setFofrHeight}
                fofrStructureDepthStrength={fofrStructureDepthStrength}
                setFofrStructureDepthStrength={setFofrStructureDepthStrength}
                fofrStructureDenoisingStrength={fofrStructureDenoisingStrength}
                setFofrStructureDenoisingStrength={setFofrStructureDenoisingStrength}
                isGenerating={isGenerating}
                canGenerate={canGenerate}
                highRes={highRes}
                setHighRes={setHighRes}
                colorize={preserveColors}
                setColorize={setPreserveColors}
                onGenerate={handleGenerate}
                onSetReferenceFromFile={setReferenceFromFile}
                onSetStyleFromFile={setStyleFromFile}
                onClearReference={clearReference}
                onClearStyle={clearStyle}
                onDropToReference={dropToReference}
                onDropToStyle={dropToStyle}
              />
            </div>

            <StyleTransferOutputs
              outputs={outputs}
              onDownload={handleDownload}
              onOpenLightbox={(url) => setLightboxUrl(url)}
            />
          </div>
        </div>

        {lightboxUrl && (
          <div
            className="fixed inset-0 z-[80] bg-black/88 backdrop-blur-sm p-4"
            onDoubleClick={() => setLightboxUrl(null)}
            title="Dvojklik pro zavření"
          >
            <div
              className="w-full h-full rounded-xl border border-[rgba(168,191,143,0.18)] bg-black/50 overflow-auto custom-scrollbar flex items-center justify-center"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setLightboxUrl(null);
              }}
            >
              <img src={lightboxUrl} alt="Preview" className="block w-auto h-auto max-w-[96vw] max-h-[96vh] object-contain" />
            </div>
          </div>
        )}
      </div>

      <AtelierRightPanel onOpenLibrary={onOpenLibrary}>
        <AtelierSection title="Doladění stylu">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEngine('fofr')}
              className={`mn-option-button ${engine === 'fofr' ? 'mn-option-button-active' : ''}`}
            >
              FOFR
            </button>
            <button
              type="button"
              onClick={() => setEngine('quick')}
              className={`mn-option-button ${engine === 'quick' ? 'mn-option-button-active' : ''}`}
            >
              Neural
            </button>
          </div>

          {engine === 'quick' ? (
            <div className="space-y-3">
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
              <label className="block space-y-1.5">
                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  <span>Síla</span>
                  <span>{Math.round(strength)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={strength}
                  onChange={(e) => setStrength(Number(e.target.value))}
                  disabled={activeStyles.length === 0}
                  className="range-green w-full disabled:opacity-40"
                />
              </label>
              <label className="block space-y-1.5">
                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  <span>Merge</span>
                  <span>{Math.round(merge)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={merge}
                  onChange={(e) => setMerge(Number(e.target.value))}
                  disabled={activeStyles.length === 0}
                  className="range-green w-full disabled:opacity-40"
                />
              </label>
              <AtelierInfoRows rows={[{ label: 'Iterace', value: `${localIterationHint}x` }]} />
            </div>
          ) : (
            <div className="space-y-3">
              <select
                value={fofrModel}
                onChange={(e) => setFofrModel(e.target.value as any)}
                className="w-full rounded-lg border border-[rgba(168,191,143,0.18)] bg-[rgba(24,34,18,0.70)] backdrop-blur-sm px-3 py-2 text-[10px] font-semibold text-[var(--text-primary)] outline-none"
              >
                <option value="fast">fast</option>
                <option value="high-quality">high-quality</option>
                <option value="realistic">realistic</option>
                <option value="cinematic">cinematic</option>
                <option value="animated">animated</option>
              </select>
              <button
                type="button"
                onClick={() => setFofrUseStructure(!fofrUseStructure)}
                className={`w-full rounded-md border px-3 py-2 text-[9px] font-bold uppercase tracking-wider transition-all ${
                  fofrUseStructure ? 'border-[#a8bf8f]/25 bg-[#a8bf8f]/15 text-[#a8bf8f]' : 'border-[rgba(168,191,143,0.18)] bg-[rgba(32,44,24,0.55)] text-white/50'
                }`}
              >
                Struktura {fofrUseStructure ? 'On' : 'Off'}
              </button>
              {!fofrUseStructure ? (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={256}
                    max={2048}
                    step={64}
                    value={fofrWidth}
                    onChange={(e) => setFofrWidth(Number(e.target.value))}
                    className="rounded-lg border border-[rgba(168,191,143,0.18)] bg-[rgba(24,34,18,0.70)] backdrop-blur-sm px-2 py-2 text-[10px] text-[var(--text-primary)]"
                  />
                  <input
                    type="number"
                    min={256}
                    max={2048}
                    step={64}
                    value={fofrHeight}
                    onChange={(e) => setFofrHeight(Number(e.target.value))}
                    className="rounded-lg border border-[rgba(168,191,143,0.18)] bg-[rgba(24,34,18,0.70)] backdrop-blur-sm px-2 py-2 text-[10px] text-[var(--text-primary)]"
                  />
                </div>
              ) : null}
              <label className="block space-y-1.5">
                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  <span>Denoise</span>
                  <span>{fofrStructureDenoisingStrength.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={fofrStructureDenoisingStrength}
                  onChange={(e) => setFofrStructureDenoisingStrength(Number(e.target.value))}
                  className="range-green w-full"
                />
              </label>
              <label className="block space-y-1.5">
                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                  <span>Depth</span>
                  <span>{fofrStructureDepthStrength.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={fofrStructureDepthStrength}
                  onChange={(e) => setFofrStructureDepthStrength(Number(e.target.value))}
                  className="range-green w-full"
                />
              </label>
            </div>
          )}
        </AtelierSection>

        <AtelierSection title="Výstup">
          <AtelierInfoRows
            rows={[
              { label: 'Výstupů', value: engine === 'fofr' ? Math.max(1, Math.min(10, Math.round(fofrNumImages))) : variants },
              { label: 'Reference', value: activeStyles.length },
              { label: 'High-res', value: highRes ? 'On' : 'Off' },
              { label: 'Barvy', value: preserveColors ? 'On' : 'Off' },
            ]}
          />
        </AtelierSection>
      </AtelierRightPanel>
    </>
  );
}
