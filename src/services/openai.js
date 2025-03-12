const { OpenAI } = require('openai');
const config = require('../config');

let openai = null;

/**
 * Initialize the OpenAI API client
 */
function initializeOpenAI() {
  try {
    // Using the structured config format
    if (config.SERVICES.OPENAI.API_KEY) {
      openai = new OpenAI({
        apiKey: config.SERVICES.OPENAI.API_KEY,
        organization: config.SERVICES.OPENAI.ORGANIZATION
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
 * @param {string} prompt - The prompt to generate text from
 * @param {Object} options - Additional options for the completion
 * @returns {Promise<string>} The generated text
 */
async function generateCompletion(prompt, options = {}) {
  if (!openai) {
    if (!initializeOpenAI()) {
      throw new Error('OpenAI client is not initialized');
    }
  }

  const defaultOptions = {
    model: options.model || config.SERVICES.OPENAI.MODEL || 'gpt-3.5-turbo',
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 500,
  };

  try {
    const messages = [
      ...(options.systemMessage ? [{ role: 'system', content: options.systemMessage }] : []),
      { role: 'user', content: prompt }
    ];

    const response = await openai.chat.completions.create({
      messages,
      ...defaultOptions,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating completion with OpenAI:', error);
    throw new Error(`Failed to generate completion: ${error.message}`);
  }
}

// Initialize on module load
initializeOpenAI();

module.exports = {
  generateCompletion,
}; 