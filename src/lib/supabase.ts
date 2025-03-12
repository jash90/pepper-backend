import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Interface representing a categorized article in Supabase
 */
export interface CategorizedArticle {
  /** Unique article identifier (Base64 of the link) */
  article_id: string;
  /** Title of the article */
  title: string;
  /** Description of the article */
  description: string;
  /** Price of the article */
  price: string;
  /** Shipping price of the article */
  shipping_price: string;
  /** URL of the article image */
  image: string;
  /** Link to the article */
  link: string;
  /** Category of the article */
  category: string;
  /** Date when the record was created */
  created_at: string;
}

/**
 * Interface representing an article from Pepper
 */
export interface Article {
  /** Title of the article */
  title: string;
  /** Description of the article */
  description: string;
  /** Price of the article */
  price: string;
  /** Shipping price of the article */
  shippingPrice: string;
  /** URL of the article image */
  image: string;
  /** Link to the article */
  link: string;
}

/**
 * Creates a unique ID for an article from its link (used to identify articles in cache)
 * @param link - Link to the article
 * @returns Unique article identifier
 */
function createUniqueId(link: string): string {
  return Buffer.from(link).toString('base64');
}

/**
 * Converts a Supabase record to an Article object
 * @param cachedArticle - Record from Supabase
 * @returns Article object
 */
function toArticle(cachedArticle: CategorizedArticle): Article {
  return {
    title: cachedArticle.title,
    description: cachedArticle.description,
    price: cachedArticle.price,
    shippingPrice: cachedArticle.shipping_price,
    image: cachedArticle.image,
    link: cachedArticle.link,
  };
}

/**
 * Converts an Article object to a Supabase record
 * @param article - Article object
 * @param category - Category of the article
 * @returns Record to save in Supabase
 */
function toCategorizedArticle(article: Article, category: string): CategorizedArticle {
  if (!article) {
    throw new Error('Article is required');
  }
  
  if (!article.link) {
    throw new Error('Article link is required');
  }
  
  if (!category) {
    throw new Error('Category is required');
  }
  
  // Ensure all fields have values (even if empty strings)
  const safeArticle: CategorizedArticle = {
    article_id: createUniqueId(article.link),
    title: article.title || '',
    description: article.description || '',
    price: article.price || '',
    shipping_price: article.shippingPrice || '',
    image: article.image || '',
    link: article.link,
    category: category,
    created_at: new Date().toISOString(),
  };
  
  return safeArticle;
}

/**
 * Creates a Supabase client with service key (has full permissions, bypasses RLS)
 * @returns Supabase client
 */
function createServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
  
  console.log('Initializing Supabase service client with URL:', supabaseUrl);
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase URL or service key');
  }
  
  // Add explicit headers for service authorization
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        // Clearly define that we're using a service key to bypass RLS
        'apiKey': supabaseServiceKey,
      },
    },
  });
}

/**
 * Creates a Supabase client with anonymous key (subject to RLS restrictions)
 * @returns Supabase client
 */
function createAnonClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  
  return createClient(supabaseUrl, supabaseAnonKey);
}

// Exports
const serviceClient = createServiceClient();

export {
  serviceClient,
  createServiceClient,
  createAnonClient,
  createUniqueId,
  toArticle,
  toCategorizedArticle
}; 