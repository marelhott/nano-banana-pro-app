import React from 'react';
import { AIProviderType, ProviderSettings } from '../services/aiProvider';
import { runArbitraryStyleTransferTfjs } from '../services/arbitraryStyleTransferTfjs';
import { runFofrStyleTransfer } from '../services/replicateService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { dataUrlToBlob, getPublicUrl, uploadImage } from '../utils/supabaseStorage';
import { ImageDatabase } from '../utils/imageDatabase';
import { StyleTransferSidebar } from './styleTransfer/StyleTransferSidebar';
import { StyleTransferMobileControls } from './styleTransfer/StyleTransferMobileControls';
import { StyleTransferOutputs } from './styleTransfer/StyleTransferOutputs';
import { downloadDataUrl, fileToDataUrl, resolveDropToFile, STYLE_REFERENCE_LIMIT, composeStylePatchwork } from './styleTransfer/utils';
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

  const getMergePasses = React.useCallback((mergeValue: number, isHighRes: boolean) => {
    const v = Math.max(0, Math.min(100, Math.round(mergeValue)));
    const maxPasses = isHighRes ? 2 : 4;
    // 0..100 -> 1..(maxPasses) passes
    const passes = 1 + Math.floor(v / 34);
    return Math.max(1, Math.min(maxPasses, passes));
  }, []);

  type Engine = 'fofr' | 'quick';
  const [engine, setEngine] = React.useState<Engine>('fofr');

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
  const [fofrOutputFormat, setFofrOutputFormat] = React.useState<'webp' | 'jpg' | 'png'>('webp');
  const [fofrOutputQuality, setFofrOutputQuality] = React.useState<number>(90);
  const [fofrSeed, setFofrSeed] = React.useState<string>('');

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const marginRight = isHoveringGallery && window.innerWidth >= 1024 ? '340px' : '0';
  const activeStyles = React.useMemo(() => styles.filter((slot): slot is ImageSlot => !!slot), [styles]);
  const canGenerate = !!reference && activeStyles.length > 0 && !isGenerating;

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
    const outputIds = Array.from({ length: count }).map((_, i) => `st-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`);
    setOutputs(outputIds.map((id) => ({ id, status: 'loading' })));
    setIsGenerating(true);

    try {
      if (engine === 'quick') {
        onToast({
          message: 'Quick styl transfer běží lokálně v prohlížeči. První běh může chvíli načítat model, potom je to rychlé.',
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
        const [refBlob, styleBlob] = await Promise.all([dataUrlToBlob(reference.dataUrl), dataUrlToBlob(stylePatch)]);
        const [refPath, stylePath] = await Promise.all([uploadImage(refBlob, 'generated'), uploadImage(styleBlob, 'generated')]);
        const structureUrl = getPublicUrl(refPath);
        const styleUrl = getPublicUrl(stylePath);

        const seedNum = fofrSeed.trim() ? Number(fofrSeed.trim()) : undefined;
        const results = await runFofrStyleTransfer({
          token,
          styleImage: styleUrl,
          structureImage: fofrUseStructure ? structureUrl : undefined,
          prompt: '',
          negativePrompt: '',
          width: fofrWidth,
          height: fofrHeight,
          model: fofrModel,
          numberOfImages: count,
          structureDepthStrength: fofrStructureDepthStrength,
          structureDenoisingStrength: fofrStructureDenoisingStrength,
          outputFormat: fofrOutputFormat,
          outputQuality: fofrOutputQuality,
          seed: Number.isFinite(seedNum as number) ? (seedNum as number) : undefined,
        });

        for (let i = 0; i < results.length; i++) {
          const dataUrl = results[i];
          setOutputs((prev) => prev.map((p, idx) => (idx === i ? { id: outputIds[i], status: 'success', url: dataUrl } : p)));

          const thumb = await createThumbnail(dataUrl, 420);
          try {
            const blob = await dataUrlToBlob(dataUrl);
            const path = await uploadImage(blob, 'generated');
            const publicUrl = getPublicUrl(path);

            setOutputs((prev) => prev.map((p, idx) => (idx === i ? { id: outputIds[i], status: 'success', url: publicUrl } : p)));

            await saveToGallery({
              url: publicUrl,
              thumbnail: thumb,
              prompt: `Style Transfer (FOFR) | model=${fofrModel} denoise=${fofrStructureDenoisingStrength}`,
              resolution: 'match',
              aspectRatio: 'Original',
              params: {
                mode: 'style-transfer-fofr',
                engine: 'replicate',
                model: fofrModel,
                number_of_images: count,
                structure_depth_strength: fofrStructureDepthStrength,
                structure_denoising_strength: fofrStructureDenoisingStrength,
                output_format: fofrOutputFormat,
                output_quality: fofrOutputQuality,
                seed: seedNum ?? null,
                prompt: null,
                negative_prompt: null,
                styleReferences: activeStyles.length,
                useStructure: fofrUseStructure,
              },
            });
          } catch {
            // keep local result visible
          }
        }

        onToast({ message: 'Hotovo.', type: 'success' });
        return;
      }

      const strengthValue = Math.max(0, Math.min(100, Math.round(strength)));
      const strength01 = strengthValue / 100;
      const mergeValue = Math.max(0, Math.min(100, Math.round(merge)));
      const passes = getMergePasses(mergeValue, highRes);

      for (let i = 0; i < variants; i++) {
        try {
          // Each click should produce a fresh variant even with identical inputs.
          // (User can increase Variants to see several at once.)
          const seed = ((Date.now() + i * 9973) ^ Math.floor(Math.random() * 1e9)) | 0;
          let contentDataUrl = reference.dataUrl;
          for (let pass = 0; pass < passes; pass++) {
            const { dataUrl } = await runArbitraryStyleTransferTfjs({
              contentDataUrl,
              styleDataUrls: activeStyles.map((s) => s.dataUrl),
              strength01,
              maxDim: highRes ? 1024 : 512,
              preserveContentColors: preserveColors,
              variantSeed: seed + pass * 1337,
            });
            contentDataUrl = dataUrl;
          }
          const dataUrl = contentDataUrl;

          // Show instantly (local data URL), then upload+persist in background.
          setOutputs((prev) => prev.map((p, idx) => (idx === i ? { id: outputIds[i], status: 'success', url: dataUrl } : p)));

          const thumb = await createThumbnail(dataUrl, 420);
          try {
            const blob = await dataUrlToBlob(dataUrl);
            const path = await uploadImage(blob, 'generated');
            const publicUrl = getPublicUrl(path);

            setOutputs((prev) =>
              prev.map((p, idx) => (idx === i ? { id: outputIds[i], status: 'success', url: publicUrl } : p)),
            );

            await saveToGallery({
              url: publicUrl,
              thumbnail: thumb,
              prompt: `Style Transfer | strength=${strengthValue} merge=${mergeValue} passes=${passes}`,
              resolution: highRes ? '1024' : '512',
              aspectRatio: 'Original',
              params: {
                mode: 'style-transfer-arbitrary-tfjs',
                strength: strengthValue,
                merge: mergeValue,
                passes,
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
            prev.map((p, idx) =>
              idx === i ? { id: outputIds[i], status: 'error', error: e?.message || 'Chyba generování.' } : p,
            ),
          );
        }
      }

      onToast({ message: 'Hotovo.', type: 'success' });
    } catch (e: any) {
      const msg = e?.message || 'Chyba generování.';
      setOutputs((prev) => prev.map((p) => (p.status === 'loading' ? { ...p, status: 'error', error: msg } : p)));
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
    fofrOutputFormat,
    fofrOutputQuality,
    fofrSeed,
    fofrStructureDenoisingStrength,
    fofrStructureDepthStrength,
    fofrUseStructure,
    fofrWidth,
    getMergePasses,
    highRes,
    merge,
    onToast,
    preserveColors,
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
        onBack={onBack}
        onToast={onToast}
        reference={reference}
        styles={styles}
        strength={strength}
        setStrength={setStrength}
        merge={merge}
        setMerge={setMerge}
        mergePasses={getMergePasses(merge, highRes)}
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
        fofrOutputFormat={fofrOutputFormat}
        setFofrOutputFormat={setFofrOutputFormat}
        fofrOutputQuality={fofrOutputQuality}
        setFofrOutputQuality={setFofrOutputQuality}
        fofrSeed={fofrSeed}
        setFofrSeed={setFofrSeed}
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
                onBack={onBack}
                onToast={onToast}
                reference={reference}
                styles={styles}
                strength={strength}
                setStrength={setStrength}
                merge={merge}
                setMerge={setMerge}
                mergePasses={getMergePasses(merge, highRes)}
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
                fofrOutputFormat={fofrOutputFormat}
                setFofrOutputFormat={setFofrOutputFormat}
                fofrOutputQuality={fofrOutputQuality}
                setFofrOutputQuality={setFofrOutputQuality}
                fofrSeed={fofrSeed}
                setFofrSeed={setFofrSeed}
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

            <header className="hidden lg:flex flex-col md:flex-row md:items-end justify-between gap-4 px-1">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-[#7ed957] rounded-full" />
                  <h2 className="text-[11px] font-[900] uppercase tracking-[0.28em] text-white/80">
                    Style Transfer
                  </h2>
                </div>
                <div className="text-[10px] text-white/45 max-w-[520px] leading-relaxed">
                  Promptless přenos vizuálního stylu (textura, tahy, struktura). Styl se bere přímo z obrazů, ne z textu.
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
