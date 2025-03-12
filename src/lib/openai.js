const { OpenAI } = require('openai');

// Sprawdź czy API key istnieje
const apiKey = process.env.OPENAI_API_KEY;

// Inicjalizacja klienta OpenAI
const openai = apiKey 
  ? new OpenAI({ apiKey })
  : null;

// Czy OpenAI jest skonfigurowany
const isConfigured = !!apiKey;

module.exports = {
  openai,
  isConfigured
}; 