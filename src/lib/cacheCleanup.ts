import { cleanupExpiredCache } from './sqliteCache';
import config from '../config';

/**
 * Start periodic cache cleanup
 * @returns Interval ID for the cleanup timer
 */
export function startCacheCleanup(): NodeJS.Timeout {
  const cleanupIntervalMs = config.CACHE_CLEANUP_INTERVAL_MS;
  const expirationSeconds = config.CACHE_EXPIRATION_SECONDS;
  
  console.log(`Starting cache cleanup scheduler (interval: ${cleanupIntervalMs}ms, expiration: ${expirationSeconds}s)`);
  
  // Run cleanup immediately and then at intervals
  cleanupExpiredCache(expirationSeconds)
    .catch((err: Error) => {
      console.error('Error during initial cache cleanup:', err);
    });
  
  // Schedule periodic cleanup
  const intervalId = setInterval(() => {
    console.log('Running scheduled cache cleanup...');
    cleanupExpiredCache(expirationSeconds)
      .catch((err: Error) => {
        console.error('Error during scheduled cache cleanup:', err);
      });
  }, cleanupIntervalMs);
  
  // Return interval ID so it can be cleared if needed
  return intervalId;
} 