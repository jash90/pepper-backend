const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure the cache directory exists
const cacheDir = path.join(__dirname, '../../cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// SQLite database path
const dbPath = path.join(cacheDir, 'local_cache.db');
let db;
let dbType = 'none'; // Track which SQLite implementation we're using

/**
 * Try to initialize better-sqlite3 first, then fallback to sqlite3 if it fails
 */
function initializeDatabase() {
  // Already initialized
  if (db) return Promise.resolve({ db, dbType });

  return new Promise((resolve, reject) => {
    try {
      console.log(`Initializing SQLite cache database at ${dbPath}`);
      
      // Try better-sqlite3 first (faster but might have compatibility issues)
      try {
        const BetterSQLite3 = require('better-sqlite3');
        db = new BetterSQLite3(dbPath);
        dbType = 'better-sqlite3';
        console.log('Using better-sqlite3 for local caching (faster implementation)');
        
        // Create the tables and indexes
        db.exec(`
          CREATE TABLE IF NOT EXISTS articles_cache (
            request_hash TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_created_at ON articles_cache(created_at);
        `);
        
        console.log('SQLite cache database initialized successfully with better-sqlite3');
        resolve({ db, dbType });
      } catch (betterSqliteError) {
        console.warn('Failed to initialize better-sqlite3, trying standard sqlite3 fallback:', betterSqliteError.message);
        // If better-sqlite3 fails, fall back to regular sqlite3
        const sqlite3 = require('sqlite3').verbose();
        
        // Create sqlite3 database
        db = new sqlite3.Database(dbPath, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          dbType = 'sqlite3';
          console.log('Using standard sqlite3 for local caching (more compatible)');
          
          // Create tables and indexes
          db.run(`
            CREATE TABLE IF NOT EXISTS articles_cache (
              request_hash TEXT PRIMARY KEY,
              data TEXT NOT NULL,
              created_at INTEGER NOT NULL
            )
          `, function(err) {
            if (err) {
              reject(err);
              return;
            }
            
            db.run(`
              CREATE INDEX IF NOT EXISTS idx_created_at ON articles_cache(created_at)
            `, function(err) {
              if (err) {
                reject(err);
                return;
              }
              
              console.log('SQLite cache database initialized successfully with standard sqlite3');
              resolve({ db, dbType });
            });
          });
        });
      }
    } catch (error) {
      console.error('Error initializing SQLite cache:', error);
      db = null;
      dbType = 'none';
      reject(error);
    }
  });
}

/**
 * Generate a hash for the request parameters to use as a cache key
 * @param {Object} params - Request parameters
 * @returns {string} - Hash string
 */
function generateRequestHash(params) {
  const sortedParams = Object.keys(params).sort().map(key => `${key}:${params[key]}`).join('|');
  return crypto.createHash('md5').update(sortedParams).digest('hex');
}

/**
 * Store data in the SQLite cache
 * @param {Object} params - Request parameters used to generate the cache key
 * @param {Object} data - Data to cache
 * @returns {Promise<boolean>} - Whether the operation succeeded
 */
async function cacheData(params, data) {
  try {
    const dbInfo = await initializeDatabase();
    if (!dbInfo.db) return false;
    
    const requestHash = generateRequestHash(params);
    const jsonData = JSON.stringify(data);
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    
    if (dbInfo.dbType === 'better-sqlite3') {
      dbInfo.db.prepare('INSERT OR REPLACE INTO articles_cache (request_hash, data, created_at) VALUES (?, ?, ?)')
        .run(requestHash, jsonData, now);
      
      console.log(`Data cached with key ${requestHash} using better-sqlite3`);
      return true;
    } else if (dbInfo.dbType === 'sqlite3') {
      return new Promise((resolve) => {
        dbInfo.db.run(
          'INSERT OR REPLACE INTO articles_cache (request_hash, data, created_at) VALUES (?, ?, ?)',
          [requestHash, jsonData, now],
          function(err) {
            if (err) {
              console.error('Error caching data with sqlite3:', err);
              resolve(false);
              return;
            }
            console.log(`Data cached with key ${requestHash} using sqlite3`);
            resolve(true);
          }
        );
      });
    } else {
      console.warn('No SQLite implementation available, skipping cache write');
      return false;
    }
  } catch (error) {
    console.error('Error caching data in SQLite:', error);
    return false;
  }
}

