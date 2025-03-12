/**
 * Application Configuration
 * Centralizes all configuration settings and provides sensible defaults
 */

// Load environment variables
require('dotenv').config();

// Cache configuration
const CACHE = {
  // SQLite configuration
  SQLITE: {
    // Directory for the SQLite database file
    DIR: process.env.SQLITE_CACHE_DIR || '../../cache',
    // Filename for the SQLite database
    FILENAME: process.env.SQLITE_CACHE_FILENAME || 'local_cache.db',
    // Whether to use better-sqlite3 (faster) or standard sqlite3 (more compatible)
    PREFER_BETTER_SQLITE: process.env.PREFER_BETTER_SQLITE !== 'false',
    // Whether to use SQLite cache at all
    ENABLED: process.env.USE_SQLITE_CACHE !== 'false' // Default to true
  },
  // Cleanup configuration
  CLEANUP: {
    // Interval for cache cleanup in milliseconds (default: 15 minutes)
    INTERVAL_MS: parseInt(process.env.CACHE_CLEANUP_INTERVAL_MS, 10) || 15 * 60 * 1000,
    // Maximum age of cached data in seconds (default: 1 hour)
    EXPIRATION_SECONDS: parseInt(process.env.CACHE_EXPIRATION_SECONDS, 10) || 60 * 60
  },
  // Default values for cache-related operations
  DEFAULTS: {
    TTL: parseInt(process.env.CACHE_EXPIRATION, 10) || 3600, // Default 1 hour in seconds
    DAYS_TO_CACHE: 7,
    MAX_RESULTS: 500
  }
};

// Server configuration
const SERVER = {
  // Port to listen on
  PORT: process.env.PORT || 3000,
  // Node environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  // CORS origins
  CORS: {
    // Default origins (always allowed)
    DEFAULT_ORIGINS: ['http://localhost:3000', 'http://localhost:3006'],
    // Additional origins from environment variable
    ADDITIONAL_ORIGINS: process.env.CORS_ORIGIN ? 
      process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) : [],
    // For backward compatibility
    ORIGIN: process.env.CORS_ORIGIN || '*',
  },
  // Base URL for the server (used for scheduled tasks)
  BASE_URL: process.env.SERVER_BASE_URL || null
};

// Scheduler configuration
const SCHEDULER = {
  // Enable/disable scheduler
  ENABLED: process.env.ENABLE_SCHEDULER !== 'false', // Default to true
  // Fetch and categorize scheduler settings
  FETCH_CATEGORIZE: {
    // Enable/disable fetch-categorize scheduler
    ENABLED: process.env.ENABLE_FETCH_CATEGORIZE_SCHEDULER !== 'false', // Default to true
    // Maximum number of pages to fetch in scheduled job
    MAX_PAGES: parseInt(process.env.SCHEDULER_FETCH_PAGES, 10) || 1,
    // Whether to use AI for categorization in scheduled job
    USE_AI: process.env.SCHEDULER_USE_AI !== 'false', // Default to true
    // Cron expression for the scheduler (every 10 minutes by default)
    CRON_EXPRESSION: process.env.FETCH_CATEGORIZE_CRON || '*/10 * * * *'
  }
};

// Third-party service configuration
const SERVICES = {
  // Supabase configuration
  SUPABASE: {
    URL: process.env.SUPABASE_URL,
    SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    ANON_KEY: process.env.SUPABASE_ANON_KEY,
    // Check if Supabase is properly configured
    IS_CONFIGURED: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  },
  // OpenAI configuration
  OPENAI: {
    API_KEY: process.env.OPENAI_API_KEY,
    ORGANIZATION: process.env.OPENAI_ORGANIZATION,
    MODEL: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    // Check if OpenAI is properly configured
    IS_CONFIGURED: !!process.env.OPENAI_API_KEY
  }
};

