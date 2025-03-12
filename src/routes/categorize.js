const express = require('express');
const router = express.Router();
const { openai, isConfigured } = require('../lib/openai');
const { serviceClient, createUniqueId, toArticle, toCategorizedArticle } = require('../lib/supabase');

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

/**
 * Categorizes an article using OpenAI
 * @param {import('../lib/scraper').Article} article - Article to categorize
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

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that categorizes products into predefined categories. Only respond with a single category name from the provided list, nothing else."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 20
    });

    const predictedCategory = response.choices[0].message.content?.trim();
    
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
 * @param {import('../lib/scraper').Article} article - Article to categorize
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
 * @param {import('../lib/scraper').Article[]} articles - Articles to check
 * @returns {Promise<{
 *   cachedArticles: Record<string, import('../lib/scraper').Article[]>;
 *   uncachedArticles: import('../lib/scraper').Article[];
 *   cachedArticleIds: string[];
 * }>} - Cached and uncached articles
 */
async function checkCache(articles) {
  try {
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return {
        cachedArticles: {},
        uncachedArticles: articles,
        cachedArticleIds: []
      };
    }

    // Extract the links from articles to check cache
    const articleLinks = articles.map(article => article.link);
    
    // Generate article_ids from links
    const articleIds = articleLinks.map(link => createUniqueId(link));
    
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
        console.error('Błąd zapytania Supabase:', error);
        continue; // Continue with next batch if there's an error
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
    
    // Find articles that are not in the cache
    const cachedArticleIds = allData.map(item => item.article_id);
    const uncachedArticles = articles.filter(article => {
      const articleId = createUniqueId(article.link);
      return !cachedArticleIds.includes(articleId);
    });
    
    return {
      cachedArticles,
      uncachedArticles,
      cachedArticleIds
    };
  } catch (error) {
    console.error('Błąd sprawdzania cache:', error);
    return {
      cachedArticles: {},
      uncachedArticles: articles,
      cachedArticleIds: []
    };
  }
}

/**
 * Stores newly categorized articles in the cache
 * @param {Record<string, import('../lib/scraper').Article[]>} categorizedArticles - Articles to store
 * @returns {Promise<void>}
 */
