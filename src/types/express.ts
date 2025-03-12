import { Request as ExpressRequest, Response as ExpressResponse, NextFunction, RequestHandler as ExpressRequestHandler } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

// Export enhanced Request and Response types for TypeScript to use in route handlers
export type Request<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = ParsedQs,
  Locals extends Record<string, any> = Record<string, any>
> = ExpressRequest<P, ResBody, ReqBody, ReqQuery, Locals>;

export type Response<
  ResBody = any,
  Locals extends Record<string, any> = Record<string, any>
> = ExpressResponse<ResBody, Locals>;

// Define a RequestHandler type that works with our custom Request and Response types
export type RequestHandler<
  P = ParamsDictionary,
  ResBody = any,
  ReqBody = any,
  ReqQuery = ParsedQs,
  Locals extends Record<string, any> = Record<string, any>
> = (
  req: Request<P, ResBody, ReqBody, ReqQuery, Locals>,
  res: Response<ResBody, Locals>,
  next: NextFunction
) => Promise<any> | any;

// Re-export NextFunction for completeness
export type { NextFunction };

// Common request query parameters
export interface ArticlesRequestQuery extends ParsedQs {
  page?: string;
  pages?: string;
  maxPages?: string;
  batchSize?: string;
  days?: string;
  limit?: string;
  minCached?: string;
  fallbackPages?: string;
  skipCache?: string;
  skipLocalCache?: string;
}

export interface CacheQueryParams extends ParsedQs {
  categories?: string;
  limit?: string;
  offset?: string;
  days?: string;
  mode?: string;
}

export interface LookupRequestBody {
  links: string[];
}

export interface CategorizeRequestBody {
  articles: Array<{
    link: string;
    title: string;
    price?: string;
    shippingPrice?: string;
    description?: string;
    image?: string;
  }>;
  options?: {
    useAI?: boolean;
    saveToSupabase?: boolean;
  };
} 