import { scrapeArticlesFromPepper, Article } from '../lib/scraper';
import * as supabaseService from './supabase';
import * as cacheService from './cacheService';
import config from '../config';

export interface CachedArticlesOptions {
  /** Number of days of data to retrieve */
  days?: number;
  /** Maximum number of results */
  limit?: number;
  /** Whether to skip local cache */
  skipLocalCache?: boolean;
  /** Minimum number of cached articles required */
  minCached?: number | null;
}

export interface FetchCategorizeOptions {
  /** Maximum number of pages to fetch */
  maxPages?: number;
  /** Batch size for categorization */
  batchSize?: number;
  /** Base URL for the API */
  apiBaseUrl?: string;
}

export interface CategorizedArticlesResult {
  /** Collection of articles organized by category */
  categorizedArticles: Record<string, Article[]>;
  /** Statistics about the categorized articles */
  stats: {
    /** Total number of articles */
    totalArticles: number;
    /** Categories found */
    categories: string[];
    /** Number of categories */
    categoriesCount: number;
    /** Days of data retrieved */
    daysRetrieved?: number;
    /** Starting date for retrieved data */
    fromDate?: string;
    /** Whether data is from cache */
    fromCache?: boolean;
    /** Whether data is from local cache */
    fromLocalCache?: boolean;
    /** Minimum cached requirement stats */
    minCachedRequirement?: string;
    /** Number of pages fetched */
    pagesFetched?: number;
    /** Total number of categorized articles */
    totalCategorized?: number;
    /** Number of batches processed */
    batchesProcessed?: number;
    /** Number of articles from cache */
    articlesFromCache?: number;
    /** Number of articles newly saved to Supabase */
    newlySavedToSupabase?: number;
    /** Percentage of articles from cache */
    percentFromCache?: number;
  };
  /** Whether the operation was successful */
  success?: boolean;
}

/**
 * Fetch articles from Pepper.pl for a specific page
 * @param pageNumber - The page number to fetch
 * @returns Array of articles
 */
