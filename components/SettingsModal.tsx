import React, { useState, useEffect } from 'react';
import { AIProviderType, ProviderSettings, PROVIDER_METADATA } from '../services/aiProvider';
import { ProviderFactory } from '../services/providerFactory';
import { SettingsDatabase } from '../utils/imageDatabase';

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
    onSave
}) => {
    const [localSettings, setLocalSettings] = useState<ProviderSettings>(settings);
    const [showKeys, setShowKeys] = useState<Record<AIProviderType, boolean>>({
        [AIProviderType.GEMINI]: false,
        [AIProviderType.GROK]: false,
        [AIProviderType.CHATGPT]: false
    });
    const [testing, setTesting] = useState<AIProviderType | null>(null);
    const [testResults, setTestResults] = useState<Record<AIProviderType, 'success' | 'error' | null>>({
        [AIProviderType.GEMINI]: null,
        [AIProviderType.GROK]: null,
        [AIProviderType.CHATGPT]: null
    });

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

            // Try to create provider instance
            const providerInstance = ProviderFactory.createProvider(provider, config.apiKey);

            // For now, successful creation means valid key format
            // In the future, we could make a test API call
            setTestResults({ ...testResults, [provider]: 'success' });
        } catch (error) {
            console.error(`Test failed for ${provider}:`, error);
            setTestResults({ ...testResults, [provider]: 'error' });
        } finally {
            setTesting(null);
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-monstera-200 bg-monstera-50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-monstera-400 rounded-md flex items-center justify-center">
                            <svg className="w-5 h-5 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-black text-ink uppercase tracking-wider">Nastavení AI Poskytovatele</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-monstera-100 rounded-md transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {providers.map(provider => {
                        const metadata = PROVIDER_METADATA[provider];
                        const config = localSettings[provider];
                        const testResult = testResults[provider];

                        return (
                            <div key={provider} className="border border-monstera-200 rounded-lg p-5 bg-monstera-50/30">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-8 h-8 bg-monstera-100 rounded flex items-center justify-center">
                                        {metadata.icon === 'gemini' && (
                                            <svg className="w-5 h-5 text-monstera-700" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                        )}
                                        {metadata.icon === 'grok' && (
                                            <svg className="w-5 h-5 text-monstera-700" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <circle cx="12" cy="12" r="10" strokeWidth={2} />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12M6 12h12" />
                                            </svg>
                                        )}
                                        {metadata.icon === 'dalle' && (
                                            <svg className="w-5 h-5 text-monstera-700" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h.01M15 9h.01M9 15h6" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-black text-sm text-ink uppercase tracking-wider">{metadata.name}</h3>
                                        {!metadata.supportsGrounding && (
                                            <p className="text-xs text-monstera-600 mt-1">Grounding není podporován</p>
                                        )}
                                    </div>
                                    {testResult === 'success' && (
                                        <div className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">
                                            ✓ Platný
                                        </div>
                                    )}
                                    {testResult === 'error' && (
                                        <div className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded">
                                            ✗ Neplatný
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs font-bold text-monstera-700 mb-2 uppercase tracking-wider">
                                            API Klíč
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKeys[provider] ? 'text' : 'password'}
                                                value={config?.apiKey || ''}
                                                onChange={(e) => handleApiKeyChange(provider, e.target.value)}
                                                placeholder={`Zadejte API klíč pro ${metadata.name}...`}
                                                className="w-full px-4 py-2.5 border-2 border-monstera-200 rounded-md focus:border-monstera-400 focus:outline-none font-mono text-sm pr-24"
                                            />
                                            <button
                                                onClick={() => toggleShowKey(provider)}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-bold text-monstera-600 hover:text-monstera-800 transition-colors"
                                            >
                                                {showKeys[provider] ? 'Skrýt' : 'Zobrazit'}
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => testConnection(provider)}
                                        disabled={!config?.apiKey || testing === provider}
                                        className="w-full px-4 py-2 bg-monstera-400 hover:bg-monstera-500 disabled:bg-monstera-200 disabled:cursor-not-allowed text-ink font-black text-xs uppercase tracking-widest rounded-md transition-all border border-ink"
                                    >
                                        {testing === provider ? 'Testuji...' : 'Otestovat připojení'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-monstera-200 bg-monstera-50">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 font-bold text-sm text-monstera-700 hover:bg-monstera-100 rounded-md transition-colors"
                    >
                        Zrušit
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2.5 bg-monstera-500 hover:bg-monstera-600 text-white font-black text-sm uppercase tracking-wider rounded-md transition-all border border-ink shadow-md"
                    >
                        Uložit Nastavení
                    </button>
                </div>
            </div>
        </div>
    );
};
