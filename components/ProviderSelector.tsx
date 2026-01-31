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
            <label className="block text-[10px] font-bold text-[var(--text-3)] mb-1.5 uppercase tracking-wider">
                AI Poskytovatel
            </label>

            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-3 py-2 text-left transition-colors flex items-center justify-between group control-surface"
            >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-bold text-xs text-white/85 truncate">{selectedMetadata.name}</span>
                    {!hasApiKey(selectedProvider) && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300/70 shrink-0">Bez klíče</span>
                    )}
                </div>
                <span className={`text-[10px] text-white/40 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-30"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown */}
                    <div className="absolute z-40 top-full left-0 right-0 mt-1 overflow-hidden animate-fadeIn menu-surface">
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
                                    className={`w-full px-3 py-2.5 flex items-center justify-between hover:bg-white/5 transition-colors text-left ${isSelected ? 'bg-white/5 border-l-2 border-[var(--accent)]' : 'border-l-2 border-transparent'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <div className="min-w-0">
                                            <div className={`font-medium text-xs truncate ${isSelected ? 'text-white' : 'text-white/70'}`}>{metadata.name}</div>
                                            {!metadata.supportsGrounding && (
                                                <div className="text-[9px] text-white/35">Grounding nedostupný</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${hasKey ? 'text-white/45' : 'text-amber-300/60'}`}>
                                            {hasKey ? 'OK' : 'KEY'}
                                        </span>
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
