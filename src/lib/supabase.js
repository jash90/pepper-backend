const { createClient } = require('@supabase/supabase-js');

// Typy dla tabel Supabase (używane w dokumentacji)
/**
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
 * Tworzenie ID artykułu z linka (używane do identyfikacji artykułów w cache)
 * @param {string} link - Link do artykułu
 * @returns {string} - Unikalny identyfikator artykułu
 */
function createUniqueId(link) {
  return Buffer.from(link).toString('base64');
}

/**
 * Konwertowanie rekordu z Supabase na obiekt Article
 * @param {CategorizedArticle} cachedArticle - Rekord z Supabase
 * @returns {Article} - Obiekt Article
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
 * Konwertowanie obiektu Article na rekord Supabase
 * @param {Article} article - Obiekt Article
 * @param {string} category - Kategoria artykułu
 * @returns {CategorizedArticle} - Rekord do zapisania w Supabase
 */
function toCategorizedArticle(article, category) {
  if (!article) {
    throw new Error('Artykuł jest wymagany');
  }
  
  if (!article.link) {
    throw new Error('Link artykułu jest wymagany');
  }
  
  if (!category) {
    throw new Error('Kategoria jest wymagana');
  }
  
  // Zapewniamy, że wszystkie pola mają wartości (nawet jeśli puste stringi)
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
 * Tworzy klienta Supabase z kluczem serwisowym (ma pełne uprawnienia, omija RLS)
 * @returns {import('@supabase/supabase-js').SupabaseClient} Klient Supabase
 */
function createServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
  
  console.log('Inicjalizuję klienta serwisowego Supabase z URL:', supabaseUrl);
  
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Brak URL lub klucza serwisowego Supabase');
  }
  
  // Dodaję explicit headers dla autoryzacji serwisowej
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        // Jasno definiujemy, że używamy klucza serwisowego, aby ominąć RLS
        'apiKey': supabaseServiceKey,
      },
    },
  });
}

/**
 * Tworzy klienta Supabase z kluczem anonimowym (podlega ograniczeniom RLS)
 * @returns {import('@supabase/supabase-js').SupabaseClient} Klient Supabase
 */
function createAnonClient() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  
  return createClient(supabaseUrl, supabaseAnonKey);
}

// Exporty
const serviceClient = createServiceClient();

module.exports = {
  serviceClient,
  createServiceClient,
  createAnonClient,
  createUniqueId,
  toArticle,
  toCategorizedArticle
}; 