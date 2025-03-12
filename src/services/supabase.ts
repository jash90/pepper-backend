import { createClient, SupabaseClient } from '@supabase/supabase-js';
import config from '../config';

let supabase: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

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
 * Options for querying data from Supabase
 */
export interface GetDataOptions {
  /** Fields to select */
  select?: string;
  /** Filter to apply to the query */
  filter?: {
    /** Column to filter on */
    column: string;
    /** Operator to use (=, !=, >, <, in, etc.) */
    operator: string;
    /** Value to compare against */
    value: any;
  };
  /** Order specification */
  order?: {
    /** Column to order by */
    column: string;
    /** Whether to order ascending */
    ascending?: boolean;
  };
  /** Maximum number of records to return */
  limit?: number;
  /** Number of records to skip */
  offset?: number;
}

/**
 * Options for inserting data into Supabase
 */
export interface InsertDataOptions {
  /** What to return after insertion */
  returning?: 'minimal' | 'representation' | '*';
}

/**
 * Options for upserting data into Supabase
 */
export interface UpsertDataOptions extends InsertDataOptions {
  /** Column to use for conflict resolution */
  onConflict?: string;
}

/**
 * Initialize the Supabase client
 * @returns Whether initialization was successful
 */
function initializeSupabase(): boolean {
  try {
    if (config.SERVICES?.SUPABASE?.URL && config.SERVICES?.SUPABASE?.ANON_KEY) {
      supabase = createClient(config.SERVICES.SUPABASE.URL, config.SERVICES.SUPABASE.ANON_KEY);
      return true;
    }
    console.warn('Supabase credentials not provided. Supabase services will not be available.');
    return false;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    return false;
  }
}

/**
 * Initialize the Supabase service client (has full permissions, bypasses RLS)
 * @returns Whether initialization was successful
 */
function initializeServiceClient(): boolean {
  try {
    if (config.SERVICES?.SUPABASE?.URL && config.SERVICES?.SUPABASE?.SERVICE_KEY) {
      console.log('Initializing Supabase service client with URL:', config.SERVICES.SUPABASE.URL);
      
      serviceClient = createClient(config.SERVICES.SUPABASE.URL, config.SERVICES.SUPABASE.SERVICE_KEY, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            // Clearly define that we're using the service key to bypass RLS
            'apiKey': config.SERVICES.SUPABASE.SERVICE_KEY,
          },
        },
      });
      return true;
    }
    console.warn('Supabase service credentials not provided. Service client will not be available.');
    return false;
  } catch (error) {
    console.error('Failed to initialize Supabase service client:', error);
    return false;
  }
}

/**
 * Create a unique ID for an article from its link (used for identifying articles in cache)
 * @param link - Link to the article
 * @returns Unique article identifier
 */
function createUniqueId(link: string): string {
  return Buffer.from(link).toString('base64');
}

/**
 * Convert a Supabase record to an Article object
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
 * Convert an Article object to a Supabase record
 * @param article - Article object
 * @param category - Article category
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
  
  // Ensure that all fields have values (even if empty strings)
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
 * Get data from a Supabase table
 * @param table - The table to query
 * @param options - Query options (select, filter, etc.)
 * @returns The query results
 */
