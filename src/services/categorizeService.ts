import * as openaiService from './openai';
import supabaseService from './supabase';
import config from '../config';
import { Article } from '../lib/scraper';

// Predefined categories that we want the AI to use
const predefinedCategories = [
  'Electronics',
  'Home & Household',
  'Fashion',
  'Food & Grocery',
  'Sports & Outdoor',
  'Beauty & Health',
  'Travel',
  'Entertainment',
  'Kids & Toys',
  'Automotive',
  'Services',
  'Other Deals'
] as const;

export type Category = typeof predefinedCategories[number];

export interface CategorizeOptions {
  /** Whether to use AI for categorization */
  useAI?: boolean;
  /** Whether to save to Supabase */
  saveToSupabase?: boolean;
}

export interface CacheCheckResult {
  /** Articles that were found in the cache, organized by category */
  cachedArticles: Record<string, Article[]>;
  /** Articles that were not found in the cache */
  uncachedArticles: Article[];
  /** IDs of articles that were found in the cache */
  cachedArticleIds: string[];
}

export interface CategorizeResult {
  /** Categorized articles organized by category */
  categorizedArticles: Record<string, Article[]>;
  /** Whether all articles were from cache */
  fromCache: boolean;
}

// Helper functions to work with Supabase
function isSupabaseConfigured(): boolean {
  return !!(
    config.SERVICES && 
    config.SERVICES.SUPABASE && 
    config.SERVICES.SUPABASE.URL && 
    config.SERVICES.SUPABASE.SERVICE_KEY
  );
}

function toArticleFromSupabase(cachedArticle: any): Article {
  return {
    title: cachedArticle.title || '',
    description: cachedArticle.description || '',
    price: cachedArticle.price || '',
    shippingPrice: cachedArticle.shipping_price || '',
    image: cachedArticle.image || '',
    link: cachedArticle.link || ''
  };
}

// Wrapper functions for Supabase service
async function getDataFromSupabase(table: string, options: any): Promise<any[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }
  
  try {
    // @ts-ignore - We know this function exists in the imported module
    return await supabaseService.getData(table, options);
  } catch (error) {
    console.error(`Error getting data from Supabase table ${table}:`, error);
    return [];
  }
}

async function upsertDataToSupabase(table: string, data: any, options: any): Promise<any> {
  if (!isSupabaseConfigured()) {
    return null;
  }
  
  try {
    // @ts-ignore - We know this function exists in the imported module
    return await supabaseService.upsertData(table, data, options);
  } catch (error) {
    console.error(`Error upserting data to Supabase table ${table}:`, error);
    throw error;
  }
}

/**
 * Create a unique ID for an article based on its link
 * @param link - The article link
 * @returns A unique ID
 */
function createArticleId(link: string): string {
  // Use the same method as in supabaseService to ensure consistency
  return Buffer.from(link).toString('base64');
}

/**
 * Categorizes an article using OpenAI
 * @param article - Article to categorize
 * @returns Category name
 */
async function categorizeArticleWithAI(article: Article): Promise<Category> {
  try {
    const { title, description, price } = article;
    
    const prompt = `
Categorize the following product into ONE of these categories:
${predefinedCategories.join(', ')}

Product:
Title: ${title}
Description: ${description}
Price: ${price}

Respond with ONLY the category name, nothing else.
`;

    const predictedCategory = await openaiService.generateCompletion(prompt, {
      model: "gpt-3.5-turbo",
      temperature: 0.3,
      max_tokens: 20,
      systemMessage: "You are a helpful assistant that categorizes products into predefined categories. Only respond with a single category name from the provided list, nothing else."
    });
    
    // Validate that the returned category is in our predefined list
    if (predictedCategory && predefinedCategories.includes(predictedCategory as Category)) {
      return predictedCategory as Category;
    }
    
    // If the model returns something not in our list, default to Other Deals
    return 'Other Deals';
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    // In case of any error, return the default category
    return 'Other Deals';
  }
}

/**
 * Fallback categorization method using keywords 
 * @param article - Article to categorize
 * @returns Category name
 */
