const { cleanupExpiredCache } = require('./sqliteCache');
const config = require('../config');

/**
 * Start periodic cache cleanup
 */
function startCacheCleanup() {
  const cleanupIntervalMs = config.CACHE.CLEANUP.INTERVAL_MS;
  const expirationSeconds = config.CACHE.CLEANUP.EXPIRATION_SECONDS;
  
  console.log(`Starting cache cleanup scheduler (interval: ${cleanupIntervalMs}ms, expiration: ${expirationSeconds}s)`);
  
  // Run cleanup immediately and then at intervals
  cleanupExpiredCache(expirationSeconds)
    .catch(err => {
      console.error('Error during initial cache cleanup:', err);
    });
  
  // Schedule periodic cleanup
  const intervalId = setInterval(() => {
    console.log('Running scheduled cache cleanup...');
    cleanupExpiredCache(expirationSeconds)
      .catch(err => {
        console.error('Error during scheduled cache cleanup:', err);
      });
  }, cleanupIntervalMs);
  
  // Return interval ID so it can be cleared if needed
  return intervalId;
}

module.exports = {
  startCacheCleanup
}; 