require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { startCacheCleanup } = require('./lib/cacheCleanup');

// Import routers
const articlesRouter = require('./routes/articles');
const categorizeRouter = require('./routes/categorize');
const supabaseRouter = require('./routes/supabase');
const cacheRouter = require('./routes/cache');

// Create Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // Define allowed origins
    const allowedOrigins = [
      'http://localhost:3000', 
      'http://localhost:3006'
    ];
    
    // Check if CORS_ORIGIN is set in env, add it to allowed origins
    if (process.env.CORS_ORIGIN) {
      // Split by comma if there are multiple origins in the env variable
      const envOrigins = process.env.CORS_ORIGIN.split(',').map(o => o.trim());
      allowedOrigins.push(...envOrigins);
    }
    
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
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Pepper.pl API Server',
    version: '1.0.0',
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
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  
  // Start the cache cleanup scheduler
  startCacheCleanup();
}); 