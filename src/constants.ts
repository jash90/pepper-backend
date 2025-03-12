/**
 * Application constants
 */

/**
 * Error codes used throughout the application
 */
export const ERROR_CODES = {
  // General errors
  GENERAL_ERROR: 'GENERAL_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  
  // Service errors
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  OPENAI_NOT_CONFIGURED: 'OPENAI_NOT_CONFIGURED',
  SUPABASE_NOT_CONFIGURED: 'SUPABASE_NOT_CONFIGURED',
  
  // Data errors
  NO_DATA_FOUND: 'NO_DATA_FOUND',
  CACHE_MISS: 'CACHE_MISS',
  
  // Scraper errors
  SCRAPER_ERROR: 'SCRAPER_ERROR',
  
  // Categorization errors
  CATEGORIZATION_ERROR: 'CATEGORIZATION_ERROR',
  
  // Cache errors
  CACHE_ERROR: 'CACHE_ERROR'
}; 