// API limits and defaults
const API = {
  // Articles API
  ARTICLES: {
    // Maximum number of pages that can be fetched at once
    MAX_PAGES: 10,
    // Default number of pages to fetch
    DEFAULT_PAGES: 3,
    // Default batch size for processing
    DEFAULT_BATCH_SIZE: 50,
    // Articles per page from Pepper.pl
    PER_PAGE: 30
  },
  // Article categorization
  CATEGORIZATION: {
    PROMPT: process.env.CATEGORIZATION_PROMPT || 
      'Categorize this product or deal into ONE of the following categories: Electronics, Fashion, Home & Garden, Beauty, Sports, Toys, Food & Beverages, Travel, Services, Other. RESPOND ONLY WITH THE CATEGORY NAME.',
    MAX_BATCH_SIZE: parseInt(process.env.MAX_CATEGORIZATION_BATCH_SIZE, 10) || 50
  },
  // Scraper configuration
  SCRAPER: {
    BASE_URL: process.env.PEPPER_BASE_URL || 'https://www.pepper.pl',
    USER_AGENT: process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0 (compatible; PepperBot/1.0)'
  }
};

// Debug & Development settings
const DEBUG = {
  ENABLED: process.env.DEBUG === 'true',
  VERBOSE_LOGGING: process.env.VERBOSE_LOGGING === 'true'
};

// Create a flat config for backward compatibility
const flatConfig = {
  // Server configuration
  PORT: SERVER.PORT,
  NODE_ENV: SERVER.NODE_ENV,
  
  // API Keys
  OPENAI_API_KEY: SERVICES.OPENAI.API_KEY,
  OPENAI_ORGANIZATION: SERVICES.OPENAI.ORGANIZATION,
  
  // Supabase configuration
  SUPABASE_URL: SERVICES.SUPABASE.URL,
  SUPABASE_KEY: SERVICES.SUPABASE.ANON_KEY,
  SUPABASE_SERVICE_KEY: SERVICES.SUPABASE.SERVICE_KEY,
  
  // Cache configuration
  USE_SQLITE_CACHE: CACHE.SQLITE.ENABLED,
  CACHE_EXPIRATION: CACHE.DEFAULTS.TTL,
  
  // Scraper configuration
  PEPPER_BASE_URL: API.SCRAPER.BASE_URL,
  SCRAPER_USER_AGENT: API.SCRAPER.USER_AGENT,
  
  // CORS configuration
  CORS_ORIGIN: SERVER.CORS.ORIGIN,
  
  // Article categorization
  CATEGORIZATION_PROMPT: API.CATEGORIZATION.PROMPT,
  MAX_CATEGORIZATION_BATCH_SIZE: API.CATEGORIZATION.MAX_BATCH_SIZE,
  
  // Debug & Development
  DEBUG: DEBUG.ENABLED,
  VERBOSE_LOGGING: DEBUG.VERBOSE_LOGGING,
  
  // Default values for various operations
  DEFAULTS: {
    ARTICLES_PER_PAGE: API.ARTICLES.PER_PAGE,
    CACHE_TTL: CACHE.DEFAULTS.TTL,
    MAX_PAGES_TO_FETCH: API.ARTICLES.MAX_PAGES,
    DAYS_TO_CACHE: CACHE.DEFAULTS.DAYS_TO_CACHE,
    MAX_RESULTS: CACHE.DEFAULTS.MAX_RESULTS,
  },
  
  // Scheduler configuration
  ENABLE_SCHEDULER: SCHEDULER.ENABLED,
  ENABLE_FETCH_CATEGORIZE_SCHEDULER: SCHEDULER.FETCH_CATEGORIZE.ENABLED,
  SCHEDULER_FETCH_PAGES: SCHEDULER.FETCH_CATEGORIZE.MAX_PAGES,
  SCHEDULER_USE_AI: SCHEDULER.FETCH_CATEGORIZE.USE_AI,
  FETCH_CATEGORIZE_CRON: SCHEDULER.FETCH_CATEGORIZE.CRON_EXPRESSION,
};

// Export the configuration in both structured and flat formats
module.exports = {
  ...flatConfig, // For backward compatibility
  CACHE,
  SERVER,
  SERVICES,
  API,
  DEBUG,
  SCHEDULER
};
