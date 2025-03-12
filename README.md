# Pepper Backend

Backend API service for fetching, categorizing, and caching offers from Pepper.pl. The service uses AI to automatically categorize articles into predefined categories and stores them in Supabase for quick retrieval.

## Features

- **Article Scraping**: Fetch latest deals from Pepper.pl
- **AI Categorization**: Automatically categorize articles using OpenAI
- **Caching System**: Local SQLite and Supabase caching for better performance
- **RESTful API**: Clean API endpoints for accessing articles and categories
- **Scheduled Tasks**: Automated cron jobs for fetching and categorizing articles

## Tech Stack

- Node.js & Express
- Supabase (PostgreSQL)
- OpenAI API
- SQLite (for local caching)
- node-cron (for scheduled tasks)

## Installation

### Prerequisites

- Node.js (v18+)
- npm (v9+)
- Supabase account (optional, for persistent storage)
- OpenAI API key (optional, for AI categorization)

### Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/pepper-backend.git
   cd pepper-backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```
   cp .env.example .env
   ```
   
4. Edit the `.env` file with your configuration values

5. Run the development server:
   ```
   npm run dev
   ```

## Configuration

The application is configured through environment variables (see `.env.example`). Key configuration options:

### Supabase (Optional)
```
SUPABASE_URL=https://your-project-url.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
SUPABASE_ANON_KEY=your-anon-key
```

### OpenAI (Optional)
```
OPENAI_API_KEY=your-openai-api-key
```

### Server Settings
```
PORT=5001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3006
SERVER_BASE_URL=http://localhost:5001
```

### Scheduler Settings
```
ENABLE_SCHEDULER=true
ENABLE_FETCH_CATEGORIZE_SCHEDULER=true
SCHEDULER_FETCH_PAGES=1
SCHEDULER_USE_AI=true
FETCH_CATEGORIZE_CRON=*/10 * * * *
```

## API Endpoints

### Articles

- `GET /api/articles` - Fetch articles from Pepper.pl
  - Query params: `maxPages` (default: 3)

- `GET /api/articles/fetch-categorize-cache` - Fetch articles, categorize them, and cache the results
  - Query params: `maxPages` (default: 1), `useAI` (default: true), `saveToSupabase` (default: true)

### Categories

- `GET /api/categorize` - Categorize provided articles
  - Body: `{ articles: [Article] }`

### Cache

- `GET /api/cache` - Get all cached articles
- `GET /api/cache/category/:category` - Get articles by category

### Supabase

- `GET /api/supabase/status` - Check Supabase connection status

### Other

- `GET /health` - Health check endpoint
- `GET /` - API information

## Scheduled Tasks

The application includes scheduled tasks using node-cron:

### Fetch and Categorize Articles

A cron job that automatically fetches new articles from Pepper.pl, categorizes them using AI, and saves them to the cache at regular intervals (default: every 10 minutes).

Configuration:
```
ENABLE_SCHEDULER=true                # Enable/disable all scheduled tasks
ENABLE_FETCH_CATEGORIZE_SCHEDULER=true   # Enable/disable this specific task
SCHEDULER_FETCH_PAGES=1              # Number of pages to fetch
SCHEDULER_USE_AI=true                # Use AI for categorization
FETCH_CATEGORIZE_CRON=*/10 * * * *   # Cron expression (every 10 minutes)
```

### Cache Cleanup

A scheduled task that removes expired entries from the local cache to prevent it from growing too large.

Configuration:
```
CACHE_CLEANUP_INTERVAL_MS=900000     # Run cleanup every 15 minutes
CACHE_EXPIRATION_SECONDS=3600        # Expire cache entries after 1 hour
```

## Article Categorization

Articles are categorized into predefined categories:

- Electronics
- Home & Household
- Fashion
- Food & Grocery
- Sports & Outdoor
- Beauty & Health
- Travel
- Entertainment
- Kids & Toys
- Automotive
- Services
- Other Deals

If OpenAI API is configured, the application will use it for more accurate categorization. Otherwise, it falls back to keyword-based categorization.

## Development

### Running in Development Mode

```
npm run dev
```

### Tests

```
npm test
```

## License

MIT 