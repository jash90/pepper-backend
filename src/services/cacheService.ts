import path from 'path';
import fs from 'fs';
import { cacheData, getCachedData, cleanupExpiredCache } from '../lib/sqliteCache';
import config from '../config';

// Initialize cache system
let cacheInitialized = false;

/**
 * Initialize the cache system based on configuration
 * @returns Success indicator
 */
function initializeCache(): boolean {
  try {
    const cacheDir = path.join(__dirname, '../../cache');
    
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    cacheInitialized = true;
    return true;
  } catch (error) {
    console.error('Failed to initialize cache system:', error);
    return false;
  }
}

/**
 * Get a value from the cache
 * @param key - The cache key
 * @returns The cached value or null if not found
 */
async function getCachedValue<T = any>(key: string): Promise<T | null> {
  if (!cacheInitialized) {
    initializeCache();
  }
  
  try {
    // Convert string key to an object param for getCachedData
    return await getCachedData({ key }, config.CACHE.DEFAULTS.TTL) as T;
  } catch (error) {
    console.error(`Error retrieving cached value for key '${key}':`, error);
    return null;
  }
}

/**
 * Set a value in the cache
 * @param key - The cache key
 * @param value - The value to cache
 * @param ttl - Time to live in seconds
 * @returns Success indicator
 */
async function setCachedValue<T = any>(key: string, value: T, ttl = config.CACHE.DEFAULTS.TTL): Promise<boolean> {
  if (!cacheInitialized) {
    initializeCache();
  }
  
  try {
    // Convert string key to an object param for cacheData
    return await cacheData({ key, ttl }, value);
  } catch (error) {
    console.error(`Error caching value for key '${key}':`, error);
    return false;
  }
}

/**
 * Delete a value from the cache
 * @param key - The cache key
 * @returns Success indicator
 */
async function deleteCachedValue(key: string): Promise<boolean> {
  if (!cacheInitialized) {
    initializeCache();
  }
  
  try {
    // To delete a value, we simply set it to null with a very short TTL
    return await cacheData({ key }, null, 1);
  } catch (error) {
    console.error(`Error deleting cached value for key '${key}':`, error);
    return false;
  }
}

/**
 * Clear the entire cache
 * @returns Success indicator
 */
async function clearCache(): Promise<boolean> {
  if (!cacheInitialized) {
    initializeCache();
  }
  
  try {
    // Use a very short TTL (1 second) to effectively clear all cache entries
    await cleanupExpiredCache(1);
    return true;
  } catch (error) {
    console.error('Error clearing cache:', error);
    return false;
  }
}

/**
 * Check if cache is using fallback (in-memory) mode
 * @returns True if using fallback cache
 */
function isUsingFallbackCache(): boolean {
  // Currently we can't determine this directly, so return false
  return false;
}

// Initialize on module load
initializeCache();

export {
  getCachedValue,
  setCachedValue,
  deleteCachedValue,
  clearCache,
  isUsingFallbackCache,
}; 