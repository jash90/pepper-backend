import express, { Request, Response } from 'express';
import { serviceClient, createUniqueId, toArticle } from '../lib/supabase';
import { Article } from '../types';

const router = express.Router();

// Define interface for request query parameters
interface CacheQueryParams {
  days?: string;
  limit?: string;
  mode?: string;
  category?: string;
}

// Define interface for lookup request body
interface LookupRequestBody {
  links: string[];
}

/**
 * @route GET /api/cache/lookup
 * @desc Lookup articles in cache by their links
 * @access Public
 * @body {string[]} links - Article links to check
 */
router.post('/lookup', async (req: Request<{}, {}, LookupRequestBody>, res: Response) => {
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
    let allData: any[] = [];
    
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
    const cachedArticles: Record<string, Article[]> = {};
    
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
router.get('/', async (req: Request<{}, {}, {}, CacheQueryParams>, res: Response) => {
  try {
    const days = parseInt(req.query.days || '7', 10);
    const limit = parseInt(req.query.limit || '500', 10);
    
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
    const categorizedArticles: Record<string, Article[]> = {};
    
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
router.delete('/purge', async (req: Request<{}, {}, {}, CacheQueryParams>, res: Response) => {
  try {
    const mode = req.query.mode || 'older_than_days';
    const days = parseInt(req.query.days || '30', 10);
    
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
router.get('/stats', async (req: Request, res: Response) => {
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
      console.error('Error getting cache count:', countError);
      return res.status(500).json({
        error: 'Failed to get cache statistics'
      });
    }
    
    // Get category counts
    const { data: categoryData, error: categoryError } = await serviceClient
      .from('categorized_articles')
      .select('category');
      
    if (categoryError) {
      console.error('Error getting category stats:', categoryError);
      return res.status(500).json({
        error: 'Failed to get category statistics'
      });
    }
    
    // Count articles by category
    const categoryCounts: Record<string, number> = {};
    
    categoryData?.forEach((item) => {
      const category = item.category;
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    // Get oldest record
    const { data: oldestData, error: oldestError } = await serviceClient
      .from('categorized_articles')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();
      
    if (oldestError && oldestError.code !== 'PGRST116') { // PGRST116 is "No rows returned" error
      console.error('Error getting oldest record:', oldestError);
    }
    
    // Get newest record
    const { data: newestData, error: newestError } = await serviceClient
      .from('categorized_articles')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
      
    if (newestError && newestError.code !== 'PGRST116') {
      console.error('Error getting newest record:', newestError);
    }
    
    return res.status(200).json({
      totalArticles: totalCount,
      categories: Object.keys(categoryCounts),
      categoryCounts,
      oldestRecord: oldestData?.created_at || null,
      newestRecord: newestData?.created_at || null
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

/**
 * @route GET /api/cache/category/:category
 * @desc Get categorized articles from a specific category
 * @access Public
 * @param {string} category - Category to filter by
 * @query {number} days - Number of days of data to retrieve (default: 7)
 * @query {number} limit - Maximum number of results to return (default: 500)
 */
router.get('/category/:category', async (req: Request<{category: string}, {}, {}, CacheQueryParams>, res: Response) => {
  try {
    const { category } = req.params;
    const days = parseInt(req.query.days || '7', 10);
    const limit = parseInt(req.query.limit || '500', 10);
    
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
    
    console.log(`Fetching ${category} articles from cache not older than ${days} days (from ${oldestDateIso})`);
    
    const { data, error } = await serviceClient
      .from('categorized_articles')
      .select('*')
      .eq('category', category)
      .gte('created_at', oldestDateIso)
      .order('created_at', { ascending: false })
      .limit(limit);
      
    if (error) {
      console.error(`Supabase query error for category ${category}:`, error);
      return res.status(500).json({
        error: 'Error querying cache'
      });
    }
    
    // Convert Supabase records to our application's format
    const articles: Article[] = (data || []).map(cachedArticle => toArticle(cachedArticle));
    
    return res.status(200).json({
      category,
      articles,
      count: articles.length,
      daysRetrieved: days,
      fromDate: oldestDateIso
    });
  } catch (error) {
    console.error('Error in category cache retrieval:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

export default router; 