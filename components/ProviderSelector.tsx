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
    const providers = Object.values(AIProviderType);

    return (
        <div className="relative">
            <label className="block text-[10px] font-bold text-[var(--text-3)] mb-1.5 uppercase tracking-wider">
                AI Poskytovatel
            </label>

            <div className="control-surface px-3 py-2 flex items-center gap-2">
                <select
                    className="w-full bg-transparent text-xs font-bold text-white/85 outline-none"
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
