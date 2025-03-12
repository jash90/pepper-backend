import { OpenAI } from 'openai';

/**
 * Options for generating a completion with OpenAI
 */
export interface CompletionOptions {
  /** The model to use (e.g. "gpt-3.5-turbo", "gpt-4") */
  model: string;
  /** Controls randomness (0-1), lower is more deterministic */
  temperature?: number;
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** System message for chat models */
  systemMessage?: string;
}

// Check if API key exists
const apiKey = process.env.OPENAI_API_KEY;

// Initialize OpenAI client
const openai = apiKey 
  ? new OpenAI({ apiKey })
  : null;

// Whether OpenAI is configured
const isConfigured = !!apiKey;

/**
 * Generate a completion using OpenAI
 * @param prompt - The prompt to send to OpenAI
 * @param options - Configuration options for the completion
 * @returns The generated completion text
 */
async function generateCompletion(prompt: string, options: CompletionOptions): Promise<string> {
  if (!isConfigured || !openai) {
    throw new Error('OpenAI is not configured');
  }

  try {
    const response = await openai.chat.completions.create({
      model: options.model || 'gpt-3.5-turbo',
      messages: [
        ...(options.systemMessage ? [{ role: 'system', content: options.systemMessage }] : []),
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      max_tokens: options.max_tokens,
    });

    // Extract the completion text from the response
    const completionText = response.choices[0]?.message?.content?.trim();
    
    if (!completionText) {
      throw new Error('No completion returned from OpenAI');
    }
    
    return completionText;
  } catch (error) {
    console.error('Error generating completion with OpenAI:', error);
    throw new Error(`Failed to generate completion: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export {
  openai,
  isConfigured,
  generateCompletion
}; 