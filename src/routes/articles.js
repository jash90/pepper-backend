const express = require('express');
const router = express.Router();
const { scrapeArticlesFromPepper } = require('../lib/scraper');
const { serviceClient, createUniqueId, toArticle } = require('../lib/supabase');
const { cacheData, getCachedData } = require('../lib/sqliteCache');

/**
 * @route GET /api/articles
 * @desc Pobiera artykuły z Pepper.pl
 * @access Public
 * @query {number} page - Numer strony do pobrania
 */
router.get('/', async (req, res) => {
  try {
    // Get the page number from the query string, default to 1
    const pageNumber = parseInt(req.query.page, 10) || 1;
    
    // Fetch articles from pepper.pl
    console.log(`Fetching articles from page ${pageNumber}...`);
    const articles = await scrapeArticlesFromPepper(pageNumber);
    
    // Return the articles
    return res.status(200).json({ articles });
  } catch (error) {
    console.error('Error in API handler:', error);
    return res.status(500).json({ 
      articles: null, 
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    });
  }
});

/**
 * @route GET /api/articles/multi
 * @desc Pobiera artykuły z wielu stron Pepper.pl
 * @access Public
 * @query {number} pages - Liczba stron do pobrania (domyślnie 3)
 */
router.get('/multi', async (req, res) => {
  try {
    const pagesToFetch = parseInt(req.query.pages, 10) || 3;
    
    if (pagesToFetch > 10) {
      return res.status(400).json({
        articles: null,
        error: 'Za duża liczba stron do pobrania (max 10)'
      });
    }
    
    console.log(`Fetching articles from ${pagesToFetch} pages...`);
    
    const fetchPromises = [];
    for (let i = 1; i <= pagesToFetch; i++) {
      fetchPromises.push(scrapeArticlesFromPepper(i));
    }
    
    const results = await Promise.all(fetchPromises);
    
    let allArticles = [];
    results.forEach(result => {
      if (result && Array.isArray(result)) {
        allArticles = [...allArticles, ...result];
      }
    });
    
    if (allArticles.length === 0) {
      return res.status(404).json({
        articles: null,
        error: 'No articles found'
      });
    }
    
    return res.status(200).json({
      articles: allArticles,
      pagesFetched: pagesToFetch,
      totalArticles: allArticles.length
    });
  } catch (error) {
    console.error('Error in multi-page fetch:', error);
    return res.status(500).json({
      articles: null,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

/**
 * @route GET /api/articles/fetch-categorize-cache
 * @desc Pobiera artykuły z 10 stron Pepper.pl (wszystkie strony), kategoryzuje je i zapisuje do cache w Supabase
 * @access Public
 * @query {number} maxPages - Opcjonalny limit maksymalnej liczby stron (domyślnie 10)
 * @query {number} batchSize - Rozmiar paczki artykułów do kategoryzacji (domyślnie 50)
 */
router.get('/fetch-categorize-cache', async (req, res) => {
  try {
    // Default to 10 pages (all pages) but allow override with maxPages parameter
    const maxPages = req.query.maxPages ? parseInt(req.query.maxPages, 10) : 10;
    // Default batch size for categorization (to avoid payload too large errors)
    const batchSize = req.query.batchSize ? parseInt(req.query.batchSize, 10) : 50;
    
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(503).json({
        error: 'Cache service unavailable: Supabase not configured'
      });
    }
    
    console.log(`Fetching ${maxPages} pages from Pepper.pl...`);
    
    // 1. Fetch articles from specified number of Pepper pages
    let allArticles = [];
    const fetchPromises = [];
    
    // Create an array of promises to fetch all pages in parallel
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
      fetchPromises.push(
        scrapeArticlesFromPepper(pageNumber)
          .then(articlesFromPage => {
            if (articlesFromPage && Array.isArray(articlesFromPage) && articlesFromPage.length > 0) {
              console.log(`Received ${articlesFromPage.length} articles from page ${pageNumber}`);
              return articlesFromPage;
            }
            console.log(`No articles found on page ${pageNumber}`);
            return [];
          })
          .catch(error => {
            console.error(`Error fetching page ${pageNumber}:`, error);
            return []; // Return empty array on error to keep the Promise.all working
          })
      );
    }
    
    // Wait for all pages to be fetched
    const results = await Promise.all(fetchPromises);
    
    // Combine all results
    results.forEach(articlesFromPage => {
      if (articlesFromPage.length > 0) {
        allArticles = [...allArticles, ...articlesFromPage];
      }
    });
    
    if (allArticles.length === 0) {
      return res.status(404).json({
        error: 'No articles found'
      });
    }
    
    console.log(`Successfully fetched a total of ${allArticles.length} articles from ${maxPages} pages`);
    
    // 2. Send articles for categorization in batches to avoid "request entity too large" errors
    // Note: The categorize endpoint automatically saves categorized articles to Supabase cache
    console.log(`Categorizing articles and saving to Supabase in batches of ${batchSize}...`);
    
    // Create batches of articles
    const batches = [];
    for (let i = 0; i < allArticles.length; i += batchSize) {
      batches.push(allArticles.slice(i, i + batchSize));
    }
    
    console.log(`Created ${batches.length} batches for categorization and caching`);
    
    // Process each batch - each batch will be categorized and saved to Supabase
    let allCategorizedArticles = {};
    let totalFromCache = 0;
    let newlySavedToSupabase = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`Processing batch ${i+1}/${batches.length} (${batch.length} articles)...`);
      
      try {
        // This call to the categorize endpoint will automatically save new articles to Supabase
        const categorizeResponse = await fetch(`${req.protocol}://${req.get('host')}/api/categorize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ articles: batch }),
        });
        
        if (!categorizeResponse.ok) {
          const categorizeError = await categorizeResponse.json();
          console.error(`Error in batch ${i+1}:`, categorizeError.error);
          continue; // Skip this batch if there's an error, but continue with others
        }
        
        const { categorizedArticles, fromCache } = await categorizeResponse.json();
        
        // Articles not found in cache are newly saved to Supabase by the categorize endpoint
        if (fromCache) {
          totalFromCache += batch.length;
        } else {
          // If not from cache, then these articles were newly categorized and saved
          newlySavedToSupabase += batch.length;
        }
        
        // Merge the results with the existing categorized articles
        Object.keys(categorizedArticles).forEach(category => {
          if (!allCategorizedArticles[category]) {
            allCategorizedArticles[category] = [];
          }
          allCategorizedArticles[category] = [
            ...allCategorizedArticles[category],
            ...categorizedArticles[category]
          ];
        });
        
        console.log(`Batch ${i+1} processed and saved to Supabase successfully`);
        
        // Add a small delay between batches to avoid overwhelming the API
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (batchError) {
        console.error(`Error processing batch ${i+1}:`, batchError);
        // Continue with next batch despite error
      }
    }
    
    // Count total categorized articles
    const totalCategorizedArticles = Object.keys(allCategorizedArticles).reduce(
      (total, category) => total + allCategorizedArticles[category].length, 0
    );
    
    if (totalCategorizedArticles === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to categorize any articles'
      });
    }
    
    // 3. Return the results
    return res.status(200).json({
      success: true,
      categorizedArticles: allCategorizedArticles,
      stats: {
        pagesFetched: maxPages,
        totalArticles: allArticles.length,
        totalCategorized: totalCategorizedArticles,
        categoriesCount: Object.keys(allCategorizedArticles).length,
        categories: Object.keys(allCategorizedArticles),
        batchesProcessed: batches.length,
        articlesFromCache: totalFromCache,
        newlySavedToSupabase: newlySavedToSupabase,
        percentFromCache: allArticles.length > 0 
          ? Math.round((totalFromCache / allArticles.length) * 100) 
          : 0
      }
    });
    
  } catch (error) {
    console.error('Error in fetch-categorize-cache:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

/**
 * @route GET /api/articles/cached
 * @desc Pobiera skategoryzowane artykuły z cache (lokalnego SQLite lub Supabase), z opcją fallbacku do pobierania z Pepper.pl
 * @access Public
 * @query {number} days - Liczba dni danych do pobrania (domyślnie 7)
 * @query {number} limit - Maksymalna liczba wyników (domyślnie 500)
 * @query {number} minCached - Minimalna liczba artykułów oczekiwanych w cache, jeśli mniej - użyj fallbacku (opcjonalnie)
 * @query {number} fallbackPages - Liczba stron do pobrania w przypadku fallbacku (domyślnie 7)
 * @query {boolean} skipLocalCache - Czy pominąć lokalny cache SQLite (domyślnie false)
 */
router.get('/cached', async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const limit = parseInt(req.query.limit, 10) || 500;
    const minCached = req.query.minCached ? parseInt(req.query.minCached, 10) : null;
    const fallbackPages = parseInt(req.query.fallbackPages, 10) || 7;
    const skipLocalCache = req.query.skipLocalCache === 'true';
    
    if (limit > 1000) {
      return res.status(400).json({
        error: 'Invalid request: limit must be less than or equal to 1000'
      });
    }
    
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(503).json({
        error: 'Cache service unavailable: Supabase not configured'
      });
    }
    
    // Set up cache parameters for both SQLite and Supabase
    const cacheParams = {
      days,
      limit,
      endpoint: 'articles_cached'
    };
    
    // Define cache expiration time in seconds (1 hour = 3600 seconds)
    const CACHE_EXPIRATION = 3600;
    
    // 1. Check local SQLite cache first unless skipLocalCache is true
    let cachedResult = null;
    if (!skipLocalCache) {
      console.log('Checking local SQLite cache...');
      try {
        cachedResult = await getCachedData(cacheParams, CACHE_EXPIRATION);
        
        if (cachedResult) {
          console.log('✅ Local cache hit! Returning data from SQLite cache');
          
          // Add a flag to indicate the data came from the local cache
          if (cachedResult.stats) {
            cachedResult.stats.fromLocalCache = true;
          }
          
          return res.status(200).json(cachedResult);
        }
        
        console.log('Local cache miss, will query Supabase');
      } catch (sqliteError) {
        console.error('Error querying local SQLite cache:', sqliteError);
        console.log('Will continue with Supabase cache due to SQLite error');
      }
    } else {
      console.log('Skipping local cache as requested');
    }
    
    // 2. If not in local cache, proceed with Supabase cache query
    console.log(`Fetching cached articles from Supabase not older than ${days} days`);
    
    // Calculate the date for filtering
    const oldestDate = new Date();
    oldestDate.setDate(oldestDate.getDate() - days);
    const oldestDateIso = oldestDate.toISOString();
    
    const { data, error } = await serviceClient
      .from('categorized_articles')
      .select('*')
      .gte('created_at', oldestDateIso)
      .order('created_at', { ascending: false })
      .limit(limit);
      
    if (error) {
      console.error('Supabase query error:', error);
      return res.status(500).json({
        error: 'Error querying cache'
      });
    }
    
    // Convert Supabase records to our application's format
    const categorizedArticles = {};
    
    (data || []).forEach((cachedArticle) => {
      const article = toArticle(cachedArticle);
      const category = cachedArticle.category;
      
      if (!categorizedArticles[category]) {
        categorizedArticles[category] = [];
      }
      
      categorizedArticles[category].push(article);
    });
    
    // Calculate some stats
    const totalArticles = (data || []).length;
    const categories = Object.keys(categorizedArticles);
    
    // Check if we need to fallback to fetching from Pepper.pl
    if (minCached !== null && totalArticles < minCached) {
      console.log(`Not enough cached articles (${totalArticles} < ${minCached}), falling back to fetching from Pepper.pl...`);
      
      // Redirect to the fetch-categorize-cache endpoint with the specified parameters
      return res.redirect(`/api/articles/fetch-categorize-cache?maxPages=${fallbackPages}`);
    }
    
    // Prepare the response
    const result = {
      categorizedArticles,
      stats: {
        totalArticles,
        categories,
        categoriesCount: categories.length,
        daysRetrieved: days,
        fromDate: oldestDateIso,
        fromCache: true,
        fromLocalCache: false,
        minCachedRequirement: minCached !== null ? `${totalArticles}/${minCached}` : 'not specified'
      }
    };
    
    // 3. Store the result in local SQLite cache for future requests
    if (!skipLocalCache && totalArticles > 0) {
      console.log('Storing results in local SQLite cache');
      try {
        await cacheData(cacheParams, result);
      } catch (cacheError) {
        console.error('Failed to store in local cache, but continuing:', cacheError);
        // Non-fatal error, we can still return the data even if caching fails
      }
    }
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching cached articles:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

module.exports = router; 