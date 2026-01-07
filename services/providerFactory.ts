import { AIProvider, AIProviderType, ProviderSettings } from './aiProvider';
import { GeminiProvider } from './geminiService';
import { GrokProvider } from './grokService';
import { ChatGPTProvider } from './chatgptService';

/**
 * Factory for creating AI provider instances
 */
export class ProviderFactory {
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
        // Try to get API key for selected provider
        const providerConfig = settings[selectedType];

        if (providerConfig?.apiKey) {
            return this.createProvider(selectedType, providerConfig.apiKey);
        }

        // Fallback to Gemini if available
        const geminiConfig = settings[AIProviderType.GEMINI];
        if (geminiConfig?.apiKey) {
            console.warn(`No API key for ${selectedType}, falling back to Gemini`);
            return this.createProvider(AIProviderType.GEMINI, geminiConfig.apiKey);
        }

        // Last resort: try environment variable
        if (process.env.API_KEY) {
            console.warn(`Using environment API key for ${selectedType}`);
            return this.createProvider(selectedType, process.env.API_KEY);
        }

        throw new Error('No API key available for any provider');
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
                // xAI keys format (placeholder)
                return apiKey.length > 20;
            case AIProviderType.CHATGPT:
                // OpenAI keys start with "sk-"
                return apiKey.startsWith('sk-') && apiKey.length > 20;
            default:
                return false;
        }
    }
}
