const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

let supabase = null;
let serviceClient = null;

/**
 * Typy dla tabel Supabase (używane w dokumentacji)
 * @typedef {Object} CategorizedArticle
 * @property {string} article_id - Unikalny identyfikator artykułu (Base64 z linka)
 * @property {string} title - Tytuł artykułu
 * @property {string} description - Opis artykułu
 * @property {string} price - Cena artykułu
 * @property {string} shipping_price - Cena wysyłki
 * @property {string} image - URL obrazka
 * @property {string} link - Link do artykułu
 * @property {string} category - Kategoria artykułu
 * @property {string} created_at - Data utworzenia rekordu
 */

/**
 * @typedef {Object} Article
 * @property {string} title - Tytuł artykułu
 * @property {string} description - Opis artykułu
 * @property {string} price - Cena artykułu
 * @property {string} shippingPrice - Cena wysyłki
 * @property {string} image - URL obrazka
 * @property {string} link - Link do artykułu
 */

/**
 * Initialize the Supabase client
 */
function initializeSupabase() {
  try {
    if (config.SERVICES.SUPABASE.URL && config.SERVICES.SUPABASE.ANON_KEY) {
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
 */
function initializeServiceClient() {
  try {
    if (config.SERVICES.SUPABASE.URL && config.SERVICES.SUPABASE.SERVICE_KEY) {
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
 * @param {string} link - Link to the article
 * @returns {string} - Unique article identifier
 */
function createUniqueId(link) {
  return Buffer.from(link).toString('base64');
}

/**
 * Convert a Supabase record to an Article object
 * @param {CategorizedArticle} cachedArticle - Record from Supabase
 * @returns {Article} - Article object
 */
function toArticle(cachedArticle) {
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
 * @param {Article} article - Article object
 * @param {string} category - Article category
 * @returns {CategorizedArticle} - Record to save in Supabase
 */
function toCategorizedArticle(article, category) {
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
  const safeArticle = {
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
 * @param {string} table - The table to query
 * @param {Object} options - Query options (select, filter, etc.)
 * @returns {Promise<Array>} The query results
 */
async function getData(table, options = {}) {
  if (!serviceClient) {
    if (!initializeServiceClient()) {
      throw new Error('Supabase service client is not initialized');
    }
  }

  try {
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
          query = query.filter(`${column}`, 'in', `(${escapedValues.join(',')})`);
        } else {
          // Use the standard filter method for other operators
          query = query.filter(column, operator, value);
        }
      } catch (filterError) {
        console.error('Error applying filter:', filterError, { column, operator, value });
        throw new Error(`Failed to apply filter: ${filterError.message}`);
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

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error(`Error fetching data from ${table}:`, error);
    throw new Error(`Failed to fetch data from ${table}: ${error.message}`);
  }
}

/**
 * Insert data into a Supabase table
 * @param {string} table - The table to insert into
 * @param {Object|Array} data - The data to insert
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} The inserted data
 */
async function insertData(table, data, options = {}) {
  if (!serviceClient) {
    if (!initializeServiceClient()) {
      throw new Error('Supabase service client is not initialized');
    }
  }

  try {
    const { data: result, error } = await serviceClient
      .from(table)
      .insert(data, { returning: options.returning || 'minimal' });

    if (error) {
      throw error;
    }

    return result;
  } catch (error) {
    console.error(`Error inserting data into ${table}:`, error);
    throw new Error(`Failed to insert data into ${table}: ${error.message}`);
  }
}

/**
 * Upsert data into a Supabase table (insert or update if exists)
 * @param {string} table - The table to upsert into
 * @param {Object|Array} data - The data to upsert
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} The upserted data
 */
async function upsertData(table, data, options = {}) {
  if (!serviceClient) {
    if (!initializeServiceClient()) {
      throw new Error('Supabase service client is not initialized');
    }
  }

  try {
    const { data: result, error } = await serviceClient
      .from(table)
      .upsert(data, { 
        onConflict: options.onConflict || 'article_id',
        returning: options.returning || 'minimal' 
      });

    if (error) {
      throw error;
    }

    return result;
  } catch (error) {
    console.error(`Error upserting data into ${table}:`, error);
    throw new Error(`Failed to upsert data into ${table}: ${error.message}`);
  }
}

/**
 * Update data in a Supabase table
 * @param {string} table - The table to update
 * @param {Object} data - The data to update
 * @param {Object} match - The condition to match records
 * @returns {Promise<Object>} The updated data
 */
async function updateData(table, data, match) {
  if (!serviceClient) {
    if (!initializeServiceClient()) {
      throw new Error('Supabase service client is not initialized');
    }
  }

  try {
    const { data: result, error } = await serviceClient
      .from(table)
      .update(data)
      .match(match);

    if (error) {
      throw error;
    }

    return result;
  } catch (error) {
    console.error(`Error updating data in ${table}:`, error);
    throw new Error(`Failed to update data in ${table}: ${error.message}`);
  }
}

/**
 * Delete data from a Supabase table
 * @param {string} table - The table to delete from
 * @param {Object} match - The condition to match records
 * @returns {Promise<Object>} Result of the delete operation
 */
async function deleteData(table, match) {
  if (!serviceClient) {
    if (!initializeServiceClient()) {
      throw new Error('Supabase service client is not initialized');
    }
  }

  try {
    const { data, error } = await serviceClient
      .from(table)
      .delete()
      .match(match);

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error(`Error deleting data from ${table}:`, error);
    throw new Error(`Failed to delete data from ${table}: ${error.message}`);
  }
}

/**
 * Check if Supabase is configured with valid credentials
 * @returns {boolean} True if Supabase is configured, false otherwise
 */
function isConfigured() {
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

// Service client accessor - for backward compatibility
function getServiceClient() {
  if (!serviceClient) {
    initializeServiceClient();
  }
  return serviceClient;
}

module.exports = {
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
