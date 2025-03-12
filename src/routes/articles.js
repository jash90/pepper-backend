const express = require('express');
const router = express.Router();
const articlesService = require('../services/articlesService');

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
    
    // Fetch articles from pepper.pl using the service
    const articles = await articlesService.fetchArticlesFromPage(pageNumber);
    
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
    
    // Fetch articles from multiple pages using the service
    const allArticles = await articlesService.fetchArticlesFromMultiplePages(pagesToFetch);
    
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
    
    // Generate API base URL for internal requests
    const apiBaseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Call the service to fetch, categorize and cache articles
    const result = await articlesService.fetchCategorizeAndCacheArticles({
      maxPages,
      batchSize,
      apiBaseUrl
    });
    
    return res.status(200).json(result);
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
    
    // Get cached articles from the service
    const result = await articlesService.getCachedArticles({
      days,
      limit,
      minCached,
      skipLocalCache
    });
    
    // Check if we need to fallback to fetching from Pepper.pl
    if (minCached !== null && result.stats.totalArticles < minCached) {
      console.log(`Not enough cached articles (${result.stats.totalArticles} < ${minCached}), falling back to fetching from Pepper.pl...`);
      
      // Redirect to the fetch-categorize-cache endpoint with the specified parameters
      return res.redirect(`/api/articles/fetch-categorize-cache?maxPages=${fallbackPages}`);
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