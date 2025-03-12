const path = require('path');
const fs = require('fs');
const { cacheData, getCachedData, cleanupExpiredCache } = require('../lib/sqliteCache');
const config = require('../config');

// Initialize cache system
let cacheInitialized = false;

/**
 * Initialize the cache system based on configuration
 */
function initializeCache() {
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
 * @param {string} key - The cache key
 * @returns {Promise<any>} The cached value or null if not found
 */
async function getCachedValue(key) {
  if (!cacheInitialized) {
    initializeCache();
  }
  
  try {
    // Convert string key to an object param for getCachedData
    return await getCachedData({ key }, config.CACHE.DEFAULTS.TTL);
  } catch (error) {
    console.error(`Error retrieving cached value for key '${key}':`, error);
    return null;
  }
}

/**
 * Set a value in the cache
 * @param {string} key - The cache key
 * @param {any} value - The value to cache
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<boolean>} Success indicator
 */
async function setCachedValue(key, value, ttl = config.CACHE.DEFAULTS.TTL) {
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
 * @param {string} key - The cache key
 * @returns {Promise<boolean>} Success indicator
 */
async function deleteCachedValue(key) {
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
 * @returns {Promise<boolean>} Success indicator
 */
async function clearCache() {
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
 * @returns {boolean} True if using fallback cache
 */
function isUsingFallbackCache() {
  // Currently we can't determine this directly, so return false
  return false;
}

// Initialize on module load
initializeCache();

module.exports = {
  getCachedValue,
  setCachedValue,
  deleteCachedValue,
  clearCache,
  isUsingFallbackCache,
};
