// Article related types
export interface Article {
  link: string;
  title: string;
  price?: string;
  shippingPrice?: string;
  description?: string;
  image?: string;
  category?: string;
}

export interface CategorizedArticle extends Article {
  category: string;
  article_id: string;
  created_at?: string;
}

// Supabase related types
export interface SupabaseConfig {
  URL: string;
  SERVICE_KEY: string;
  ANON_KEY?: string;
}

export interface ServicesConfig {
  SUPABASE?: SupabaseConfig;
  OPENAI?: {
    API_KEY: string;
  };
}

export interface AppConfig {
  PORT: number;
  NODE_ENV: string;
  CORS_ORIGIN: string;
  SERVER_BASE_URL: string;
  SERVICES: ServicesConfig;
  CACHE_CLEANUP_INTERVAL_MS: number;
  CACHE_EXPIRATION_SECONDS: number;
  ENABLE_SCHEDULER: boolean;
  ENABLE_FETCH_CATEGORIZE_SCHEDULER: boolean;
  SCHEDULER_FETCH_PAGES: number;
  SCHEDULER_USE_AI: boolean;
  FETCH_CATEGORIZE_CRON: string;
}

// Cache related types
export interface CacheOptions {
  expirationTimeSeconds?: number;
}

// Supabase filter types
export interface SupabaseFilter {
  column: string;
  operator: string;
  value: any;
}

export interface SupabaseQueryOptions {
  filter?: SupabaseFilter;
  select?: string[];
  onConflict?: string;
  returning?: string;
}

// Category definitions
export enum Category {
  ELECTRONICS = "Electronics",
  HOME_HOUSEHOLD = "Home & Household",
  FASHION = "Fashion",
  FOOD_GROCERY = "Food & Grocery",
  SPORTS_OUTDOOR = "Sports & Outdoor",
  BEAUTY_HEALTH = "Beauty & Health",
  TRAVEL = "Travel",
  ENTERTAINMENT = "Entertainment",
  KIDS_TOYS = "Kids & Toys",
  AUTOMOTIVE = "Automotive",
  SERVICES = "Services",
  OTHER = "Other Deals"
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: any;
} 