async function fetchArticlesFromPage(pageNumber = 1): Promise<Article[]> {
  try {
    console.log(`Fetching articles from page ${pageNumber}...`);
    const articles = await scrapeArticlesFromPepper(pageNumber);
    if (!articles) {
      throw new Error(`No articles returned from page ${pageNumber}`);
    }
    return articles;
  } catch (error) {
    console.error(`Error fetching articles from page ${pageNumber}:`, error);
    throw new Error(`Failed to fetch articles from page ${pageNumber}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Fetch articles from multiple pages of Pepper.pl
 * @param pagesToFetch - Number of pages to fetch
 * @returns Array of articles from all pages
 */
async function fetchArticlesFromMultiplePages(pagesToFetch = 3): Promise<Article[]> {
  try {
    if (pagesToFetch > config.API.ARTICLES.MAX_PAGES) {
      throw new Error(`Maximum number of pages exceeded (max ${config.API.ARTICLES.MAX_PAGES})`);
    }

    console.log(`Fetching articles from ${pagesToFetch} pages...`);
    
    const fetchPromises: Promise<Article[]>[] = [];
    for (let i = 1; i <= pagesToFetch; i++) {
      fetchPromises.push(fetchArticlesFromPage(i));
    }
    
    const results = await Promise.all(fetchPromises);
    
    let allArticles: Article[] = [];
    results.forEach(result => {
      if (result && Array.isArray(result)) {
        allArticles = [...allArticles, ...result];
      }
    });
    
    if (allArticles.length === 0) {
      throw new Error('No articles found');
    }
    
    return allArticles;
  } catch (error) {
    console.error('Error in multi-page fetch:', error);
    throw error;
  }
}

/**
 * Get cached articles from local cache or Supabase
 * @param options - Options for retrieving cached articles
 * @returns Categorized articles and stats
 */
async function getCachedArticles(options: CachedArticlesOptions = {}): Promise<CategorizedArticlesResult> {
  const days = options.days || config.CACHE.DEFAULTS.DAYS_TO_CACHE;
  const limit = options.limit || config.CACHE.DEFAULTS.MAX_RESULTS;
  const skipLocalCache = options.skipLocalCache || false;
  
  if (limit > config.CACHE.DEFAULTS.MAX_RESULTS) {
    throw new Error(`Invalid request: limit must be less than or equal to ${config.CACHE.DEFAULTS.MAX_RESULTS}`);
  }
  
  // Check if Supabase is configured
  if (!config.SERVICES.SUPABASE.IS_CONFIGURED) {
    throw new Error('Cache service unavailable: Supabase not configured');
  }
  
  // Define cache expiration time in seconds
  const CACHE_EXPIRATION = config.CACHE.DEFAULTS.TTL;
  
  // 1. Check local SQLite cache first unless skipLocalCache is true
  let cachedResult: CategorizedArticlesResult | null = null;
  if (!skipLocalCache) {
    console.log('Checking local SQLite cache...');
    try {
      const cacheKey = `articles_cached_days_${days}_limit_${limit}`;
      cachedResult = await cacheService.getCachedValue(cacheKey);
      
      if (cachedResult) {
        console.log('✅ Local cache hit! Returning data from SQLite cache');
        
        // Add a flag to indicate the data came from the local cache
        if (cachedResult.stats) {
          cachedResult.stats.fromLocalCache = true;
        }
        
        return cachedResult;
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
  
  try {
    const data = await supabaseService.getData<supabaseService.CategorizedArticle>('categorized_articles', {
      filter: {
        column: 'created_at',
        operator: 'gte',
        value: oldestDateIso
      },
      order: {
        column: 'created_at',
        ascending: false
      },
      limit: limit
    });
    
    // Convert Supabase records to our application's format
    const categorizedArticles: Record<string, Article[]> = {};
    
    (data || []).forEach((cachedArticle) => {
      const article = supabaseService.toArticle(cachedArticle);
      const category = cachedArticle.category;
      
      if (!categorizedArticles[category]) {
        categorizedArticles[category] = [];
      }
      
      categorizedArticles[category].push(article);
    });
    
    // Calculate some stats
    const totalArticles = (data || []).length;
    const categories = Object.keys(categorizedArticles);
    
    // Prepare the response
    const result: CategorizedArticlesResult = {
      categorizedArticles,
      stats: {
        totalArticles,
        categories,
        categoriesCount: categories.length,
        daysRetrieved: days,
        fromDate: oldestDateIso,
        fromCache: true,
        fromLocalCache: false,
        minCachedRequirement: options.minCached !== null ? `${totalArticles}/${options.minCached}` : 'not specified'
      }
    };
    
    // 3. Store the result in local SQLite cache for future requests
    if (!skipLocalCache && totalArticles > 0) {
      console.log('Storing results in local SQLite cache');
      try {
        const cacheKey = `articles_cached_days_${days}_limit_${limit}`;
        await cacheService.setCachedValue(cacheKey, result, CACHE_EXPIRATION);
      } catch (cacheError) {
        console.error('Failed to store in local cache, but continuing:', cacheError);
        // Non-fatal error, we can still return the data even if caching fails
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error querying Supabase:', error);
    throw new Error(`Failed to fetch cached articles: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Fetch, categorize, and cache articles from Pepper.pl
 * @param options - Options for the fetch and cache operation
 * @returns Categorized articles and stats
 */
async function fetchCategorizeAndCacheArticles(options: FetchCategorizeOptions = {}): Promise<CategorizedArticlesResult> {
  const maxPages = options.maxPages || config.API.ARTICLES.MAX_PAGES;
  const batchSize = options.batchSize || config.API.CATEGORIZATION.MAX_BATCH_SIZE;
  const apiBaseUrl = options.apiBaseUrl || '';
  
  // Check if Supabase is configured
  if (!config.SERVICES.SUPABASE.IS_CONFIGURED) {
    throw new Error('Cache service unavailable: Supabase not configured');
  }
  
  console.log(`Fetching ${maxPages} pages from Pepper.pl...`);
  
  // 1. Fetch articles from specified number of Pepper pages
  let allArticles: Article[] = [];
  const fetchPromises: Promise<Article[]>[] = [];
  
  // Create an array of promises to fetch all pages in parallel
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    fetchPromises.push(
      fetchArticlesFromPage(pageNumber)
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
    throw new Error('No articles found');
  }
  
  console.log(`Successfully fetched a total of ${allArticles.length} articles from ${maxPages} pages`);
  
  // 2. Send articles for categorization in batches to avoid "request entity too large" errors
  console.log(`Categorizing articles and saving to Supabase in batches of ${batchSize}...`);
  
  // Create batches of articles
  const batches: Article[][] = [];
  for (let i = 0; i < allArticles.length; i += batchSize) {
    batches.push(allArticles.slice(i, i + batchSize));
  }
  
  console.log(`Created ${batches.length} batches for categorization and caching`);
  
  // Process each batch - each batch will be categorized and saved to Supabase
  let allCategorizedArticles: Record<string, Article[]> = {};
  let totalFromCache = 0;
  let newlySavedToSupabase = 0;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i+1}/${batches.length} (${batch.length} articles)...`);
    
    try {
      // This call to the categorize endpoint will automatically save new articles to Supabase
      const categorizeResponse = await fetch(`${apiBaseUrl}/api/categorize`, {
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
    throw new Error('Failed to categorize any articles');
  }
  
  // 3. Return the results
  return {
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
  };
}

export {
  fetchArticlesFromPage,
  fetchArticlesFromMultiplePages,
  getCachedArticles,
  fetchCategorizeAndCacheArticles,
}; 