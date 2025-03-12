const { cleanupExpiredCache } = require('./sqliteCache');

// Cache cleanup interval in milliseconds (default: 15 minutes)
const CLEANUP_INTERVAL = process.env.CACHE_CLEANUP_INTERVAL_MS || 15 * 60 * 1000;

// Cache expiration time in seconds (default: 1 hour)
const CACHE_EXPIRATION_SECONDS = process.env.CACHE_EXPIRATION_SECONDS || 60 * 60;

/**
 * Start periodic cache cleanup
 */
function startCacheCleanup() {
  console.log(`Starting cache cleanup scheduler (interval: ${CLEANUP_INTERVAL}ms, expiration: ${CACHE_EXPIRATION_SECONDS}s)`);
  
  // Run cleanup immediately and then at intervals
  cleanupExpiredCache(CACHE_EXPIRATION_SECONDS)
    .catch(err => {
      console.error('Error during initial cache cleanup:', err);
    });
  
  // Schedule periodic cleanup
  const intervalId = setInterval(() => {
    console.log('Running scheduled cache cleanup...');
    cleanupExpiredCache(CACHE_EXPIRATION_SECONDS)
      .catch(err => {
        console.error('Error during scheduled cache cleanup:', err);
      });
  }, CLEANUP_INTERVAL);
  
  // Return interval ID so it can be cleared if needed
  return intervalId;
}

module.exports = {
  startCacheCleanup
}; 