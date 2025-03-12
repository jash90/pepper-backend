import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import { startCacheCleanup } from './lib/cacheCleanup';
import { startScheduler } from './lib/scheduler';

// Import routers
import articlesRouter from './routes/articles';
import categorizeRouter from './routes/categorize';
import supabaseRouter from './routes/supabase';
import cacheRouter from './routes/cache';

// Create Express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
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
  credentials: true // Allow cookies and authentication headers
}));
app.use(morgan('dev')); // Logging
app.use(express.json());

// Routes
app.use('/api/articles', articlesRouter);
app.use('/api/categorize', categorizeRouter);
app.use('/api/supabase', supabaseRouter);
app.use('/api/cache', cacheRouter);

// Health check
app.get('/health', (req: Request, res: Response) => {
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
  res.status(err.status || 500).json({
    error: config.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    stack: config.NODE_ENV === 'production' ? '🥞' : err.stack
  });
});

// Start server
app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  console.log(`http://localhost:${config.PORT}`);
  
  // Start the cache cleanup scheduler
  startCacheCleanup();
  
  // Start the cron job scheduler if enabled
  if (config.ENABLE_SCHEDULER) {
    console.log('Starting scheduled tasks...');
    const scheduledJobs = startScheduler();
    console.log(`Scheduled ${Object.keys(scheduledJobs).length} job(s)`);
    
    // Log the specific jobs that were started
    Object.keys(scheduledJobs).forEach(jobName => {
      console.log(`- ${jobName}: Active`);
    });
  } else {
    console.log('Scheduler is disabled. Set ENABLE_SCHEDULER=true to enable.');
  }
}); 