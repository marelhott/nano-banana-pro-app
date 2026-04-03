import React, { useState, useEffect } from 'react';
import { AIProviderType, ProviderSettings, PROVIDER_METADATA, type HeadSwapGender, type HeadSwapHairSource } from '../services/aiProvider';
import { ProviderFactory } from '../services/providerFactory';
import { ImageDatabase, SettingsDatabase } from '../utils/imageDatabase';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: ProviderSettings;
    onSave: (settings: ProviderSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    settings,
    onSave,
}) => {
    const [localSettings, setLocalSettings] = useState<ProviderSettings>(settings);
    const [showKeys, setShowKeys] = useState<Record<AIProviderType, boolean>>({
        [AIProviderType.GEMINI]: false,
        [AIProviderType.GROK]: false,
        [AIProviderType.CHATGPT]: false,
        [AIProviderType.REPLICATE]: false
    });
    const [showFalKey, setShowFalKey] = useState(false);
    const [testing, setTesting] = useState<AIProviderType | null>(null);
    const [testingFal, setTestingFal] = useState(false);
    const [testingA1111, setTestingA1111] = useState(false);
    const [testResults, setTestResults] = useState<Record<AIProviderType, 'success' | 'error' | null>>({
        [AIProviderType.GEMINI]: null,
        [AIProviderType.GROK]: null,
        [AIProviderType.CHATGPT]: null,
        [AIProviderType.REPLICATE]: null
    });
    const [falTestResult, setFalTestResult] = useState<'success' | 'error' | null>(null);
    const [a1111TestResult, setA1111TestResult] = useState<'success' | 'error' | null>(null);
    const [storageStats, setStorageStats] = useState<{
        savedCount: number;
        generatedCount: number;
        totalBytes: number;
        usageBytes?: number;
        quotaBytes?: number;
    } | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        let mounted = true;
        void ImageDatabase.getStorageStats().then((stats) => {
            if (mounted) {
                setStorageStats(stats);
            }
        }).catch((error) => {
            console.warn('Failed to load storage stats:', error);
        });

        return () => {
            mounted = false;
        };
    }, [isOpen]);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    if (!isOpen) return null;

    const handleApiKeyChange = (provider: AIProviderType, apiKey: string) => {
        setLocalSettings({
            ...localSettings,
            [provider]: {
                apiKey,
                enabled: apiKey.trim() !== ''
            }
        });
        // Reset test result when key changes
        setTestResults({ ...testResults, [provider]: null });
    };

    const toggleShowKey = (provider: AIProviderType) => {
        setShowKeys({ ...showKeys, [provider]: !showKeys[provider] });
    };

    const runServerApiProbe = async (provider: AIProviderType | 'fal', apiKey: string): Promise<void> => {
        const response = await fetch('/api/provider-key-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, apiKey }),
        });

        let payload: any = null;
        try {
            payload = await response.json();
        } catch {
            // keep payload null, fallback to status text
        }

        if (!response.ok || payload?.success === false) {
            const detail = payload?.error || response.statusText || `HTTP ${response.status}`;
            throw new Error(detail);
        }
    };

    const testConnection = async (provider: AIProviderType) => {
        const config = localSettings[provider];
        if (!config?.apiKey) {
            setTestResults({ ...testResults, [provider]: 'error' });
            return;
        }

        setTesting(provider);
        setTestResults({ ...testResults, [provider]: null });

        try {
            // Validate API key format first
            const isValid = ProviderFactory.validateApiKey(provider, config.apiKey);
            if (!isValid) {
                setTestResults({ ...testResults, [provider]: 'error' });
                setTesting(null);
                return;
            }

            await runServerApiProbe(provider, config.apiKey.trim());
            setTestResults({ ...testResults, [provider]: 'success' });
        } catch (error) {
            console.error(`Test failed for ${provider}:`, error);
            setTestResults({ ...testResults, [provider]: 'error' });
        } finally {
            setTesting(null);
        }
    };

    const handleFalApiKeyChange = (apiKey: string) => {
        setLocalSettings({
            ...localSettings,
            fal: { apiKey, enabled: apiKey.trim() !== '' }
        });
        setFalTestResult(null);
    };

    const handleA1111BaseUrlChange = (baseUrl: string) => {
        setLocalSettings({
            ...localSettings,
            a1111: {
                baseUrl,
                sdxlVae: localSettings?.a1111?.sdxlVae,
                enabled: baseUrl.trim() !== ''
            }
        });
        setA1111TestResult(null);
    };

    const handleA1111VaeChange = (sdxlVae: string) => {
        setLocalSettings({
            ...localSettings,
            a1111: {
                baseUrl: localSettings?.a1111?.baseUrl || '',
                sdxlVae,
                enabled: Boolean(String(localSettings?.a1111?.baseUrl || '').trim())
            }
        });
        setA1111TestResult(null);
    };

    const testFalConnection = async () => {
        const apiKey = String(localSettings?.fal?.apiKey || '').trim();
        if (!apiKey) {
            setFalTestResult('error');
            return;
        }

        setTestingFal(true);
        setFalTestResult(null);
        try {
            // Keep validation permissive.
            if (apiKey.length < 8) {
                setFalTestResult('error');
                return;
            }
            await runServerApiProbe('fal', apiKey);
            setFalTestResult('success');
        } catch (error) {
            console.error('Test failed for fal:', error);
            setFalTestResult('error');
        } finally {
            setTestingFal(false);
        }
    };

    const testA1111Connection = async () => {
        const baseUrl = String(localSettings?.a1111?.baseUrl || '').trim().replace(/\/+$/, '');
        if (!baseUrl || !baseUrl.startsWith('http')) {
            setA1111TestResult('error');
            return;
        }

        setTestingA1111(true);
        setA1111TestResult(null);
        try {
            // Simple probe: A1111 exposes options endpoint.
            const res = await fetch(`${baseUrl}/sdapi/v1/options`, { method: 'GET' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setA1111TestResult('success');
        } catch (error) {
            console.error('Test failed for A1111:', error);
            setA1111TestResult('error');
        } finally {
            setTestingA1111(false);
        }
    };

    const handleSave = async () => {
        try {
            await SettingsDatabase.saveProviderSettings(localSettings);
            onSave(localSettings);
            onClose();
        } catch (error) {
            console.error('Failed to save settings:', error);
            // Settings will still be applied locally even if save fails
            onSave(localSettings);
            onClose();
        }
    };

    const providers = Object.values(AIProviderType);
    const headSwapSettings = {
        preferredPrimary: 'fal-easel' as const,
        hairSource: 'target' as HeadSwapHairSource,
        sourceGender: 'default' as HeadSwapGender,
        secondarySourceGender: 'default' as HeadSwapGender,
        useUpscale: true,
        useDetailer: false,
        facefusionEndpoint: '',
        refaceEndpoint: '',
        ...(localSettings.headSwap || {}),
    };
    const usageRatio = storageStats?.usageBytes && storageStats?.quotaBytes
        ? storageStats.usageBytes / storageStats.quotaBytes
        : null;
    const totalLocalMb = storageStats ? storageStats.totalBytes / (1024 * 1024) : 0;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-slideUp card-surface">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#0f1512]/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#7ed957]/10 rounded-lg flex items-center justify-center border border-[#7ed957]/20">
                            <svg className="w-5 h-5 text-[#7ed957]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-bold text-gray-200 uppercase tracking-wider">Nastavení AI Poskytovatele</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">

                    {providers.map(provider => {
                        const metadata = PROVIDER_METADATA[provider];
                        const config = localSettings[provider];
                        const testResult = testResults[provider];

                        return (
                            <div key={provider} className="border border-[var(--border-color)] rounded-xl p-5 bg-[var(--bg-panel)] hover:border-[var(--text-secondary)] transition-colors">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-8 h-8 bg-[var(--bg-input)] rounded flex items-center justify-center">
                                        {metadata.icon === 'gemini' && (
                                            <svg className="w-5 h-5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                        )}
                                        {metadata.icon === 'grok' && (
                                            <svg className="w-5 h-5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <circle cx="12" cy="12" r="10" strokeWidth={2} />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12M6 12h12" />
                                            </svg>
                                        )}
                                        {metadata.icon === 'chatgpt' && (
                                            <svg className="w-5 h-5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h.01M15 9h.01M9 15h6" />
                                            </svg>
                                        )}
                                        {metadata.icon === 'replicate' && (
                                            <svg className="w-5 h-5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h10M7 17h10" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-sm text-[var(--text-primary)] uppercase tracking-wider">{metadata.name}</h3>
                                        {!metadata.supportsGrounding && (
                                            <p className="text-xs text-[var(--text-secondary)] mt-1">Grounding není podporován</p>
                                        )}
                                    </div>
                                    {testResult === 'success' && (
                                        <div className="px-2 py-1 bg-green-500/10 border border-green-500/20 text-green-500 text-xs font-bold rounded">
                                            ✓ Platný
                                        </div>
                                    )}
                                    {testResult === 'error' && (
                                        <div className="px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold rounded">
                                            ✗ Neplatný
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                                            API Klíč
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKeys[provider] ? 'text' : 'password'}
                                                value={config?.apiKey || ''}
                                                onChange={(e) => handleApiKeyChange(provider, e.target.value)}
                                                placeholder={`Zadejte API klíč pro ${metadata.name}...`}
                                                className="w-full px-4 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none font-mono text-sm text-[var(--text-primary)] placeholder-gray-600 pr-24 transition-colors"
                                            />
                                            <button
                                                onClick={() => toggleShowKey(provider)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                            >
                                                {showKeys[provider] ? 'Skrýt' : 'Zobrazit'}
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => testConnection(provider)}
                                        disabled={!config?.apiKey || testing === provider}
                                        className="w-full px-4 py-2 bg-[var(--bg-card)] hover:bg-[var(--bg-panel)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest rounded-lg transition-all border border-[var(--border-color)]"
                                    >
                                        {testing === provider ? 'Testuji...' : 'Otestovat připojení'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    <div className="border border-[var(--border-color)] rounded-xl p-5 bg-[var(--bg-panel)] hover:border-[var(--text-secondary)] transition-colors">
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div>
                                <h3 className="font-bold text-sm text-[var(--text-primary)] uppercase tracking-wider">Lokální úložiště</h3>
                                <p className="text-xs text-[var(--text-secondary)] mt-1">
                                    Obrázky se ukládají do prohlížeče. Při zaplnění úložiště může ukládání nových obrázků selhat.
                                </p>
                            </div>
                            {usageRatio !== null && usageRatio >= 0.8 && (
                                <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold rounded">
                                    {Math.round(usageRatio * 100)}% zaplněno
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-3 text-xs">
                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-3">
                                    <div className="text-[var(--text-secondary)] uppercase tracking-wider">Saved</div>
                                    <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">{storageStats?.savedCount ?? '—'}</div>
                                </div>
                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-3">
                                    <div className="text-[var(--text-secondary)] uppercase tracking-wider">Generated</div>
                                    <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">{storageStats?.generatedCount ?? '—'}</div>
                                </div>
                                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-3">
                                    <div className="text-[var(--text-secondary)] uppercase tracking-wider">Lokálně</div>
                                    <div className="mt-1 text-lg font-bold text-[var(--text-primary)]">{storageStats ? `${totalLocalMb.toFixed(1)} MB` : '—'}</div>
                                </div>
                            </div>

                            {usageRatio !== null && (
                                <div>
                                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
                                        <span>Odhad zaplnění prohlížečového úložiště</span>
                                        <span>{Math.round(usageRatio * 100)}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-[var(--bg-input)] overflow-hidden">
                                        <div
                                            className={`h-full ${usageRatio >= 0.8 ? 'bg-amber-300' : 'bg-[#7ed957]'}`}
                                            style={{ width: `${Math.min(100, Math.round(usageRatio * 100))}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-[var(--text-secondary)] mt-2">
                                        {usageRatio >= 0.8
                                            ? 'Úložiště je skoro plné. Zvaž promazání galerie nebo export zálohy.'
                                            : 'Kapacita je zatím v bezpečném pásmu.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="border border-[var(--border-color)] rounded-xl p-5 bg-[var(--bg-panel)] hover:border-[var(--text-secondary)] transition-colors">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-[var(--bg-input)] rounded flex items-center justify-center">
                                <svg className="w-5 h-5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-4.553a1.5 1.5 0 10-2.121-2.121L12.88 7.88m2.12 2.12L9 16l-4 1 1-4 5.879-5.879m3.242 0a3 3 0 114.243 4.243" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-sm text-[var(--text-primary)] uppercase tracking-wider">Head Swap Service</h3>
                                <p className="text-xs text-[var(--text-secondary)] mt-1">
                                    Primární engine je Replicate Easel. Self-hosted fallbacky můžeš připojit přes FaceFusion wrapper nebo REFace endpoint.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">Primární engine</label>
                                    <select
                                        value={headSwapSettings.preferredPrimary}
                                        onChange={(e) => setLocalSettings({
                                            ...localSettings,
                                            headSwap: {
                                                ...headSwapSettings,
                                                preferredPrimary: 'replicate-easel',
                                            }
                                        })}
                                        className="w-full px-4 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none text-sm text-[var(--text-primary)]"
                                    >
                                        <option value="fal-easel">fal.ai Easel Advanced Face Swap</option>
                                        <option value="replicate-easel">Replicate Easel Advanced Face Swap</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">Zachovat vlasy</label>
                                    <select
                                        value={headSwapSettings.hairSource}
                                        onChange={(e) => setLocalSettings({
                                            ...localSettings,
                                            headSwap: {
                                                ...headSwapSettings,
                                                hairSource: e.target.value as HeadSwapHairSource,
                                            }
                                        })}
                                        className="w-full px-4 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none text-sm text-[var(--text-primary)]"
                                    >
                                        <option value="target">Cíl (stabilnější blend)</option>
                                        <option value="user">Zdroj (víc identity / vlasů)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">Gender zdroje</label>
                                    <select
                                        value={headSwapSettings.sourceGender}
                                        onChange={(e) => setLocalSettings({
                                            ...localSettings,
                                            headSwap: {
                                                ...headSwapSettings,
                                                sourceGender: e.target.value as HeadSwapGender,
                                            }
                                        })}
                                        className="w-full px-4 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none text-sm text-[var(--text-primary)]"
                                    >
                                        <option value="default">Auto</option>
                                        <option value="a man">Muž</option>
                                        <option value="a woman">Žena</option>
                                        <option value="nonbinary person">Non-binary</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">2. zdroj gender</label>
                                    <select
                                        value={headSwapSettings.secondarySourceGender}
                                        onChange={(e) => setLocalSettings({
                                            ...localSettings,
                                            headSwap: {
                                                ...headSwapSettings,
                                                secondarySourceGender: e.target.value as HeadSwapGender,
                                            }
                                        })}
                                        className="w-full px-4 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none text-sm text-[var(--text-primary)]"
                                    >
                                        <option value="default">Auto</option>
                                        <option value="a man">Muž</option>
                                        <option value="a woman">Žena</option>
                                        <option value="nonbinary person">Non-binary</option>
                                    </select>
                                </div>
                            </div>

                            <label className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
                                <input
                                    type="checkbox"
                                    checked={headSwapSettings.useUpscale}
                                    onChange={(e) => setLocalSettings({
                                        ...localSettings,
                                        headSwap: {
                                            ...headSwapSettings,
                                            useUpscale: e.target.checked,
                                        }
                                    })}
                                    className="rounded border-[var(--border-color)] bg-[var(--bg-input)]"
                                />
                                Zapnout interní upscale v Easel
                            </label>

                            <label className="flex items-center gap-3 text-sm text-[var(--text-primary)]">
                                <input
                                    type="checkbox"
                                    checked={headSwapSettings.useDetailer}
                                    onChange={(e) => setLocalSettings({
                                        ...localSettings,
                                        headSwap: {
                                            ...headSwapSettings,
                                            useDetailer: e.target.checked,
                                        }
                                    })}
                                    className="rounded border-[var(--border-color)] bg-[var(--bg-input)]"
                                />
                                Zapnout detailer v Easel
                            </label>

                            <div>
                                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                                    FaceFusion fallback endpoint
                                </label>
                                <input
                                    value={headSwapSettings.facefusionEndpoint || ''}
                                    onChange={(e) => setLocalSettings({
                                        ...localSettings,
                                        headSwap: {
                                            ...headSwapSettings,
                                            facefusionEndpoint: e.target.value,
                                        }
                                    })}
                                    placeholder="https://your-facefusion-wrapper.example.com/swap"
                                    className="w-full px-4 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none font-mono text-sm text-[var(--text-primary)] placeholder-gray-600 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                                    REFace fallback endpoint
                                </label>
                                <input
                                    value={headSwapSettings.refaceEndpoint || ''}
                                    onChange={(e) => setLocalSettings({
                                        ...localSettings,
                                        headSwap: {
                                            ...headSwapSettings,
                                            refaceEndpoint: e.target.value,
                                        }
                                    })}
                                    placeholder="https://your-reface-wrapper.example.com/swap"
                                    className="w-full px-4 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none font-mono text-sm text-[var(--text-primary)] placeholder-gray-600 transition-colors"
                                />
                                <p className="text-xs text-[var(--text-secondary)] mt-2">
                                    Očekávaný JSON kontrakt fallbacku: přijme `sourceImage`, `targetImage`, `mode`, `hairSource` a vrátí `imageBase64` nebo URL obrázku.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="border border-[var(--border-color)] rounded-xl p-5 bg-[var(--bg-panel)] hover:border-[var(--text-secondary)] transition-colors">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-[var(--bg-input)] rounded flex items-center justify-center">
                                <svg className="w-5 h-5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-sm text-[var(--text-primary)] uppercase tracking-wider">fal.ai (SDXL + LoRA)</h3>
                                <p className="text-xs text-[var(--text-secondary)] mt-1">Klíč se ukládá jen lokálně v tomto prohlížeči. Do Supabase se neukládá.</p>
                            </div>
                            {falTestResult === 'success' && (
                                <div className="px-2 py-1 bg-green-500/10 border border-green-500/20 text-green-500 text-xs font-bold rounded">
                                    ✓ Platný
                                </div>
                            )}
                            {falTestResult === 'error' && (
                                <div className="px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold rounded">
                                    ✗ Neplatný
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">API Klíč</label>
                                <div className="relative">
                                    <input
                                        type={showFalKey ? 'text' : 'password'}
                                        value={localSettings?.fal?.apiKey || ''}
                                        onChange={(e) => handleFalApiKeyChange(e.target.value)}
                                        placeholder="Zadejte fal.ai API key..."
                                        className="w-full px-4 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none font-mono text-sm text-[var(--text-primary)] placeholder-gray-600 pr-24 transition-colors"
                                    />
                                    <button
                                        onClick={() => setShowFalKey(v => !v)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                    >
                                        {showFalKey ? 'Skrýt' : 'Zobrazit'}
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={testFalConnection}
                                disabled={!String(localSettings?.fal?.apiKey || '').trim() || testingFal}
                                className="w-full px-4 py-2 bg-[var(--bg-card)] hover:bg-[var(--bg-panel)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest rounded-lg transition-all border border-[var(--border-color)]"
                            >
                                {testingFal ? 'Testuji...' : 'Otestovat připojení'}
                            </button>
                        </div>
                    </div>

                    <div className="border border-[var(--border-color)] rounded-xl p-5 bg-[var(--bg-panel)] hover:border-[var(--text-secondary)] transition-colors">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-[var(--bg-input)] rounded flex items-center justify-center">
                                <svg className="w-5 h-5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-bold text-sm text-[var(--text-primary)] uppercase tracking-wider">SDXL GPU (A1111 API)</h3>
                                <p className="text-xs text-[var(--text-secondary)] mt-1">
                                    Pro vlastní SDXL checkpoint + explicitní SDXL VAE (stabilní dekódování bez glitch).
                                </p>
                            </div>
                            {a1111TestResult === 'success' && (
                                <div className="px-2 py-1 bg-green-500/10 border border-green-500/20 text-green-500 text-xs font-bold rounded">
                                    ✓ OK
                                </div>
                            )}
                            {a1111TestResult === 'error' && (
                                <div className="px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold rounded">
                                    ✗ Chyba
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                                    Base URL
                                </label>
                                <input
                                    value={localSettings?.a1111?.baseUrl || ''}
                                    onChange={(e) => handleA1111BaseUrlChange(e.target.value)}
                                    placeholder="https://xxxx.proxy.runpod.net"
                                    className="w-full px-4 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none font-mono text-sm text-[var(--text-primary)] placeholder-gray-600 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">
                                    SDXL VAE (volitelné)
                                </label>
                                <input
                                    value={localSettings?.a1111?.sdxlVae || ''}
                                    onChange={(e) => handleA1111VaeChange(e.target.value)}
                                    placeholder="např. sdxl_vae.safetensors (nebo nech prázdné = auto)"
                                    className="w-full px-4 py-2.5 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent)] focus:outline-none font-mono text-sm text-[var(--text-primary)] placeholder-gray-600 transition-colors"
                                />
                                <p className="text-xs text-[var(--text-secondary)] mt-2">
                                    Pokud je prázdné, aplikace zkusí automaticky vybrat VAE obsahující “sdxl”.
                                </p>
                            </div>

                            <button
                                onClick={testA1111Connection}
                                disabled={!String(localSettings?.a1111?.baseUrl || '').trim() || testingA1111}
                                className="w-full px-4 py-2 bg-[var(--bg-card)] hover:bg-[var(--bg-panel)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-bold text-xs uppercase tracking-widest rounded-lg transition-all border border-[var(--border-color)]"
                            >
                                {testingA1111 ? 'Testuji...' : 'Otestovat připojení'}
                            </button>
                        </div>
                    </div>
                    <div className="h-4" />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800 bg-[#0f1512]/50">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 font-bold text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                        Zrušit
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2.5 bg-[#7ed957] hover:bg-[#6bc547] text-[#0a0f0d] font-bold text-sm uppercase tracking-wider rounded-lg transition-all shadow-lg shadow-[#7ed957]/20"
                    >
                        Uložit Nastavení
                    </button>
                </div>
            </div>
        </div>
    );
};