async function storeInCache(categorizedArticles) {
  try {
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.warn('Supabase nie jest skonfigurowany - pomijam zapis do cache');
      return;
    }
    
    // Diagnostic logging
    console.log('Rozpoczynam zapisywanie do Supabase cache');
    console.log(`Liczba kategorii do zapisania: ${Object.keys(categorizedArticles).length}`);
    
    // Count total articles to be stored
    let totalArticles = 0;
    Object.values(categorizedArticles).forEach(articles => {
      totalArticles += articles.length;
    });
    
    console.log(`Całkowita liczba artykułów do zapisania: ${totalArticles}`);
    
    if (totalArticles === 0) {
      console.log('Brak artykułów do zapisania w cache.');
      return;
    }
    
    // Convert to Supabase records format
    const recordsToInsert = [];
    
    Object.entries(categorizedArticles).forEach(([category, articles]) => {
      if (!Array.isArray(articles)) {
        console.warn(`Nieprawidłowy format artykułów dla kategorii ${category}, pomijam`);
        return;
      }
      
      articles.forEach(article => {
        // Walidacja artykułu przed konwersją
        if (!article.link) {
          console.warn('Artykuł bez linku, pomijam', article);
          return;
        }
        
        try {
          const categorizedArticle = toCategorizedArticle(article, category);
          // Dodatkowa weryfikacja kompletności rekordu
          if (!categorizedArticle.article_id || !categorizedArticle.category) {
            console.warn('Nieprawidłowy rekord po konwersji, pomijam', categorizedArticle);
            return;
          }
          recordsToInsert.push(categorizedArticle);
        } catch (convError) {
          console.error('Błąd konwersji artykułu:', convError, article);
        }
      });
    });
    
    console.log(`Przygotowano ${recordsToInsert.length} rekordów do zapisania w cache`);
    
    if (recordsToInsert.length === 0) {
      console.warn('Po walidacji brak artykułów do zapisania w cache.');
      return;
    }
    
    // If there are a lot of articles, process in batches
    const batchSize = 50;
    let successCount = 0;
    
    for (let i = 0; i < recordsToInsert.length; i += batchSize) {
      const batch = recordsToInsert.slice(i, i + batchSize);
      console.log(`Zapisuję paczkę ${Math.floor(i/batchSize) + 1} (${batch.length} rekordów)`);
      
      try {
        // Use Supabase client directly to insert/update
        const { data, error } = await serviceClient
          .from('categorized_articles')
          .upsert(batch, { 
            onConflict: 'article_id',
            ignoreDuplicates: false
          });
        
        if (error) {
          console.error('Błąd zapisywania paczki w cache:', error);
          
          // Dodatkowe debugowanie RLS
          if (error.code === '42501') {
            console.error('Problem z RLS! Sprawdź polityki bezpieczeństwa w Supabase.');
            
            // Próba zapisu jednego rekordu, aby zobaczyć dokładniejszy błąd
            if (batch.length > 0) {
              try {
                console.log('Próba zapisu pojedynczego rekordu dla debugowania:', batch[0]);
                const singleInsert = await serviceClient
                  .from('categorized_articles')
                  .insert([batch[0]]);
                  
                console.log('Wynik pojedynczego zapisu:', singleInsert);
              } catch (singleError) {
                console.error('Błąd pojedynczego zapisu:', singleError);
              }
            }
          }
          
          // Kontynuuj z następnymi paczkami mimo błędu
        } else {
          successCount += batch.length;
          console.log(`Pomyślnie zapisano paczkę ${Math.floor(i/batchSize) + 1}`);
        }
      } catch (batchError) {
        console.error('Nieoczekiwany błąd podczas zapisywania paczki:', batchError);
        // Kontynuuj z następnymi paczkami mimo błędu
      }
      
      // Small delay to avoid overwhelming the API
      if (i + batchSize < recordsToInsert.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    console.log(`Proces zapisu do cache zakończony. Zapisano ${successCount}/${recordsToInsert.length} artykułów`);
  } catch (error) {
    console.error('Globalny błąd zapisywania w cache:', error);
  }
}

/**
 * @route POST /api/categorize
 * @desc Categorizes articles using OpenAI or keywords
 * @access Public
 * @body {import('../lib/scraper').Article[]} articles - Articles to categorize
 */
router.post('/', async (req, res) => {
  try {
    // Get articles from the request body
    const { articles } = req.body;
    
    if (!articles || !Array.isArray(articles)) {
      return res.status(400).json({ 
        categorizedArticles: {},
        fromCache: false,
        error: 'Invalid input: articles must be an array' 
      });
    }
    
    // Check cache first (if Supabase is configured)
    const { cachedArticles, uncachedArticles, cachedArticleIds } = await checkCache(articles);
    
    // If everything is cached, we can return immediately
    if (uncachedArticles.length === 0 && Object.keys(cachedArticles).length > 0) {
      console.log('All articles found in cache');
      return res.status(200).json({ 
        categorizedArticles: cachedArticles,
        fromCache: true
      });
    }
    
    // If we have some cached articles, use them
    const mergedCategories = { ...cachedArticles };
    
    // Only proceed with categorization if we have uncached articles
    if (uncachedArticles.length > 0) {
      console.log(`Categorizing ${uncachedArticles.length} uncached articles`);
      
      // Initialize categories that don't exist in the cached results
      predefinedCategories.forEach(category => {
        if (!mergedCategories[category]) {
          mergedCategories[category] = [];
        }
      });
      
      // Process articles in batches if using AI to avoid rate limiting
      if (isConfigured) {
        console.log('Using OpenAI for categorization');
        
        // Process in batches of 10 to avoid overwhelming the API
        const batchSize = 10;
        for (let i = 0; i < uncachedArticles.length; i += batchSize) {
          const batch = uncachedArticles.slice(i, i + batchSize);
          const categorizations = await Promise.all(
            batch.map(article => categorizeArticleWithAI(article))
          );
          
          // Add each article to its corresponding category
          batch.forEach((article, index) => {
            const category = categorizations[index];
            mergedCategories[category].push(article);
          });
          
          // Add a small delay between batches to avoid rate limiting
          if (i + batchSize < uncachedArticles.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } else {
        console.log('Using keyword matching for categorization (OpenAI API key not configured)');
        uncachedArticles.forEach(article => {
          const category = categorizeArticleWithKeywords(article);
          mergedCategories[category].push(article);
        });
      }
      
      // Store the newly categorized articles in the cache
      if (uncachedArticles.length > 0) {
        // Create a subset of only the newly categorized articles
        const newlyCategorized = {};
        let newArticlesCount = 0;
        
        Object.entries(mergedCategories).forEach(([category, categoryArticles]) => {
          const newArticles = categoryArticles.filter(article => {
            const articleId = createUniqueId(article.link);
            return !cachedArticleIds.includes(articleId);
          });
          
          if (newArticles.length > 0) {
            newlyCategorized[category] = newArticles;
            newArticlesCount += newArticles.length;
          }
        });
        
        console.log(`Przygotowano ${newArticlesCount} nowych artykułów w ${Object.keys(newlyCategorized).length} kategoriach do zapisania w cache`);
        
        try {
          // Save asynchronously to cache, but handle errors
          storeInCache(newlyCategorized)
            .then(() => console.log('Zakończono zapisywanie w cache'))
            .catch(cacheError => {
              console.error('Błąd podczas zapisywania do cache:', cacheError);
            });
          
          console.log('Uruchomiono asynchroniczny zapis do cache');
        } catch (storeCacheError) {
          console.error('Nie udało się uruchomić zapisu do cache:', storeCacheError);
        }
      }
    }
    
    // Filter out empty categories
    const nonEmptyCategories = {};
    Object.entries(mergedCategories).forEach(([category, categoryArticles]) => {
      if (categoryArticles.length > 0) {
        nonEmptyCategories[category] = categoryArticles;
      }
    });
    
    return res.status(200).json({ 
      categorizedArticles: nonEmptyCategories,
      fromCache: cachedArticleIds.length > 0 && uncachedArticles.length === 0
    });
  } catch (error) {
    console.error('Error in categorize API handler:', error);
    return res.status(500).json({ 
      categorizedArticles: {},
      fromCache: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    });
  }
});

/**
 * @route GET /api/categorize/categories
 * @desc Returns predefined categories
 * @access Public
 */
router.get('/categories', (req, res) => {
  res.json({ categories: predefinedCategories });
});

module.exports = router; 