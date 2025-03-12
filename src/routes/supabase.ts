import express, { Request, Response } from 'express';
import { serviceClient } from '../lib/supabase';

const router = express.Router();

interface TestRecord {
  article_id: string;
  title: string;
  description: string;
  price: string;
  shipping_price: string;
  image: string;
  link: string;
  category: string;
  created_at: string;
}

interface PolicyOperation {
  name: string;
  sql: string;
}

interface OperationResult {
  operation: string;
  success: boolean;
  error?: string;
}

/**
 * @route GET /api/supabase/check
 * @desc Check if Supabase is configured correctly and test connection
 * @access Public
 */
router.get('/check', async (_req: Request, res: Response) => {
  try {
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(503).json({
        status: 'error',
        error: 'Supabase is not configured. Missing environment variables.',
        config: {
          url: !!process.env.SUPABASE_URL,
          serviceKey: !!process.env.SUPABASE_SERVICE_KEY
        }
      });
    }
    
    // Test connection by checking if table exists
    const result: {
      status: string;
      config: {
        url: string | undefined;
        serviceKey: string;
      };
      tests: {
        connection: boolean;
        tableAccess: boolean;
        insert: boolean;
        read: boolean;
        delete: boolean;
      };
      error?: string;
      tableCount?: any;
      insertError?: string;
      rlsError?: boolean;
      rlsErrorDetails?: string;
      readError?: string;
      deleteError?: string;
      testError?: string;
      message?: string;
    } = {
      status: 'success',
      config: {
        url: process.env.SUPABASE_URL,
        serviceKey: '*****' + (process.env.SUPABASE_SERVICE_KEY || '').slice(-5)
      },
      tests: {
        connection: false,
        tableAccess: false,
        insert: false,
        read: false,
        delete: false
      }
    };
    
    // Check connection
    try {
      const { data, error } = await serviceClient.from('categorized_articles').select('count(*)', { count: 'exact', head: true });
      
      if (error) {
        result.tests.connection = false;
        result.error = `Connection error: ${error.message}`;
      } else {
        result.tests.connection = true;
        result.tests.tableAccess = true;
        result.tableCount = data;
      }
    } catch (connectionError) {
      result.tests.connection = false;
      result.error = connectionError instanceof Error ? `Connection error: ${connectionError.message}` : 'Unknown connection error';
      return res.status(500).json(result);
    }
    
    // If connection is successful, try to insert a test record
    if (result.tests.connection) {
      try {
        const testRecord: TestRecord = {
          article_id: `test_${Date.now()}`,
          title: 'Test Article',
          description: 'This is a test article to check Supabase connection.',
          price: '0.00',
          shipping_price: '0.00',
          image: 'https://example.com/test.jpg',
          link: `https://example.com/test-${Date.now()}`,
          category: 'Test',
          created_at: new Date().toISOString()
        };
        
        const { error: insertError } = await serviceClient
          .from('categorized_articles')
          .insert([testRecord]);
          
        if (insertError) {
          result.tests.insert = false;
          result.insertError = insertError.message;
          
          // Check for RLS error
          if (insertError.code === '42501') {
            result.rlsError = true;
            result.rlsErrorDetails = 'Row-level security policy preventing insert operation.';
          }
        } else {
          result.tests.insert = true;
          
          // Try to read the inserted record
          const { error: readError } = await serviceClient
            .from('categorized_articles')
            .select('*')
            .eq('article_id', testRecord.article_id);
            
          if (readError) {
            result.tests.read = false;
            result.readError = readError.message;
          } else {
            result.tests.read = true;
          }
          
          // Try to delete the test record
          const { error: deleteError } = await serviceClient
            .from('categorized_articles')
            .delete()
            .eq('article_id', testRecord.article_id);
            
          if (deleteError) {
            result.tests.delete = false;
            result.deleteError = deleteError.message;
          } else {
            result.tests.delete = true;
          }
        }
      } catch (testError) {
        result.testError = testError instanceof Error ? testError.message : 'Unknown test error';
      }
    }
    
    const allTestsPassed = Object.values(result.tests).every(val => val === true);
    
    if (allTestsPassed) {
      result.message = 'All Supabase tests passed successfully.';
    } else if (result.tests.connection) {
      result.message = 'Connected to Supabase, but some tests failed.';
      result.status = 'warning';
    } else {
      result.message = 'Failed to connect to Supabase.';
      result.status = 'error';
    }
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error checking Supabase:', error);
    return res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

/**
 * @route POST /api/supabase/fix-rls
 * @desc Fix RLS policies for categorized_articles table
 * @access Public (should be restricted in production)
 */
router.post('/fix-rls', async (_req: Request, res: Response) => {
  try {
    // Restrict to development environment
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        status: 'error',
        error: 'This endpoint is only available in development environment'
      });
    }
    
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(503).json({
        status: 'error',
        error: 'Supabase is not configured'
      });
    }
    
    console.log('Attempting to repair RLS policies...');
    
    const results: OperationResult[] = [];
    
    // Drop existing policies
    const dropPoliciesSQL = `
      DROP POLICY IF EXISTS "Tylko odczyt danych cache z ostatnich 30 dni" ON categorized_articles;
      DROP POLICY IF EXISTS "Tylko serwis może dodawać dane do cache" ON categorized_articles;
      DROP POLICY IF EXISTS "Tylko serwis może aktualizować dane w cache" ON categorized_articles;
      DROP POLICY IF EXISTS "Tylko serwis może usuwać dane z cache" ON categorized_articles;
      DROP POLICY IF EXISTS "Anon can read" ON categorized_articles;
      DROP POLICY IF EXISTS "Service role can insert" ON categorized_articles;
      DROP POLICY IF EXISTS "Service role can update" ON categorized_articles;
      DROP POLICY IF EXISTS "Service role can delete" ON categorized_articles;
      DROP POLICY IF EXISTS "Service can insert" ON categorized_articles;
    `;
    
    try {
      await serviceClient.rpc('execute_sql', { sql: dropPoliciesSQL });
      results.push({ operation: 'Drop existing policies', success: true });
    } catch (dropError) {
      console.error('Error dropping policies:', dropError);
      results.push({ 
        operation: 'Drop existing policies', 
        success: false, 
        error: dropError instanceof Error ? dropError.message : 'Unknown error dropping policies'
      });
    }
    
    // Enable RLS
    try {
      await serviceClient.rpc('execute_sql', { 
        sql: `ALTER TABLE categorized_articles ENABLE ROW LEVEL SECURITY;`
      });
      results.push({ operation: 'Enable RLS', success: true });
    } catch (rlsError) {
      console.error('Error enabling RLS:', rlsError);
      results.push({ 
        operation: 'Enable RLS', 
        success: false, 
        error: rlsError instanceof Error ? rlsError.message : 'Unknown error enabling RLS'
      });
    }
    
    // Create new policies
    const createPoliciesSQL: PolicyOperation[] = [
      {
        name: 'Create Read Policy',
        sql: `
          CREATE POLICY "Anon can read" ON categorized_articles
          FOR SELECT 
          USING (true);
        `
      },
      {
        name: 'Create Insert Policy',
        sql: `
          CREATE POLICY "Service can insert" ON categorized_articles
          FOR INSERT 
          WITH CHECK (true);
        `
      },
      {
        name: 'Create Update Policy',
        sql: `
          CREATE POLICY "Service can update" ON categorized_articles
          FOR UPDATE 
          USING (true)
          WITH CHECK (true);
        `
      },
      {
        name: 'Create Delete Policy',
        sql: `
          CREATE POLICY "Service can delete" ON categorized_articles
          FOR DELETE 
          USING (true);
        `
      }
    ];
    
    for (const policy of createPoliciesSQL) {
      try {
        await serviceClient.rpc('execute_sql', { sql: policy.sql });
        results.push({ operation: policy.name, success: true });
      } catch (policyError) {
        console.error(`Error creating policy ${policy.name}:`, policyError);
        results.push({ 
          operation: policy.name, 
          success: false, 
          error: policyError instanceof Error ? policyError.message : `Unknown error creating policy ${policy.name}`
        });
      }
    }
    
    // Test the new policies with a test record
    const testRecord: TestRecord = {
      article_id: `test_fix_rls_${Date.now()}`,
      title: 'Test RLS Fix',
      description: 'This is a test to verify the RLS policies are fixed.',
      price: '0.00',
      shipping_price: '0.00',
      image: 'https://example.com/test.jpg',
      link: `https://example.com/test-rls-${Date.now()}`,
      category: 'Test',
      created_at: new Date().toISOString()
    };
    
    let testResult = {
      insert: false,
      read: false,
      delete: false,
      errors: {} as Record<string, string>
    };
    
    try {
      // Test insert
      const { error: insertError } = await serviceClient
        .from('categorized_articles')
        .insert([testRecord]);
        
      if (insertError) {
        testResult.errors.insert = insertError.message;
      } else {
        testResult.insert = true;
        
        // Test read
        const { error: readError } = await serviceClient
          .from('categorized_articles')
          .select('*')
          .eq('article_id', testRecord.article_id);
          
        if (readError) {
          testResult.errors.read = readError.message;
        } else {
          testResult.read = true;
        }
        
        // Test delete
        const { error: deleteError } = await serviceClient
          .from('categorized_articles')
          .delete()
          .eq('article_id', testRecord.article_id);
          
        if (deleteError) {
          testResult.errors.delete = deleteError.message;
        } else {
          testResult.delete = true;
        }
      }
    } catch (testError) {
      testResult.errors.general = testError instanceof Error ? testError.message : 'Unknown test error';
    }
    
    // Check if all tests passed
    const allPassed = results.every(r => r.success) && 
                      testResult.insert && 
                      testResult.read && 
                      testResult.delete;
    
    return res.status(200).json({
      status: allPassed ? 'success' : 'warning',
      message: allPassed ? 'Successfully fixed RLS policies' : 'Some operations failed',
      results,
      testResult
    });
  } catch (error) {
    console.error('Error fixing RLS policies:', error);
    return res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

/**
 * @route GET /api/supabase/status
 * @desc Check status of Supabase connection
 * @access Public
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(200).json({
        status: 'unconfigured',
        message: 'Supabase is not configured',
        configured: false
      });
    }
    
    try {
      const { count, error } = await serviceClient
        .from('categorized_articles')
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        return res.status(200).json({
          status: 'error',
          message: 'Connected to Supabase but query failed',
          configured: true,
          connected: true,
          error: error.message
        });
      }
      
      return res.status(200).json({
        status: 'online',
        message: 'Supabase connection is healthy',
        configured: true,
        connected: true,
        count
      });
    } catch (connectionError) {
      return res.status(200).json({
        status: 'offline',
        message: 'Failed to connect to Supabase',
        configured: true,
        connected: false,
        error: connectionError instanceof Error ? connectionError.message : 'Unknown connection error'
      });
    }
  } catch (error) {
    console.error('Error checking Supabase status:', error);
    return res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

export default router; 