function categorizeArticleWithKeywords(article: Article): Category {
  // Define main keywords for each category
  const categoryKeywords: Record<Category, string[]> = {
    'Electronics': [
      'phone', 'smartphone', 'iphone', 'samsung', 'laptop', 'computer', 'pc', 'monitor', 'tv', 'television', 
      'smart', 'electronic', 'device', 'gadget', 'tech', 'speaker', 'headphone', 'earbuds', 'audio', 'video', 
      'camera', 'gaming', 'console', 'playstation', 'xbox', 'nintendo', 'wireless', 'bluetooth', 'charging', 
      'tablet', 'ipad', 'keyboard', 'mouse', 'router', 'wifi', 'printer'
    ],
    'Home & Household': [
      'furniture', 'home', 'kitchen', 'bathroom', 'bedroom', 'living', 'house', 'garden', 'patio', 'décor', 
      'decoration', 'appliance', 'cleaning', 'vacuum', 'chair', 'table', 'sofa', 'bed', 'mattress', 'pillow', 
      'curtains', 'lamp', 'lighting', 'cookware', 'utensils', 'dishes', 'storage', 'organizer', 'tools', 
      'lawn', 'plants', 'bbq', 'grill'
    ],
    'Fashion': [
      'clothing', 'clothes', 'fashion', 'wear', 'dress', 'shirt', 'pants', 'jeans', 'jacket', 'coat', 
      'shoes', 'sneakers', 'boots', 'sandals', 'accessory', 'accessories', 'watch', 'jewelry', 'bag', 
      'handbag', 'backpack', 'wallet', 'belt', 'hat', 'cap', 'scarf', 'gloves', 'socks', 'underwear', 
      't-shirt', 'shorts', 'hoodie', 'sweater'
    ],
    'Food & Grocery': [
      'food', 'grocery', 'meal', 'snack', 'drink', 'beverage', 'coffee', 'tea', 'water', 'juice', 
      'soda', 'beer', 'wine', 'alcohol', 'fruit', 'vegetable', 'meat', 'fish', 'dairy', 'milk', 'cheese', 
      'yogurt', 'bread', 'pasta', 'rice', 'cereal', 'chocolate', 'candy', 'sweet', 'organic', 'restaurant', 
      'takeaway', 'delivery'
    ],
    'Sports & Outdoor': [
      'sport', 'fitness', 'exercise', 'workout', 'gym', 'training', 'running', 'cycling', 'bike', 'bicycle', 
      'hiking', 'camping', 'outdoor', 'adventure', 'fishing', 'hunting', 'golf', 'tennis', 'swimming', 
      'basketball', 'football', 'soccer', 'baseball', 'volleyball', 'ski', 'snowboard', 'skateboard', 
      'surf', 'yoga', 'mat'
    ],
    'Beauty & Health': [
      'beauty', 'health', 'skincare', 'skin', 'face', 'body', 'hair', 'makeup', 'cosmetic', 'nail', 
      'perfume', 'fragrance', 'cream', 'lotion', 'shampoo', 'conditioner', 'soap', 'shower', 'bath', 
      'toothbrush', 'toothpaste', 'dental', 'vitamin', 'supplement', 'medicine', 'pharmacy', 'first aid', 
      'healthcare', 'wellness'
    ],
    'Travel': [
      'travel', 'trip', 'vacation', 'holiday', 'hotel', 'resort', 'booking', 'flight', 'airline', 'airplane', 
      'airport', 'ticket', 'luggage', 'suitcase', 'passport', 'tour', 'tourism', 'tourist', 'destination', 
      'beach', 'mountain', 'city', 'country', 'international', 'domestic', 'train', 'bus', 'car rental', 'cruise'
    ],
    'Entertainment': [
      'entertainment', 'fun', 'game', 'toy', 'play', 'movie', 'film', 'cinema', 'theater', 'theatre', 
      'music', 'concert', 'festival', 'show', 'event', 'ticket', 'stream', 'streaming', 'subscription', 
      'netflix', 'spotify', 'disney', 'amazon', 'hbo', 'book', 'ebook', 'audiobook', 'podcast', 'board game'
    ],
    'Kids & Toys': [
      'kid', 'child', 'children', 'baby', 'infant', 'toddler', 'toy', 'game', 'play', 'lego', 'doll', 
      'action figure', 'puzzle', 'educational', 'learning', 'school', 'daycare', 'stroller', 'car seat', 
      'diaper', 'bottle', 'pacifier', 'clothing', 'shoes', 'book', 'backpack', 'lunch box'
    ],
    'Automotive': [
      'car', 'auto', 'automotive', 'vehicle', 'truck', 'suv', 'van', 'motorcycle', 'scooter', 'bike', 
      'part', 'accessory', 'oil', 'tire', 'wheel', 'battery', 'engine', 'transmission', 'brake', 'light', 
      'seat', 'cover', 'mat', 'charger', 'cleaner', 'wash', 'polish', 'repair', 'maintenance', 'service'
    ],
    'Services': [
      'service', 'subscription', 'membership', 'plan', 'insurance', 'warranty', 'protection', 'repair', 
      'installation', 'setup', 'delivery', 'shipping', 'maintenance', 'cleaning', 'consulting', 'advice', 
      'support', 'assistance', 'care', 'education', 'course', 'class', 'tutorial', 'training', 'coaching', 
      'financial', 'legal', 'medical', 'dental'
    ],
    'Other Deals': [] // Default category
  };

  const textToAnalyze = `${article.title.toLowerCase()} ${article.description.toLowerCase()}`;
  
  let bestCategory: Category = 'Other Deals';
  let maxMatches = 0;
  
  // Check each category's keywords against the text
  for (const [category, keywords] of Object.entries(categoryKeywords) as [Category, string[]][]) {
    if (category === 'Other Deals') continue; // Skip the default category in matching
    
    // Count how many keywords of this category appear in the text
    const matches = keywords.filter(keyword => textToAnalyze.includes(keyword)).length;
    
    // If this category has more matches, it becomes the best candidate
    if (matches > maxMatches) {
      maxMatches = matches;
      bestCategory = category;
    }
  }
  
  return bestCategory;
}