/**
 * Retrieve data from the SQLite cache
 * @param {Object} params - Request parameters used to generate the cache key
 * @param {number} maxAgeSeconds - Maximum age of the cached data in seconds (default: 3600 = 1 hour)
 * @returns {Promise<Object|null>} - The cached data or null if not found or expired
 */
async function getCachedData(params, maxAgeSeconds = 3600) {
  try {
    const dbInfo = await initializeDatabase();
    if (!dbInfo.db) return null;
    
    const requestHash = generateRequestHash(params);
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const minTimestamp = now - maxAgeSeconds;
    
    if (dbInfo.dbType === 'better-sqlite3') {
      const row = dbInfo.db.prepare('SELECT data, created_at FROM articles_cache WHERE request_hash = ? AND created_at > ?')
        .get(requestHash, minTimestamp);
      
      if (!row) {
        console.log(`No valid cache found for key ${requestHash}`);
        return null;
      }
      
      console.log(`Cache hit for key ${requestHash}, created ${now - row.created_at} seconds ago`);
      return JSON.parse(row.data);
    } else if (dbInfo.dbType === 'sqlite3') {
      return new Promise((resolve) => {
        dbInfo.db.get(
          'SELECT data, created_at FROM articles_cache WHERE request_hash = ? AND created_at > ?',
          [requestHash, minTimestamp],
          function(err, row) {
            if (err || !row) {
              console.log(`No valid cache found for key ${requestHash}`);
              resolve(null);
              return;
            }
            
            console.log(`Cache hit for key ${requestHash}, created ${now - row.created_at} seconds ago`);
            try {
              resolve(JSON.parse(row.data));
            } catch (parseError) {
              console.error('Error parsing cached data:', parseError);
              resolve(null);
            }
          }
        );
      });
    } else {
      console.warn('No SQLite implementation available, skipping cache read');
      return null;
    }
  } catch (error) {
    console.error('Error retrieving data from SQLite cache:', error);
    return null;
  }
}

/**
 * Clean up expired cache entries
 * @param {number} maxAgeSeconds - Maximum age of the cached data in seconds (default: 3600 = 1 hour)
 * @returns {Promise<number>} - Number of deleted entries
 */
async function cleanupExpiredCache(maxAgeSeconds = 3600) {
  try {
    const dbInfo = await initializeDatabase();
    if (!dbInfo.db) return 0;
    
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const minTimestamp = now - maxAgeSeconds;
    
    if (dbInfo.dbType === 'better-sqlite3') {
      const result = dbInfo.db.prepare('DELETE FROM articles_cache WHERE created_at <= ?')
        .run(minTimestamp);
      
      console.log(`Cleaned up ${result.changes} expired cache entries using better-sqlite3`);
      return result.changes;
    } else if (dbInfo.dbType === 'sqlite3') {
      return new Promise((resolve) => {
        dbInfo.db.run(
          'DELETE FROM articles_cache WHERE created_at <= ?',
          [minTimestamp],
          function(err) {
            if (err) {
              console.error('Error cleaning up cache with sqlite3:', err);
              resolve(0);
              return;
            }
            console.log(`Cleaned up ${this.changes} expired cache entries using sqlite3`);
            resolve(this.changes);
          }
        );
      });
    } else {
      console.warn('No SQLite implementation available, skipping cache cleanup');
      return 0;
    }
  } catch (error) {
    console.error('Error cleaning up expired cache:', error);
    return 0;
  }
}

// Initialize the database when the module is loaded
initializeDatabase()
  .then(() => {
    console.log('SQLite cache initialized successfully during module load');
  })
  .catch(err => {
    console.error('Failed to initialize SQLite database:', err);
  });

// Export the functions
module.exports = {
  cacheData,
  getCachedData,
  cleanupExpiredCache
}; 