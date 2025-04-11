import { cleanupExpiredCache } from './sqliteCache';
import config from '../config';
import { EventEmitter } from 'events';

let cleanupInterval: NodeJS.Timeout | null = null;
let isCleanupRunning = false;
let lastCleanupTime = 0;
let hasRegisteredHandlers = false;

// Zwiększamy limity słuchaczy dla globalnych obiektów process
if (process && typeof process.setMaxListeners === 'function') {
  process.setMaxListeners(25);
}

/**
 * Start the cache cleanup scheduler
 * This will periodically clean up expired items from the cache
 */
function startCacheCleanup(): void {
  if (cleanupInterval) {
    console.log('Cache cleanup already running, not starting again');
    return;
  }

  const cleanupIntervalMs = config.CACHE.CLEANUP.INTERVAL_MS;
  const expirationSeconds = config.CACHE.CLEANUP.EXPIRATION_SECONDS;
  
  console.log(`Starting cache cleanup scheduler (interval: ${cleanupIntervalMs}ms, expiration: ${expirationSeconds}s)`);
  
  // Set a minimum interval to prevent excessive cleanups
  const actualInterval = Math.max(cleanupIntervalMs, 60000); // Minimum 1 minute
  
  // Run cleanup on a schedule
  cleanupInterval = setInterval(async () => {
    // Skip if another cleanup is still running
    if (isCleanupRunning) {
      console.log('Previous cleanup still running, skipping this iteration');
      return;
    }
    
    // Check if enough time has passed since last cleanup
    const now = Date.now();
    const timeSinceLastCleanup = now - lastCleanupTime;
    
    // Skip if last cleanup was too recent (prevents excessive cleanup in case of clock skew)
    if (lastCleanupTime > 0 && timeSinceLastCleanup < actualInterval * 0.8) {
      console.log(`Last cleanup was ${Math.round(timeSinceLastCleanup / 1000)}s ago, skipping`);
      return;
    }
    
    try {
      isCleanupRunning = true;
      console.log('Running scheduled cache cleanup...');
      
      // Mark the start time
      lastCleanupTime = now;
      
      // Run the cleanup with the configured expiration time
      const deletedCount = await cleanupExpiredCache(expirationSeconds);
      
      console.log(`Scheduled cache cleanup complete (removed ${deletedCount} entries)`);
    } catch (error) {
      console.error('Error in scheduled cache cleanup:', error);
    } finally {
      isCleanupRunning = false;
    }
  }, actualInterval);
  
  // Jeśli setInterval zwraca obiekt EventEmitter, zwiększamy jego limit
  const intervalAsEmitter = cleanupInterval as unknown as EventEmitter;
  if (intervalAsEmitter && typeof intervalAsEmitter.setMaxListeners === 'function') {
    intervalAsEmitter.setMaxListeners(25);
  }
  
  // Register shutdown handlers (only once)
  registerShutdownHandlers();
}

/**
 * Register event handlers for process termination, ensuring they are only registered once
 */
function registerShutdownHandlers() {
  if (!hasRegisteredHandlers) {
    // Add cleanup to be run when process exits - używamy once zamiast on aby uniknąć duplikacji
    process.once('exit', stopCacheCleanup);
    process.once('SIGINT', () => {
      stopCacheCleanup();
    });
    
    // Używamy flagi aby śledzić, czy już zarejestrowaliśmy handlery
    hasRegisteredHandlers = true;
    console.log('Cache cleanup shutdown handlers registered');
  }
}

/**
 * Stop the cache cleanup scheduler
 */
function stopCacheCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('Cache cleanup scheduler stopped');
  }
}

/**
 * Run a one-time cache cleanup
 * @returns {Promise<number>} Number of entries cleaned up
 */
async function runManualCleanup(customExpirationSeconds?: number): Promise<number> {
  if (isCleanupRunning) {
    console.log('Cleanup already running, not starting manual cleanup');
    return 0;
  }
  
  try {
    isCleanupRunning = true;
    console.log('Running manual cache cleanup...');
    
    const expirationSeconds = customExpirationSeconds || config.CACHE.CLEANUP.EXPIRATION_SECONDS;
    lastCleanupTime = Date.now();
    
    const deletedCount = await cleanupExpiredCache(expirationSeconds);
    
    console.log(`Manual cache cleanup complete (removed ${deletedCount} entries)`);
    return deletedCount;
  } catch (error) {
    console.error('Error in manual cache cleanup:', error);
    return 0;
  } finally {
    isCleanupRunning = false;
  }
}

export {
  startCacheCleanup,
  stopCacheCleanup,
  runManualCleanup
}; 