/**
 * Check if articles are already in the cache
 * @param articles - Articles to check
 * @returns Result with cached and uncached articles
 */
async function checkCache(articles: Article[]): Promise<CacheCheckResult> {
  if (!isSupabaseConfigured()) {
    console.warn('Supabase is not configured, skipping cache check');
    return {
      cachedArticles: {},
      uncachedArticles: articles,
      cachedArticleIds: []
    };
  }

  try {
    // Create a map of article IDs to articles for quick lookup
    const articleMap = new Map<string, Article>();
    const articleIds: string[] = [];
    
    articles.forEach(article => {
      const articleId = createArticleId(article.link);
      articleMap.set(articleId, article);
      articleIds.push(articleId);
    });
    
    // Process in batches to avoid query string length limitations
    const batchSize = 20; // Reduced from 100 to avoid query string length issues
    const cachedArticles: Record<string, Article[]> = {};
    const cachedArticleIds: string[] = [];
    
    for (let i = 0; i < articleIds.length; i += batchSize) {
      const batchIds = articleIds.slice(i, i + batchSize);
      
      // Skip empty batches
      if (batchIds.length === 0) continue;
      
      // Query Supabase for cached articles
      const data = await getDataFromSupabase('categorized_articles', {
        filter: {
          column: 'article_id',
          operator: 'in',
          value: batchIds
        }
      });
      
      // Process the results
      if (data && Array.isArray(data) && data.length > 0) {
        data.forEach((cachedArticle: any) => {
          const article = toArticleFromSupabase(cachedArticle);
          const category = cachedArticle.category;
          
          if (!cachedArticles[category]) {
            cachedArticles[category] = [];
          }
          
          cachedArticles[category].push(article);
          
          // Remove from the map to get uncached articles later
          articleMap.delete(cachedArticle.article_id);
        });
        
        // Add to cached article IDs
        cachedArticleIds.push(...data.map((item: any) => item.article_id));
      }
    }
    
    // Get uncached articles from the map
    const uncachedArticles = Array.from(articleMap.values());
    
    return {
      cachedArticles,
      uncachedArticles,
      cachedArticleIds
    };
  } catch (error) {
    console.error('Error checking cache:', error);
    return {
      cachedArticles: {},
      uncachedArticles: articles,
      cachedArticleIds: []
    };
  }
}

