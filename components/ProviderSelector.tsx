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
    settings: _settings
}) => {
    const providers = Object.values(AIProviderType).filter((provider) => provider !== AIProviderType.GROK);

    return (
        <div className="relative">
            <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                AI Poskytovatel
            </label>

            <div className="control-surface flex items-center gap-2 px-3 py-2">
                <select
                    className="w-full bg-transparent text-[10px] font-semibold text-[var(--text-primary)]/78 outline-none"
                    value={selectedProvider}
                    onChange={(e) => onChange(e.target.value as AIProviderType)}
                >
                    {providers.map((provider) => {
                        const metadata = PROVIDER_METADATA[provider];
                        return (
                            <option key={provider} value={provider}>
                                {metadata.name}
                            </option>
                        );
                    })}
                </select>
            </div>
        </div>
    );
};
