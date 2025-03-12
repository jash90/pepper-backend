import { OpenAI } from 'openai';
import config from '../config';

// Define types
interface CompletionOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  systemMessage?: string;
  [key: string]: any;
}

interface OpenAIConfig {
  API_KEY: string;
  ORGANIZATION?: string;
  MODEL?: string;
}

let openai: OpenAI | null = null;

/**
 * Initialize the OpenAI API client
 * @returns boolean indicating if initialization was successful
 */
function initializeOpenAI(): boolean {
  try {
    // Using the structured config format
    if (config.SERVICES.OPENAI?.API_KEY) {
      const openaiConfig = config.SERVICES.OPENAI as OpenAIConfig;
      openai = new OpenAI({
        apiKey: openaiConfig.API_KEY,
        organization: openaiConfig.ORGANIZATION
      });
      return true;
    }
    console.warn('OpenAI API key not provided. OpenAI services will not be available.');
    return false;
  } catch (error) {
    console.error('Failed to initialize OpenAI client:', error);
    return false;
  }
}

/**
 * Generate a text completion using OpenAI
 * @param prompt - The prompt to generate text from
 * @param options - Additional options for the completion
 * @returns The generated text
 */
export async function generateCompletion(prompt: string, options: CompletionOptions = {}): Promise<string> {
  if (!openai) {
    if (!initializeOpenAI()) {
      throw new Error('OpenAI client is not initialized');
    }
  }

  const openaiConfig = config.SERVICES.OPENAI as OpenAIConfig | undefined;
  
  const defaultOptions = {
    model: options.model || openaiConfig?.MODEL || 'gpt-3.5-turbo',
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 500,
  };

  try {
    const messages = [
      ...(options.systemMessage ? [{ role: 'system' as const, content: options.systemMessage }] : []),
      { role: 'user' as const, content: prompt }
    ];

    if (!openai) {
      throw new Error('OpenAI client is not initialized');
    }

    const response = await openai.chat.completions.create({
      messages,
      ...defaultOptions,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating completion with OpenAI:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate completion: ${error.message}`);
    }
    throw new Error('Failed to generate completion: Unknown error');
  }
}

// Initialize on module load
initializeOpenAI(); 