async function getData<T = any>(table: string, options: GetDataOptions = {}): Promise<T[]> {
  if (!serviceClient) {
    if (!initializeServiceClient()) {
      throw new Error('Supabase service client is not initialized');
    }
  }

  try {
    if (!serviceClient) throw new Error('Service client initialization failed');

    let query = serviceClient.from(table).select(options.select || '*');

    // Apply filters if provided
    if (options.filter) {
      const { column, operator, value } = options.filter;
      
      try {
        // Handle empty arrays for 'in' operator to prevent errors
        if (operator.toLowerCase() === 'in' && Array.isArray(value) && value.length === 0) {
          console.warn('Empty array provided for IN operator, this will return no results');
          return []; // Return empty array early
        }

        // Special handling for 'in' operator with arrays
        if (operator.toLowerCase() === 'in' && Array.isArray(value)) {
          // Using the correct PostgREST syntax for 'in' operator
          // Format: ?column=in.(value1,value2,value3)
          const escapedValues = value.map(v => String(v).replace(/'/g, "''"));
          query = query.filter(column, 'in', `(${escapedValues.join(',')})`);
        } else {
          // Use the standard filter method for other operators
          query = query.filter(column, operator, value);
        }
      } catch (filterError) {
        console.error('Error applying filter:', filterError, { column, operator, value });
        throw new Error(`Failed to apply filter: ${filterError instanceof Error ? filterError.message : String(filterError)}`);
      }
    }

    // Apply ordering if provided
    if (options.order) {
      const { column, ascending } = options.order;
      query = query.order(column, { ascending: ascending ?? true });
    }

    // Apply pagination if provided
    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset !== undefined) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data as T[];
  } catch (error) {
    console.error(`Error fetching data from ${table}:`, error);
    throw new Error(`Failed to fetch data from ${table}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Insert data into a Supabase table
 * @param table - The table to insert into
 * @param data - The data to insert
 * @param options - Additional options
 * @returns The inserted data
 */
async function insertData<T = any>(table: string, data: Record<string, any> | Record<string, any>[], options: InsertDataOptions = {}): Promise<T> {
  if (!serviceClient) {
    if (!initializeServiceClient()) {
      throw new Error('Supabase service client is not initialized');
    }
  }

  try {
    if (!serviceClient) throw new Error('Service client initialization failed');

    const insertOptions: any = {};
    if (options.returning) {
      insertOptions.returning = options.returning;
    }

    const { data: result, error } = await serviceClient
      .from(table)
      .insert(data, insertOptions);

    if (error) {
      throw error;
    }

    return result as T;
  } catch (error) {
    console.error(`Error inserting data into ${table}:`, error);
    throw new Error(`Failed to insert data into ${table}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Upsert data into a Supabase table (insert or update if exists)
 * @param table - The table to upsert into
 * @param data - The data to upsert
 * @param options - Additional options
 * @returns The upserted data
 */
async function upsertData<T = any>(table: string, data: Record<string, any> | Record<string, any>[], options: UpsertDataOptions = {}): Promise<T> {
  if (!serviceClient) {
    if (!initializeServiceClient()) {
      throw new Error('Supabase service client is not initialized');
    }
  }

  try {
    if (!serviceClient) throw new Error('Service client initialization failed');

    const upsertOptions: any = {};
    if (options.onConflict) {
      upsertOptions.onConflict = options.onConflict;
    }
    if (options.returning) {
      upsertOptions.returning = options.returning;
    }

    const { data: result, error } = await serviceClient
      .from(table)
      .upsert(data, upsertOptions);

    if (error) {
      throw error;
    }

    return result as T;
  } catch (error) {
    console.error(`Error upserting data into ${table}:`, error);
    throw new Error(`Failed to upsert data into ${table}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Update data in a Supabase table
 * @param table - The table to update
 * @param data - The data to update
 * @param match - The condition to match records
 * @returns The updated data
 */
async function updateData<T = any>(table: string, data: Record<string, any>, match: Record<string, any>): Promise<T> {
  if (!serviceClient) {
    if (!initializeServiceClient()) {
      throw new Error('Supabase service client is not initialized');
    }
  }

  try {
    if (!serviceClient) throw new Error('Service client initialization failed');

    const { data: result, error } = await serviceClient
      .from(table)
      .update(data)
      .match(match);

    if (error) {
      throw error;
    }

    return result as T;
  } catch (error) {
    console.error(`Error updating data in ${table}:`, error);
    throw new Error(`Failed to update data in ${table}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Delete data from a Supabase table
 * @param table - The table to delete from
 * @param match - The condition to match records
 * @returns Result of the delete operation
 */
async function deleteData<T = any>(table: string, match: Record<string, any>): Promise<T> {
  if (!serviceClient) {
    if (!initializeServiceClient()) {
      throw new Error('Supabase service client is not initialized');
    }
  }

  try {
    if (!serviceClient) throw new Error('Service client initialization failed');

    const { data, error } = await serviceClient
      .from(table)
      .delete()
      .match(match);

    if (error) {
      throw error;
    }

    return data as T;
  } catch (error) {
    console.error(`Error deleting data from ${table}:`, error);
    throw new Error(`Failed to delete data from ${table}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if Supabase is configured with valid credentials
 * @returns True if Supabase is configured, false otherwise
 */
function isConfigured(): boolean {
  return !!(
    config.SERVICES && 
    config.SERVICES.SUPABASE && 
    config.SERVICES.SUPABASE.URL && 
    config.SERVICES.SUPABASE.SERVICE_KEY
  );
}

// Initialize clients on module load
initializeSupabase();
initializeServiceClient();

/**
 * Service client accessor - for backward compatibility
 * @returns The Supabase service client
 */
function getServiceClient(): SupabaseClient | null {
  if (!serviceClient) {
    initializeServiceClient();
  }
  return serviceClient;
}

// Export as default for easier importing
export default {
  getData,
  insertData,
  updateData,
  deleteData,
  upsertData,
  createUniqueId,
  toArticle,
  toCategorizedArticle,
  getServiceClient,
  isConfigured
}; 