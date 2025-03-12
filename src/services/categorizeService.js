const openaiService = require('./openai');
const supabaseService = require('./supabase');
const config = require('../config');

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
];

// Helper function to create a unique ID for an article based on its link
function createArticleId(link) {
  return supabaseService.createUniqueId(link);
}

/**
 * Categorizes an article using OpenAI
 * @param {Object} article - Article to categorize
 * @returns {Promise<string>} - Category name
 */
async function categorizeArticleWithAI(article) {
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
    if (predictedCategory && predefinedCategories.includes(predictedCategory)) {
      return predictedCategory;
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
 * @param {Object} article - Article to categorize
 * @returns {string} - Category name
 */
function categorizeArticleWithKeywords(article) {
  // Define main keywords for each category
  const categoryKeywords = {
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
  
  let bestCategory = 'Other Deals';
  let maxMatches = 0;
  
  // Check each category's keywords against the text
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
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
 * Checks Supabase cache for already categorized articles
 * @param {Object[]} articles - Articles to check
 * @returns {Promise<{
 *   cachedArticles: Record<string, Object[]>;
 *   uncachedArticles: Object[];
 *   cachedArticleIds: string[];
 * }>} - Cached and uncached articles
 */
async function checkCache(articles) {
  if (!supabaseService.isConfigured()) {
    console.log('Supabase not configured, skipping cache check')
    return { cachedArticles: {}, uncachedArticles: articles, cachedArticleIds: [] }
  }

  // Extract article links
  const articleLinks = articles.map(article => article.link)
  const articleIds = articleLinks.map(createArticleId)

  const cachedArticles = {}
  const cachedArticleIds = []

  try {
    // Process in smaller batches to avoid query string length limitations
    const BATCH_SIZE = 5 // Using an even smaller batch size for improved reliability with long IDs
    
    for (let i = 0; i < articleIds.length; i += BATCH_SIZE) {
      const batchIds = articleIds.slice(i, i + BATCH_SIZE)
      
      if (batchIds.length === 0) continue;
      
      try {
        console.log(`Checking cache for batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(articleIds.length/BATCH_SIZE)} with ${batchIds.length} articles`);
        
        const data = await supabaseService.getData('categorized_articles', {
          filter: {
            column: 'article_id',
            operator: 'in',
            value: batchIds
          }
        })
        
        // Process data
        if (data && data.length > 0) {
          console.log(`Found ${data.length} cached articles in batch ${Math.floor(i/BATCH_SIZE) + 1}`);
          data.forEach((cachedArticle) => {
            const article = supabaseService.toArticle(cachedArticle);
            const category = cachedArticle.category;
            
            if (!cachedArticles[category]) {
              cachedArticles[category] = [];
            }
            
            cachedArticles[category].push(article);
          });
          
          cachedArticleIds.push(...data.map(item => item.article_id));
        }
      } catch (error) {
        console.error(`Error querying Supabase for batch ${Math.floor(i/BATCH_SIZE) + 1}:`, error);
        // Continue with next batch if there's an error
      }
    }
    
    // Find articles that are not in the cache
    const uncachedArticles = articles.filter(article => {
      const articleId = createArticleId(article.link);
      return !cachedArticleIds.includes(articleId);
    });
    
    console.log(`Cache check complete: ${cachedArticleIds.length} cached articles, ${uncachedArticles.length} uncached articles`);
    
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
 * Saves categorized articles to Supabase
 * @param {Object[]} articles - Articles to save
 * @param {Record<string, string>} articleCategories - Map of article links to categories
 * @returns {Promise<number>} - Number of saved articles
 */
async function saveToSupabase(articles, articleCategories) {
  try {
    // Check if Supabase is configured
    if (!supabaseService.isConfigured()) {
      console.warn('Supabase not configured, skipping save');
      return 0;
    }
    
    // Convert articles to Supabase format
    const recordsToInsert = articles.map(article => {
      const category = articleCategories[article.link] || 'Other Deals';
      return supabaseService.toCategorizedArticle(article, category);
    });
    
    if (recordsToInsert.length === 0) {
      console.log('No articles to save to Supabase');
      return 0;
    }
    
    console.log(`Preparing to save ${recordsToInsert.length} articles to Supabase`);
    
    // Process in batches to avoid potential Supabase limitations
    const batchSize = 50; // Reduced batch size for better reliability
    let totalSaved = 0;
    
    for (let i = 0; i < recordsToInsert.length; i += batchSize) {
      const batch = recordsToInsert.slice(i, i + batchSize);
      console.log(`Saving batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(recordsToInsert.length/batchSize)}, size: ${batch.length}`);
      
      try {
        // Use upsert instead of insert to handle duplicate key errors
        await supabaseService.upsertData('categorized_articles', batch, {
          onConflict: 'article_id',
          returning: 'minimal'
        });
        totalSaved += batch.length;
        console.log(`Successfully saved batch ${Math.floor(i/batchSize) + 1}, total saved: ${totalSaved}`);
      } catch (error) {
        console.error(`Error saving batch ${Math.floor(i/batchSize) + 1} to Supabase:`, error);
        // Try to save articles one by one to prevent losing the entire batch
        for (const record of batch) {
          try {
            await supabaseService.upsertData('categorized_articles', record, {
              onConflict: 'article_id',
              returning: 'minimal'
            });
            totalSaved += 1;
          } catch (individualError) {
            console.error('Error saving individual article:', individualError);
          }
        }
      }
    }
    
    console.log(`Saved ${totalSaved} articles to Supabase`);
    return totalSaved;
  } catch (error) {
    console.error('Error saving to Supabase:', error);
    return 0;
  }
}

/**
 * Categorizes articles using AI or keywords
 * @param {Object[]} articles - Articles to categorize
 * @param {Object} options - Options for categorization
 * @returns {Promise<{
 *   categorizedArticles: Record<string, Object[]>;
 *   fromCache: boolean;
 * }>} - Categorized articles
 */
async function categorizeArticles(articles, options = {}) {
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
    const articleCategories = {};
    const useAI = options.useAI !== false && config.OPENAI_API_KEY;
    
    for (const article of uncachedArticles) {
      let category;
      
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
    const nonEmptyCategories = {};
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
 * @returns {string[]} - List of predefined categories
 */
function getCategories() {
  return predefinedCategories;
}

module.exports = {
  categorizeArticles,
  categorizeArticleWithAI,
  categorizeArticleWithKeywords,
  checkCache,
  saveToSupabase,
  getCategories,
};
