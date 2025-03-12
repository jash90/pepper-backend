const express = require('express');
const router = express.Router();
const { serviceClient, createUniqueId, toArticle } = require('../lib/supabase');

/**
 * @route GET /api/cache/lookup
 * @desc Lookup articles in cache by their links
 * @access Public
 * @body {string[]} links - Article links to check
 */
router.post('/lookup', async (req, res) => {
  try {
    const { links } = req.body;
    
    if (!links || !Array.isArray(links)) {
      return res.status(400).json({
        error: 'Invalid request: links must be an array of strings'
      });
    }
    
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(503).json({
        error: 'Cache service unavailable: Supabase not configured'
      });
    }
    
    // Generate article_ids from links
    const articleIds = links.map(link => createUniqueId(link));
    
    // Process in batches to avoid potential Supabase limitations
    const batchSize = 100;
    let allData = [];
    
    for (let i = 0; i < articleIds.length; i += batchSize) {
      const batchIds = articleIds.slice(i, i + batchSize);
      
      const { data, error } = await serviceClient
        .from('categorized_articles')
        .select('*')
        .in('article_id', batchIds);
        
      if (error) {
        console.error('Supabase query error:', error);
        continue; // Continue with next batch
      }
      
      if (data && data.length > 0) {
        allData = [...allData, ...data];
      }
    }
    
    // Convert Supabase records to our application's format
    const cachedArticles = {};
    
    allData.forEach((cachedArticle) => {
      const article = toArticle(cachedArticle);
      const category = cachedArticle.category;
      
      if (!cachedArticles[category]) {
        cachedArticles[category] = [];
      }
      
      cachedArticles[category].push(article);
    });
    
    // Get cached article links for the response
    const cachedLinks = allData.map(item => item.link);
    
    return res.status(200).json({
      cachedLinks,
      cachedArticles,
      totalFound: allData.length
    });
  } catch (error) {
    console.error('Error in cache lookup:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

/**
 * @route GET /api/cache
 * @desc Get categorized articles from cache by date range
 * @access Public
 * @query {number} days - Number of days of data to retrieve (default: 7)
 * @query {number} limit - Maximum number of results to return (default: 500)
 */
router.get('/', async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const limit = parseInt(req.query.limit, 10) || 500;
    
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
    
    // Calculate the date for filtering
    const oldestDate = new Date();
    oldestDate.setDate(oldestDate.getDate() - days);
    const oldestDateIso = oldestDate.toISOString();
    
    console.log(`Fetching articles from cache not older than ${days} days (from ${oldestDateIso})`);
    
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
    
    return res.status(200).json({
      categorizedArticles,
      stats: {
        totalArticles,
        categories,
        categoriesCount: categories.length,
        daysRetrieved: days,
        fromDate: oldestDateIso
      }
    });
  } catch (error) {
    console.error('Error in cache retrieval:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

/**
 * @route DELETE /api/cache/purge
 * @desc Delete cache data
 * @access Public
 * @query {string} mode - Purge mode: "all" or "older_than_days" (default: "older_than_days")
 * @query {number} days - For older_than_days mode, delete records older than this many days (default: 30)
 */
router.delete('/purge', async (req, res) => {
  try {
    const mode = req.query.mode || 'older_than_days';
    const days = parseInt(req.query.days, 10) || 30;
    
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(503).json({
        error: 'Cache service unavailable: Supabase not configured'
      });
    }
    
    let deleteQuery = serviceClient.from('categorized_articles').delete();
    
    if (mode === 'all') {
      // Delete all records (be careful!)
      const { error } = await deleteQuery;
      
      if (error) {
        console.error('Error purging all cache:', error);
        return res.status(500).json({
          error: 'Failed to purge cache'
        });
      }
      
      return res.status(200).json({
        message: 'All cache entries deleted',
        mode
      });
    } else if (mode === 'older_than_days') {
      // Calculate the cutoff date
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffDateIso = cutoffDate.toISOString();
      
      // Delete records older than the cutoff date
      const { data, error } = await deleteQuery.lt('created_at', cutoffDateIso);
      
      if (error) {
        console.error('Error purging old cache:', error);
        return res.status(500).json({
          error: 'Failed to purge old cache entries'
        });
      }
      
      return res.status(200).json({
        message: `Cache entries older than ${days} days deleted`,
        cutoffDate: cutoffDateIso,
        mode,
        days
      });
    } else {
      return res.status(400).json({
        error: 'Invalid mode. Use "all" or "older_than_days"'
      });
    }
  } catch (error) {
    console.error('Error in cache purge:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

/**
 * @route GET /api/cache/stats
 * @desc Get statistics about the cache
 * @access Public
 */
router.get('/stats', async (req, res) => {
  try {
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(503).json({
        error: 'Cache service unavailable: Supabase not configured'
      });
    }
    
    // Get total count
    const { count: totalCount, error: countError } = await serviceClient
      .from('categorized_articles')
      .select('*', { count: 'exact', head: true });
      
    if (countError) {
      console.error('Error getting total count:', countError);
      return res.status(500).json({
        error: 'Failed to get cache statistics'
      });
    }
    
    // Get counts by category
    const { data: categoryData, error: categoryError } = await serviceClient
      .from('categorized_articles')
      .select('category');
      
    if (categoryError) {
      console.error('Error getting categories:', categoryError);
      return res.status(500).json({
        error: 'Failed to get cache statistics'
      });
    }
    
    // Count occurrences of each category
    const categoryCounts = {};
    (categoryData || []).forEach(item => {
      const category = item.category;
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    // Get the oldest and newest entry
    const { data: oldestData, error: oldestError } = await serviceClient
      .from('categorized_articles')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1);
      
    if (oldestError) {
      console.error('Error getting oldest entry:', oldestError);
    }
    
    const { data: newestData, error: newestError } = await serviceClient
      .from('categorized_articles')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);
      
    if (newestError) {
      console.error('Error getting newest entry:', newestError);
    }
    
    const oldestEntry = oldestData && oldestData[0] ? oldestData[0].created_at : null;
    const newestEntry = newestData && newestData[0] ? newestData[0].created_at : null;
    
    // Calculate the age of the cache in days
    let cacheAgeInDays = null;
    if (oldestEntry) {
      const oldestDate = new Date(oldestEntry);
      const currentDate = new Date();
      const diffTime = Math.abs(currentDate - oldestDate);
      cacheAgeInDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }
    
    return res.status(200).json({
      totalEntries: totalCount,
      categoryBreakdown: categoryCounts,
      categoryCount: Object.keys(categoryCounts).length,
      oldestEntry,
      newestEntry,
      cacheAgeInDays
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

module.exports = router; 