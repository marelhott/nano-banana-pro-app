import React from 'react';
import { AIProviderType, ImageInput, ProviderSettings } from '../services/aiProvider';
import { ProviderFactory } from '../services/providerFactory';
import { analyzeStyleTransferWithAI } from '../services/geminiService';
import { runFluxKontextProMultiImage, runIpAdapterStyleTransfer } from '../services/replicateService';
import { createThumbnail, saveToGallery } from '../utils/galleryDB';
import { dataUrlToBlob, getPublicUrl, uploadImage } from '../utils/supabaseStorage';
import { LoadingProgress } from './LoadingProgress';
import { StyleTransferSidebar } from './styleTransfer/StyleTransferSidebar';
import { StyleTransferMobileControls } from './styleTransfer/StyleTransferMobileControls';
import { StyleTransferOutputs } from './styleTransfer/StyleTransferOutputs';
import { createStylePatches, downloadDataUrl, fileToDataUrl, getDataUrlMime, resolveDropToFile } from './styleTransfer/utils';
import type { ImageSlot, OutputItem, StyleTransferAnalysis, StyleTransferEngine } from './styleTransfer/utils';

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
  const [style, setStyle] = React.useState<ImageSlot | null>(null);
  const [strength, setStrength] = React.useState(60);
  const [variants, setVariants] = React.useState<1 | 2 | 3>(1);
  const [analysis, setAnalysis] = React.useState<StyleTransferAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [useAgenticVision, setUseAgenticVision] = React.useState(true);
  const [engine, setEngine] = React.useState<StyleTransferEngine>('gemini');
  const [cfgScale, setCfgScale] = React.useState(7);
  const [denoise, setDenoise] = React.useState(0.55);
  const [ipAdapterWeight, setIpAdapterWeight] = React.useState(1);
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
  const geminiKey = providerSettings[AIProviderType.GEMINI]?.apiKey?.trim();
  const replicateToken = providerSettings[AIProviderType.REPLICATE]?.apiKey?.trim();
  const canAnalyze = engine === 'gemini' && !!reference && !!style && !!geminiKey && !isAnalyzing && !isGenerating;
  const canGenerate = !!reference && !!style && (engine === 'gemini' ? !!geminiKey : !!replicateToken) && !isGenerating;

  const completedCount = React.useMemo(() => {
    return outputs.filter((o) => o.status === 'success').length;
  }, [outputs]);

  const replicateUrlCacheRef = React.useRef<Map<string, string>>(new Map());
  const ensurePublicImageUrl = React.useCallback(async (dataUrl: string, cacheKey: string) => {
    const cached = replicateUrlCacheRef.current.get(cacheKey);
    if (cached) return cached;
    const blob = await dataUrlToBlob(dataUrl);
    const path = await uploadImage(blob, 'generated');
    const url = getPublicUrl(path);
    replicateUrlCacheRef.current.set(cacheKey, url);
    return url;
  }, []);

  const setReferenceFromFile = React.useCallback(async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setReference({ file, dataUrl });
  }, []);

  const setStyleFromFile = React.useCallback(async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setStyle({ file, dataUrl });
    setAnalysis(null);
  }, []);

  const clearReference = React.useCallback(() => {
    setReference(null);
  }, []);

  const clearStyle = React.useCallback(() => {
    setStyle(null);
    setAnalysis(null);
  }, []);

  const dropToReference = React.useCallback(async (e: React.DragEvent) => {
    const f = await resolveDropToFile(e);
    if (f) await setReferenceFromFile(f);
  }, [setReferenceFromFile]);

  const dropToStyle = React.useCallback(async (e: React.DragEvent) => {
    const f = await resolveDropToFile(e);
    if (f) await setStyleFromFile(f);
  }, [setStyleFromFile]);

  const handleAnalyze = React.useCallback(async () => {
    if (!reference || !style) return;
    if (!geminiKey) {
      onToast({ message: 'Chybí Gemini API klíč. Nastav ho v Settings.', type: 'error' });
      onOpenSettings();
      return;
    }
    setIsAnalyzing(true);
    try {
      const res = await analyzeStyleTransferWithAI(reference.dataUrl, style.dataUrl, geminiKey, {
        agenticVision: useAgenticVision,
        mediaResolution: useAgenticVision ? 'high' : undefined,
      });
      if (!mountedRef.current) return;
      setAnalysis(res);
      setStrength(Math.max(0, Math.min(100, Math.round(res.recommendedStrength))));
      onToast({ message: 'Analýza hotová.', type: 'success' });
    } catch (e: any) {
      onToast({ message: e?.message || 'Analýza selhala.', type: 'error' });
    } finally {
      if (mountedRef.current) setIsAnalyzing(false);
    }
  }, [geminiKey, onOpenSettings, onToast, reference, style, useAgenticVision]);

  const handleGenerate = React.useCallback(async () => {
    if (!reference || !style) return;
    if (engine === 'gemini') {
      if (!geminiKey) {
        onToast({ message: 'Chybí Gemini API klíč. Nastav ho v Settings.', type: 'error' });
        onOpenSettings();
        return;
      }
    } else {
      if (!replicateToken) {
        onToast({ message: 'Chybí Replicate API token. Nastav ho v Settings.', type: 'error' });
        onOpenSettings();
        return;
      }
    }

    let provider: any = null;
    if (engine === 'gemini') {
      try {
        provider = ProviderFactory.getProvider(AIProviderType.GEMINI, providerSettings);
      } catch {
        onToast({ message: 'Gemini provider není nakonfigurovaný.', type: 'error' });
        onOpenSettings();
        return;
      }
    }

    const refMime = getDataUrlMime(reference.dataUrl);
    const styleMime = getDataUrlMime(style.dataUrl);
    const images: ImageInput[] = [
      { data: reference.dataUrl, mimeType: refMime },
      { data: style.dataUrl, mimeType: styleMime }
    ];

    if (useAgenticVision) {
      try {
        const patches = await createStylePatches(style.dataUrl);
        patches.forEach((p) => {
          images.push({ data: p, mimeType: getDataUrlMime(p) });
        });
      } catch {
      }
    }

    const strengthValue = Math.max(0, Math.min(100, Math.round(strength)));
    const styleDesc = analysis?.styleDescription?.trim();
    const negative = analysis?.negativePrompt?.trim();

    const outputIds = Array.from({ length: variants }).map((_, i) => `st-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`);
    setOutputs(outputIds.map((id) => ({ id, status: 'loading' })));

      const negativeText = negative ? `${negative}` : 'text, watermark, logo, blur, artifacts';
    setIsGenerating(true);

    try {
      const negativeText = negative ? `Vyhni se: ${negative}` : 'Vyhni se: text, watermark, logo, rozmazání, artefakty';
      const basePrompt = [
        'Proveď style transfer: A=REFERENCE obsah, B=STYLE styl.',
        'Zachovej identitu, tvary a kompozici z A (póza, silueta, perspektiva).',
        'Aplikuj vizuální styl z B na A. Styl ber přímo z obrázku B (neopisuj ho do textu).',
        `Síla stylu: ${strengthValue}/100.`,
        negativeText,
        'Nevytvářej žádný text.'
      ].filter(Boolean).join('\n');

      if (engine === 'replicate_ip_adapter') {
        const contentUrl = await ensurePublicImageUrl(reference.dataUrl, 'replicate-content');
        const styleUrl = await ensurePublicImageUrl(style.dataUrl, 'replicate-style');
        const ipWeight = Math.max(0, Math.min(2, ipAdapterWeight));
        const prompt = [
          'Apply the painting style from the style image to the content image.',
          'Preserve the main subject and composition.',
          'No text.'
        ].join('\n');
        const results = await runIpAdapterStyleTransfer({
          token: replicateToken!,
          contentImage: contentUrl,
          styleImage: styleUrl,
          prompt,
          negativePrompt: negativeText,
          cfgScale,
          denoise,
          ipAdapterWeight: ipWeight,
          numOutputs: variants,
        });

        for (let i = 0; i < variants; i++) {
          const url = results[i];
          if (!url) continue;
          const thumb = await createThumbnail(url, 420);
          try {
            await saveToGallery({
              url,
              thumbnail: thumb,
              prompt: `Style Transfer | strength=${strengthValue}`,
              resolution: '1K',
              aspectRatio: 'Original',
              params: {
                mode: 'style-transfer',
                strength: strengthValue,
                styleDescription: styleDesc || null,
                negativePrompt: negative || null,
                engine,
                cfgScale,
                denoise,
                ipAdapterWeight: ipWeight,
                variant: i + 1,
                variants
              }
            });
          } catch {
          }
          setOutputs((prev) => prev.map((p, idx) => idx === i ? ({ id: outputIds[i], status: 'success', url }) : p));
        }
      } else {
        for (let i = 0; i < variants; i++) {
          const variantPrompt = `${basePrompt}\nVarianta: ${i + 1}/${variants}.`;
          try {
            let url: string;
            if (engine === 'gemini') {
              const res = await provider.generateImage(images, variantPrompt, '1K', 'Original', false);
              url = res.imageBase64;
            } else {
              const contentUrl = await ensurePublicImageUrl(reference.dataUrl, 'replicate-content');
              const styleUrl = await ensurePublicImageUrl(style.dataUrl, 'replicate-style');
              const strengthLabel = strengthValue <= 33 ? 'subtle' : strengthValue <= 66 ? 'medium' : 'strong';
              const replicatePrompt = [
                'Use image 1 as the content reference.',
                'Use image 2 as the style reference (palette, brushwork, texture, shading).',
                'Preserve the composition and identity from image 1.',
                `Style strength: ${strengthValue}/100 (${strengthLabel}).`,
                'Do not add any text.'
              ].join('\n');
              url = await runFluxKontextProMultiImage({
                token: replicateToken!,
                image1: contentUrl,
                image2: styleUrl,
                prompt: replicatePrompt,
                aspect_ratio: 'match_input_image'
              });
            }
            const thumb = await createThumbnail(url, 420);
            try {
              await saveToGallery({
                url,
                thumbnail: thumb,
                prompt: `Style Transfer | strength=${strengthValue}`,
                resolution: '1K',
                aspectRatio: 'Original',
                params: {
                  mode: 'style-transfer',
                  strength: strengthValue,
                  styleDescription: styleDesc || null,
                  negativePrompt: negative || null,
                  engine,
                  variant: i + 1,
                  variants
                }
              });
            } catch {
            }
            setOutputs((prev) => prev.map((p, idx) => idx === i ? ({ id: outputIds[i], status: 'success', url }) : p));
          } catch (e: any) {
            setOutputs((prev) => prev.map((p, idx) => idx === i ? ({ id: outputIds[i], status: 'error', error: e?.message || 'Chyba generování.' }) : p));
          }
        }
      }

      onToast({ message: 'Hotovo.', type: 'success' });
    } finally {
      if (mountedRef.current) setIsGenerating(false);
    }
  }, [analysis, cfgScale, denoise, engine, ensurePublicImageUrl, geminiKey, ipAdapterWeight, onOpenSettings, onToast, providerSettings, reference, replicateToken, strength, style, useAgenticVision, variants]);

  return (
    <>
      <StyleTransferSidebar
        onBack={onBack}
        onOpenSettings={onOpenSettings}
        onToast={onToast}
        reference={reference}
        style={style}
        strength={strength}
        setStrength={setStrength}
        variants={variants}
        setVariants={setVariants}
        analysis={analysis}
        isAnalyzing={isAnalyzing}
        isGenerating={isGenerating}
        useAgenticVision={useAgenticVision}
        setUseAgenticVision={setUseAgenticVision}
        engine={engine}
        setEngine={setEngine}
        cfgScale={cfgScale}
        setCfgScale={setCfgScale}
        denoise={denoise}
        setDenoise={setDenoise}
        ipAdapterWeight={ipAdapterWeight}
        setIpAdapterWeight={setIpAdapterWeight}
        canAnalyze={canAnalyze}
        canGenerate={canGenerate}
        hasGeminiKey={engine === 'gemini' ? !!geminiKey : !!replicateToken}
        onAnalyze={handleAnalyze}
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
                style={style}
                strength={strength}
                setStrength={setStrength}
                variants={variants}
                setVariants={setVariants}
                analysis={analysis}
                isAnalyzing={isAnalyzing}
                isGenerating={isGenerating}
                useAgenticVision={useAgenticVision}
                setUseAgenticVision={setUseAgenticVision}
                engine={engine}
                setEngine={setEngine}
                cfgScale={cfgScale}
                setCfgScale={setCfgScale}
                denoise={denoise}
                setDenoise={setDenoise}
                ipAdapterWeight={ipAdapterWeight}
                setIpAdapterWeight={setIpAdapterWeight}
                canAnalyze={canAnalyze}
                canGenerate={canGenerate}
                hasGeminiKey={engine === 'gemini' ? !!geminiKey : !!replicateToken}
                onAnalyze={handleAnalyze}
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
                  <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]"></div>
                  <h2 className="text-[11px] font-[900] uppercase tracking-[0.3em] text-gray-200">Výstupy</h2>
                </div>
                <div className="text-[10px] text-white/40">1–3 varianty podle nastavení.</div>
              </div>
            </header>

            <div className="card-surface p-4 md:p-6">
              <StyleTransferOutputs
                outputs={outputs}
                onOpenLightbox={(u) => setLightboxUrl(u)}
                onDownload={(u, idx) => downloadDataUrl(u, `style-transfer-${idx + 1}.jpg`)}
              />
            </div>
          </div>
        </div>
      </div>

      {isGenerating && outputs.length > 0 && (
        <LoadingProgress current={completedCount} total={outputs.length} estimatedTimePerImage={12} />
      )}

      {lightboxUrl && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 backdrop-blur-md p-4" onClick={() => setLightboxUrl(null)}>
          <div className="relative max-w-7xl max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="absolute top-3 right-3 px-3 py-1.5 bg-black/60 hover:bg-black/75 text-white/80 rounded-md text-[10px] font-bold uppercase tracking-widest"
            >
              Zavřít
            </button>
            <img src={lightboxUrl} alt="Output" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
          </div>
        </div>
      )}
    </>
  );
}
