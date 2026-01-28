import React from 'react';
import { AIProviderType, ProviderSettings, PROVIDER_METADATA } from '../services/aiProvider';

interface ProviderSelectorProps {
    selectedProvider: AIProviderType;
    onChange: (provider: AIProviderType) => void;
    settings: ProviderSettings;
}

// Provider icon components
const GeminiIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
);

const GrokIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10" strokeWidth={2} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12M6 12h12" />
    </svg>
);

const DalleIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9h.01M15 9h.01M9 15h6" />
    </svg>
);

const getProviderIcon = (iconType: string) => {
    switch (iconType) {
        case 'gemini': return <GeminiIcon />;
        case 'grok': return <GrokIcon />;
        case 'dalle': return <DalleIcon />;
        default: return null;
    }
};

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
            <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">
                AI Poskytovatel
            </label>

            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-3 py-2 bg-[#0a0f0d] border border-gray-800 rounded-lg text-left hover:border-gray-700 transition-colors flex items-center justify-between group shadow-sm"
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[#7ed957] shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        {getProviderIcon(selectedMetadata.icon)}
                    </span>
                    <span className="font-bold text-xs text-gray-200 truncate">{selectedMetadata.name}</span>
                    {!hasApiKey(selectedProvider) && (
                        <span className="text-[10px] text-orange-500 shrink-0">⚠</span>
                    )}
                </div>
                <svg
                    className={`w-3.5 h-3.5 text-gray-500 transition-transform shrink-0 group-hover:text-gray-300 ${isOpen ? 'rotate-180' : ''}`}
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
                    <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-[#0a0f0d] border border-gray-800 rounded-lg shadow-xl overflow-hidden animate-fadeIn">
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
                                    className={`w-full px-3 py-2.5 flex items-center justify-between hover:bg-white/5 transition-colors text-left ${isSelected ? 'bg-white/5 border-l-2 border-[#7ed957]' : 'border-l-2 border-transparent'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className={`shrink-0 ${isSelected ? 'text-[#7ed957]' : 'text-gray-500'}`}>
                                            {getProviderIcon(metadata.icon)}
                                        </span>
                                        <div className="min-w-0">
                                            <div className={`font-medium text-xs truncate ${isSelected ? 'text-white' : 'text-gray-400'}`}>{metadata.name}</div>
                                            {!metadata.supportsGrounding && (
                                                <div className="text-[9px] text-gray-600">Grounding nedostupný</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {hasKey ? (
                                            <svg className="w-3 h-3 text-green-500/50" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                        ) : (
                                            <svg className="w-3 h-3 text-orange-500/50" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
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
