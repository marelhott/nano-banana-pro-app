import React from 'react';
import { AIProviderType, ProviderSettings, PROVIDER_METADATA } from '../services/aiProvider';

interface ProviderSelectorProps {
    selectedProvider: AIProviderType;
    onChange: (provider: AIProviderType) => void;
    settings: ProviderSettings;
}

export const ProviderSelector: React.FC<ProviderSelectorProps> = ({
    selectedProvider,
    onChange,
    settings
}) => {
    const providers = Object.values(AIProviderType);
    const [isOpen, setIsOpen] = React.useState(false);

    const selectedMetadata = PROVIDER_METADATA[selectedProvider];
    const hasApiKey = (provider: AIProviderType) => {
        return !!settings[provider]?.apiKey;
    };

    return (
        <div className="relative">
            <label className="block text-xs font-black text-monstera-700 mb-2 uppercase tracking-widest">
                AI Provider
            </label>

            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-4 py-3 bg-white border-2 border-monstera-200 rounded-md hover:border-monstera-400 transition-colors flex items-center justify-between"
            >
                <div className="flex items-center gap-3">
                    <span className="text-2xl">{selectedMetadata.icon}</span>
                    <div className="text-left">
                        <div className="font-black text-sm text-ink">{selectedMetadata.name}</div>
                        {!hasApiKey(selectedProvider) && (
                            <div className="text-xs text-orange-600 font-bold">⚠️ No API key</div>
                        )}
                    </div>
                </div>
                <svg
                    className={`w-5 h-5 text-monstera-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-30"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown */}
                    <div className="absolute z-40 top-full left-0 right-0 mt-2 bg-white border-2 border-monstera-200 rounded-lg shadow-xl overflow-hidden">
                        {providers.map(provider => {
                            const metadata = PROVIDER_METADATA[provider];
                            const hasKey = hasApiKey(provider);
                            const isSelected = provider === selectedProvider;

                            return (
                                <button
                                    key={provider}
                                    onClick={() => {
                                        onChange(provider);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full px-4 py-3 flex items-center justify-between hover:bg-monstera-50 transition-colors ${isSelected ? 'bg-monstera-100' : ''
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">{metadata.icon}</span>
                                        <div className="text-left">
                                            <div className="font-black text-sm text-ink">{metadata.name}</div>
                                            {!metadata.supportsGrounding && (
                                                <div className="text-[10px] text-monstera-500">No grounding</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {hasKey ? (
                                            <span className="text-green-600 text-sm">✓</span>
                                        ) : (
                                            <span className="text-orange-600 text-sm">⚠️</span>
                                        )}
                                        {isSelected && (
                                            <div className="w-2 h-2 bg-monstera-500 rounded-full" />
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};
