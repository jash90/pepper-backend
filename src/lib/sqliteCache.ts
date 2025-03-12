import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Type definitions
type BetterSQLite3DB = {
  prepare: (sql: string) => {
    run: (...params: any[]) => { changes: number };
    get: (...params: any[]) => any;
  };
  exec: (sql: string) => void;
};

type SQLite3DB = {
  run: (sql: string, params: any[], callback?: Function) => void;
  get: (sql: string, params: any[], callback?: Function) => void;
};

type DatabaseInfo = {
  db: BetterSQLite3DB | SQLite3DB | null;
  dbType: 'better-sqlite3' | 'sqlite3' | 'none';
};

// Ensure the cache directory exists
const cacheDir = path.join(__dirname, '../../cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// SQLite database path
const dbPath = path.join(cacheDir, 'local_cache.db');
let db: BetterSQLite3DB | SQLite3DB | null = null;
let dbType: 'better-sqlite3' | 'sqlite3' | 'none' = 'none'; // Track which SQLite implementation we're using

/**
 * Try to initialize better-sqlite3 first, then fallback to sqlite3 if it fails
 */
function initializeDatabase(): Promise<DatabaseInfo> {
  // Already initialized
  if (db) return Promise.resolve({ db, dbType });

  return new Promise((resolve, reject) => {
    try {
      console.log(`Initializing SQLite cache database at ${dbPath}`);
      
      // Try better-sqlite3 first (faster but might have compatibility issues)
      try {
        // Using require for these modules since they might not be available
        // and we have a fallback mechanism
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const BetterSQLite3 = require('better-sqlite3');
        db = new BetterSQLite3(dbPath) as BetterSQLite3DB;
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
        console.warn('Failed to initialize better-sqlite3, trying standard sqlite3 fallback:', 
          betterSqliteError instanceof Error ? betterSqliteError.message : 'Unknown error');
        
        // If better-sqlite3 fails, fall back to regular sqlite3
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const sqlite3 = require('sqlite3').verbose();
        
        // Create sqlite3 database
        db = new sqlite3.Database(dbPath, (err: Error | null) => {
          if (err) {
            reject(err);
            return;
          }
          
          dbType = 'sqlite3';
          console.log('Using standard sqlite3 for local caching (more compatible)');
          
          // Create tables and indexes
          (db as SQLite3DB).run(`
            CREATE TABLE IF NOT EXISTS articles_cache (
              request_hash TEXT PRIMARY KEY,
              data TEXT NOT NULL,
              created_at INTEGER NOT NULL
            )
          `, [], function(err: Error | null) {
            if (err) {
              reject(err);
              return;
            }
            
            (db as SQLite3DB).run(`
              CREATE INDEX IF NOT EXISTS idx_created_at ON articles_cache(created_at)
            `, [], function(err: Error | null) {
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
function generateRequestHash(params: Record<string, any>): string {
  const sortedParams = Object.keys(params).sort().map(key => `${key}:${params[key]}`).join('|');
  return crypto.createHash('md5').update(sortedParams).digest('hex');
}

/**
 * Store data in the SQLite cache
 * @param {Object} params - Request parameters used to generate the cache key
 * @param {Object} data - Data to cache
 * @returns {Promise<boolean>} - Whether the operation succeeded
 */
async function cacheData(params: Record<string, any>, data: any): Promise<boolean> {
  try {
    const dbInfo = await initializeDatabase();
    if (!dbInfo.db) return false;
    
    const requestHash = generateRequestHash(params);
    const jsonData = JSON.stringify(data);
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    
    if (dbInfo.dbType === 'better-sqlite3') {
      (dbInfo.db as BetterSQLite3DB).prepare('INSERT OR REPLACE INTO articles_cache (request_hash, data, created_at) VALUES (?, ?, ?)')
        .run(requestHash, jsonData, now);
      
      console.log(`Data cached with key ${requestHash} using better-sqlite3`);
      return true;
    } else if (dbInfo.dbType === 'sqlite3') {
      return new Promise((resolve) => {
        (dbInfo.db as SQLite3DB).run(
          'INSERT OR REPLACE INTO articles_cache (request_hash, data, created_at) VALUES (?, ?, ?)',
          [requestHash, jsonData, now],
          function(err: Error | null) {
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
async function getCachedData(params: Record<string, any>, maxAgeSeconds = 3600): Promise<any | null> {
  try {
    const dbInfo = await initializeDatabase();
    if (!dbInfo.db) return null;
    
    const requestHash = generateRequestHash(params);
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const minTimestamp = now - maxAgeSeconds;
    
    if (dbInfo.dbType === 'better-sqlite3') {
      const row = (dbInfo.db as BetterSQLite3DB).prepare('SELECT data, created_at FROM articles_cache WHERE request_hash = ? AND created_at > ?')
        .get(requestHash, minTimestamp);
      
      if (!row) {
        console.log(`No valid cache found for key ${requestHash}`);
        return null;
      }
      
      console.log(`Cache hit for key ${requestHash}, created ${now - row.created_at} seconds ago`);
      return JSON.parse(row.data);
    } else if (dbInfo.dbType === 'sqlite3') {
      return new Promise((resolve) => {
        (dbInfo.db as SQLite3DB).get(
          'SELECT data, created_at FROM articles_cache WHERE request_hash = ? AND created_at > ?',
          [requestHash, minTimestamp],
          function(err: Error | null, row: { data: string; created_at: number } | undefined) {
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
async function cleanupExpiredCache(maxAgeSeconds = 3600): Promise<number> {
  try {
    const dbInfo = await initializeDatabase();
    if (!dbInfo.db) return 0;
    
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    const minTimestamp = now - maxAgeSeconds;
    
    if (dbInfo.dbType === 'better-sqlite3') {
      const result = (dbInfo.db as BetterSQLite3DB).prepare('DELETE FROM articles_cache WHERE created_at <= ?')
        .run(minTimestamp);
      
      console.log(`Cleaned up ${result.changes} expired cache entries using better-sqlite3`);
      return result.changes;
    } else if (dbInfo.dbType === 'sqlite3') {
      return new Promise((resolve) => {
        (dbInfo.db as SQLite3DB).run(
          'DELETE FROM articles_cache WHERE created_at <= ?',
          [minTimestamp],
          function(this: { changes: number }, err: Error | null) {
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
export {
  cacheData,
  getCachedData,
  cleanupExpiredCache
}; 