/**
 * Save categorized articles to Supabase
 * @param articles - Articles to save
 * @param articleCategories - Map of article links to categories
 * @returns Number of articles saved
 */
async function saveToSupabase(articles: Article[], articleCategories: Record<string, string>): Promise<number> {
  if (!isSupabaseConfigured()) {
    console.warn('Supabase is not configured, skipping save to Supabase');
    return 0;
  }
  
  try {
    // Convert articles to Supabase records
    const records = articles.map(article => {
      const category = articleCategories[article.link];
      if (!category) {
        throw new Error(`No category found for article: ${article.title}`);
      }
      
      return {
        article_id: createArticleId(article.link),
        title: article.title,
        description: article.description || '',
        price: article.price || '',
        shipping_price: article.shippingPrice || '',
        image: article.image || '',
        link: article.link,
        category: category,
        created_at: new Date().toISOString()
      };
    });
    
    // Process in batches to avoid payload too large errors
    const batchSize = 50;
    let savedCount = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      try {
        await upsertDataToSupabase('categorized_articles', batch, {
          onConflict: 'article_id',
          returning: 'minimal'
        });
        
        savedCount += batch.length;
      } catch (error) {
        console.error(`Error saving batch ${i / batchSize + 1}:`, error);
        // Continue with next batch despite error
      }
    }
    
    return savedCount;
  } catch (error) {
    console.error('Error saving to Supabase:', error);
    return 0;
  }
}

/**
 * Categorizes articles using AI or keywords
 * @param articles - Articles to categorize
 * @param options - Options for categorization
 * @returns Categorized articles
 */
async function categorizeArticles(articles: Article[], options: CategorizeOptions = {}): Promise<CategorizeResult> {
  try {
    // Check if articles array is valid
    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      return {
        categorizedArticles: {},
        fromCache: false
      };
    }
    
    // Check cache for already categorized articles
    const { cachedArticles, uncachedArticles, cachedArticleIds } = await checkCache(articles);
    
    // If all articles are in cache, return them
    if (uncachedArticles.length === 0) {
      return {
        categorizedArticles: cachedArticles,
        fromCache: true
      };
    }
    
    // Categorize uncached articles
    const articleCategories: Record<string, string> = {};
    const useAI = options.useAI !== false && !!config.OPENAI_API_KEY;
    
    for (const article of uncachedArticles) {
      let category: Category;
      
      if (useAI) {
        // Try AI categorization first
        try {
          category = await categorizeArticleWithAI(article);
        } catch (error) {
          console.error('Error in AI categorization, falling back to keywords:', error);
          category = categorizeArticleWithKeywords(article);
        }
      } else {
        // Use keyword-based categorization
        category = categorizeArticleWithKeywords(article);
      }
      
      // Store the category for this article
      articleCategories[article.link] = category;
      
      // Add to categorized articles
      if (!cachedArticles[category]) {
        cachedArticles[category] = [];
      }
      cachedArticles[category].push(article);
    }
    
    // Save newly categorized articles to Supabase
    if (options.saveToSupabase !== false) {
      await saveToSupabase(uncachedArticles, articleCategories);
    }
    
    // Filter out empty categories
    const nonEmptyCategories: Record<string, Article[]> = {};
    Object.keys(cachedArticles).forEach(category => {
      if (cachedArticles[category].length > 0) {
        nonEmptyCategories[category] = cachedArticles[category];
      }
    });
    
    return {
      categorizedArticles: nonEmptyCategories,
      fromCache: cachedArticleIds.length > 0 && uncachedArticles.length === 0
    };
  } catch (error) {
    console.error('Error in categorizeArticles:', error);
    throw error;
  }
}

/**
 * Get all predefined categories
 * @returns List of predefined categories
 */
function getCategories(): readonly string[] {
  return predefinedCategories;
}

// Export as default for easier importing
export default {
  createArticleId,
  categorizeArticleWithAI,
  categorizeArticleWithKeywords,
  checkCache,
  saveToSupabase,
  categorizeArticles,
  getCategories
}; 