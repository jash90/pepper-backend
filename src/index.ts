import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import config from './config';
import { startCacheCleanup } from './lib/cacheCleanup';
import { startScheduler, stopScheduler } from './lib/scheduler';
import { EventEmitter } from 'events';

// Increase Node's event emitter limit to avoid warnings
EventEmitter.defaultMaxListeners = 25;

// Utworzone zadania cron, które będziemy musieli zatrzymać przy zamykaniu aplikacji
let scheduledJobs: Record<string, any> = {};

// Import routers
import articlesRouter from './routes/articles';
import categorizeRouter from './routes/categorize';
import supabaseRouter from './routes/supabase';
import cacheRouter from './routes/cache';

// Create Express app
const app = express();

// Compression middleware - compress all responses
app.use(compression({
  // Filter out small responses
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  // Compression level (0-9), where 6 is a good balance between compression and CPU usage
  level: 6
}));

// Security middleware
app.use(helmet()); 

// CORS configuration
app.use(cors({
  origin: function(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // Define allowed origins using our structured config
    const allowedOrigins = [
      ...config.SERVER.CORS.DEFAULT_ORIGINS,
      ...config.SERVER.CORS.ADDITIONAL_ORIGINS
    ];
    
    // Check if the origin is allowed
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true, // Allow cookies and authentication headers
  maxAge: 86400 // Cache CORS preflight request results for 24 hours
}));

// Logging middleware with performance optimizations
if (config.NODE_ENV === 'production') {
  // Use minimal logging in production
  app.use(morgan('tiny'));
} else {
  // More detailed logging in development
  app.use(morgan('dev')); 
}

// Body parser middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Add global response caching headers where applicable
app.use((req: Request, res: Response, next: NextFunction) => {
  // Only apply cache headers to GET and HEAD requests
  if (req.method === 'GET' || req.method === 'HEAD') {
    // Default cache time of 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300');
    // Add timestamp for when response was generated
    res.setHeader('X-Generated-At', new Date().toISOString());
  } else {
    // No caching for mutation requests
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Routes
app.use('/api/articles', articlesRouter);
app.use('/api/categorize', categorizeRouter);
app.use('/api/supabase', supabaseRouter);
app.use('/api/cache', cacheRouter);

// Health check
app.get('/health', (req: Request, res: Response) => {
  // Don't cache health check results
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV
  });
});

// Root route
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Pepper.pl API Server',
    version: '1.0.0',
    environment: config.NODE_ENV,
    endpoints: [
      { path: '/api/articles', description: 'Fetch articles from Pepper.pl' },
      { path: '/api/categorize', description: 'Categorize articles with AI' },
      { path: '/api/supabase', description: 'Supabase connection utilities' },
      { path: '/api/cache', description: 'Cache management' },
      { path: '/health', description: 'Server health check' },
    ]
  });
});

// Error handler
interface ErrorWithStatus extends Error {
  status?: number;
}

app.use((err: ErrorWithStatus, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  // Don't cache error responses
  res.setHeader('Cache-Control', 'no-store');
  res.status(err.status || 500).json({
    error: config.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    stack: config.NODE_ENV === 'production' ? '🥞' : err.stack
  });
});

// Create a single handler for cleanup to avoid duplicate event listeners
let isShuttingDown = false;
const gracefulShutdown = async () => {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }
  
  isShuttingDown = true;
  console.log('Received shutdown signal, closing connections...');
  
  // Close all database connections and scheduled jobs
  try {
    // Zatrzymaj wszystkie zaplanowane zadania
    stopScheduler(scheduledJobs);
    
    // Wymuszamy garbage collection, jeśli jest dostępne
    if (global.gc) {
      try {
        global.gc();
      } catch (gcError) {
        console.warn('Error during manual garbage collection:', gcError);
      }
    }
    
    console.log('Connections closed successfully');
  } catch (error) {
    console.error('Error during shutdown:', error);
  }
  
  console.log('Shutdown complete, exiting process');
  
  // Jeśli węzeł został wywołany z --inspect, możemy wyjść nieczysto, aby debugger się nie zawieszał
  if (process.execArgv.some(arg => arg.includes('--inspect'))) {
    console.log('Detected inspector, forcing exit');
    process.exit(0);
  }
};

// Usuń wszystkie istniejące handlery przed dodaniem nowych
// (może to pomóc w problemach z MaxListeners)
process.removeAllListeners('SIGINT');
process.removeAllListeners('SIGTERM');

// Handle shutdown signals - use .once to ensure each listener is only registered once
process.once('SIGINT', gracefulShutdown);
process.once('SIGTERM', gracefulShutdown);

// Start server
const server = app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  console.log(`http://localhost:${config.PORT}`);
  
  // Start the cache cleanup scheduler
  startCacheCleanup();
  
  // Start the cron job scheduler if enabled
  if (config.ENABLE_SCHEDULER) {
    console.log('Starting scheduled tasks...');
    scheduledJobs = startScheduler();
    console.log(`Scheduled ${Object.keys(scheduledJobs).length} job(s)`);
    
    // Log the specific jobs that were started
    Object.keys(scheduledJobs).forEach(jobName => {
      console.log(`- ${jobName}: Active`);
    });
  } else {
    console.log('Scheduler is disabled. Set ENABLE_SCHEDULER=true to enable.');
  }
});

// Zwiększ limit słuchaczy dla serwera HTTP
if (server && typeof server.setMaxListeners === 'function') {
  server.setMaxListeners(25);
} 