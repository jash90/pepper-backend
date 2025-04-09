import { OpenAI } from 'openai';
import config from '../config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Define types
interface CompletionOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  systemMessage?: string;
  useCache?: boolean;
  cacheTTL?: number; // Czas życia cache w sekundach
  [key: string]: any;
}

interface OpenAIConfig {
  API_KEY: string;
  ORGANIZATION?: string;
  MODEL?: string;
}

interface CacheEntry {
  result: string;
  timestamp: number;
}

let openai: OpenAI | null = null;

// Cache dla zapytań, aby uniknąć niepotrzebnych wywołań API
const memoryCache = new Map<string, CacheEntry>();

// Ścieżka do pliku cache na dysku
const CACHE_DIR = path.join(__dirname, '../../cache');
const OPENAI_CACHE_FILE = path.join(CACHE_DIR, 'openai_cache.json');

// Załaduj cache z dysku przy uruchomieniu
function loadCacheFromDisk(): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    
    if (fs.existsSync(OPENAI_CACHE_FILE)) {
      const data = fs.readFileSync(OPENAI_CACHE_FILE, 'utf8');
      const cache = JSON.parse(data);
      
      // Konwertuj cache z formatu zapisu do Map
      Object.entries(cache).forEach(([key, value]) => {
        memoryCache.set(key, value as CacheEntry);
      });
      
      console.log(`Loaded ${memoryCache.size} OpenAI cache entries from disk`);
    }
  } catch (error) {
    console.error('Error loading OpenAI cache from disk:', error);
  }
}

// Zapisz cache na dysk okresowo
function saveCacheToDisk(): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    
    // Konwertuj Map do prostego obiektu przed zapisem
    const cacheObject: Record<string, CacheEntry> = {};
    memoryCache.forEach((value, key) => {
      cacheObject[key] = value;
    });
    
    fs.writeFileSync(OPENAI_CACHE_FILE, JSON.stringify(cacheObject, null, 2));
    console.log(`Saved ${memoryCache.size} OpenAI cache entries to disk`);
  } catch (error) {
    console.error('Error saving OpenAI cache to disk:', error);
  }
}

// Automatyczne zapisywanie cache co godzinę
const SAVE_INTERVAL_MS = 3600 * 1000; // 1 godzina
setInterval(saveCacheToDisk, SAVE_INTERVAL_MS);

// Funkcja czyszcząca cache
export function clearOpenAICache(): void {
  memoryCache.clear();
  console.log('OpenAI cache cleared');
  saveCacheToDisk();
}

// Funkcja czyszcząca przeterminowane wpisy w cache
export function cleanupExpiredCache(maxAgeSeconds: number = 86400): number {
  const now = Date.now();
  let deletedCount = 0;
  
  memoryCache.forEach((entry, key) => {
    if (now - entry.timestamp > maxAgeSeconds * 1000) {
      memoryCache.delete(key);
      deletedCount++;
    }
  });
  
  if (deletedCount > 0) {
    console.log(`Cleaned up ${deletedCount} expired OpenAI cache entries`);
    saveCacheToDisk();
  }
  
  return deletedCount;
}

// Generuj hash dla zapytań
function generateCacheKey(prompt: string, options: CompletionOptions): string {
  const optionsForHash = {
    model: options.model,
    temperature: options.temperature,
    max_tokens: options.max_tokens,
    systemMessage: options.systemMessage
  };
  
  const dataToHash = `${prompt}|${JSON.stringify(optionsForHash)}`;
  return crypto.createHash('md5').update(dataToHash).digest('hex');
}

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
        organization: openaiConfig.ORGANIZATION,
        maxRetries: 3, // Automatyczne ponowne próby w przypadku błędów API
        timeout: 30000 // 30s timeout
      });
      
      // Załaduj cache przy inicjalizacji
      loadCacheFromDisk();
      
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
  
  // Sprawdź cache, jeśli użytkownik nie wyłączył go jawnie
  const useCache = options.useCache !== false;
  if (useCache) {
    const cacheKey = generateCacheKey(prompt, options);
    const cachedEntry = memoryCache.get(cacheKey);
    
    if (cachedEntry) {
      const now = Date.now();
      const cacheTTL = options.cacheTTL || 86400; // 24 godziny domyślnie
      
      // Sprawdź, czy wpis nie jest przeterminowany
      if (now - cachedEntry.timestamp < cacheTTL * 1000) {
        console.log('Using cached OpenAI response');
        return cachedEntry.result;
      } else {
        // Usuń przeterminowany wpis
        memoryCache.delete(cacheKey);
      }
    }
  }
  
  const defaultOptions = {
    model: options.model || openaiConfig?.MODEL || 'gpt-3.5-turbo',
    temperature: options.temperature || 0.3, // Niższa temperatura dla bardziej przewidywalnych wyników
    max_tokens: options.max_tokens || 200, // Mniejszy limit tokenów dla oszczędności
    frequency_penalty: 0.2, // Redukcja powtórzeń
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

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No completion content returned from OpenAI');
    }

    const result = content.trim();
    
    // Zapisz do cache jeśli jest włączone
    if (useCache) {
      const cacheKey = generateCacheKey(prompt, options);
      memoryCache.set(cacheKey, {
        result,
        timestamp: Date.now()
      });
      
      // Zapisz na dysk po dodaniu nowego wpisu, jeśli cache osiągnęło odpowiedni rozmiar
      if (memoryCache.size % 10 === 0) {
        saveCacheToDisk();
      }
    }

    return result;
  } catch (error) {
    console.error('Error generating completion with OpenAI:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate completion: ${error.message}`);
    }
    throw new Error('Failed to generate completion: Unknown error');
  }
}

// Cleanup expired cache entries every hour
setInterval(() => {
  cleanupExpiredCache();
}, 3600 * 1000);

// Initialize on module load
initializeOpenAI();

// Zapisz cache przed zakończeniem procesu
process.once('SIGINT', () => {
  console.log('Saving OpenAI cache before exit...');
  saveCacheToDisk();
});

process.once('SIGTERM', () => {
  console.log('Saving OpenAI cache before exit...');
  saveCacheToDisk();
}); 