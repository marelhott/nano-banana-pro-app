import { AIProvider, AIProviderType, ProviderSettings } from './aiProvider';
import { GeminiProvider } from './geminiService';
import { GrokProvider } from './grokService';
import { ChatGPTProvider } from './chatgptService';
import { ReplicateProvider } from './replicateService';

/**
 * Factory for creating AI provider instances
 */
export class ProviderFactory {
    static createMissingApiKeyError(type: AIProviderType): Error {
        const error = new Error(`Chybí API key pro ${type}. Otevři Nastavení a vlož klíč.`);
        (error as Error & { code?: string }).code = 'API_KEY_NOT_FOUND';
        return error;
    }

    /**
     * Create a provider instance based on type and API key
     */
    static createProvider(
        type: AIProviderType,
        apiKey: string
    ): AIProvider {
        if (!apiKey || apiKey.trim() === '') {
            throw new Error(`API key is required for ${type} provider`);
        }

        switch (type) {
            case AIProviderType.GEMINI:
                return new GeminiProvider(apiKey);
            case AIProviderType.GROK:
                return new GrokProvider(apiKey);
            case AIProviderType.CHATGPT:
                return new ChatGPTProvider(apiKey);
            case AIProviderType.REPLICATE:
                return new ReplicateProvider(apiKey);
            default:
                throw new Error(`Unknown provider type: ${type}`);
        }
    }

    /**
     * Get provider from settings, fallback to default
     */
    static getProvider(
        selectedType: AIProviderType,
        settings: ProviderSettings
    ): AIProvider {
        const providerConfig = settings[selectedType];
        if (providerConfig?.apiKey?.trim()) {
            return this.createProvider(selectedType, providerConfig.apiKey);
        }
        throw this.createMissingApiKeyError(selectedType);
    }

    /**
     * Validate API key format (basic check)
     */
    static validateApiKey(type: AIProviderType, apiKey: string): boolean {
        if (!apiKey || apiKey.trim() === '') {
            return false;
        }

        // Basic validation based on provider
        switch (type) {
            case AIProviderType.GEMINI:
                // Gemini keys typically start with "AI"
                return apiKey.length > 20;
            case AIProviderType.GROK:
                // xAI keys usually start with xai-
                return apiKey.startsWith('xai-') && apiKey.length > 20;
            case AIProviderType.CHATGPT:
                // OpenAI keys start with "sk-"
                return (apiKey.startsWith('sk-') || apiKey.startsWith('sk-proj-')) && apiKey.length > 20;
            case AIProviderType.REPLICATE:
                return (apiKey.startsWith('r8_') || apiKey.length > 20);
            default:
                return false;
        }
    }
}
