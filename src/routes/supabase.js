const express = require('express');
const router = express.Router();
const { serviceClient } = require('../lib/supabase');

/**
 * @route GET /api/supabase/check
 * @desc Check if Supabase is configured correctly and test connection
 * @access Public
 */
router.get('/check', async (req, res) => {
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
    const result = {
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
      result.error = `Connection error: ${connectionError.message}`;
      return res.status(500).json(result);
    }
    
    // If connection is successful, try to insert a test record
    if (result.tests.connection) {
      try {
        const testRecord = {
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
        
        const { data: insertData, error: insertError } = await serviceClient
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
          const { data: readData, error: readError } = await serviceClient
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
        result.testError = testError.message;
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
router.post('/fix-rls', async (req, res) => {
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
    
    const results = [];
    
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
      results.push({ operation: 'Drop existing policies', success: false, error: dropError.message });
    }
    
    // Enable RLS
    try {
      await serviceClient.rpc('execute_sql', { 
        sql: `ALTER TABLE categorized_articles ENABLE ROW LEVEL SECURITY;`
      });
      results.push({ operation: 'Enable RLS', success: true });
    } catch (rlsError) {
      console.error('Error enabling RLS:', rlsError);
      results.push({ operation: 'Enable RLS', success: false, error: rlsError.message });
    }
    
    // Create new policies
    const createPoliciesSQL = [
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
        results.push({ operation: policy.name, success: false, error: policyError.message });
      }
    }
    
    // Test the new policies with a test record
    const testRecord = {
      article_id: `test_fix_rls_${Date.now()}`,
      title: 'Test RLS Fix',
      description: 'Testing if RLS policies are now working',
      price: '0.00',
      shipping_price: '0.00',
      image: 'https://example.com/test.jpg',
      link: `https://example.com/test-${Date.now()}`,
      category: 'Test',
      created_at: new Date().toISOString()
    };
    
    try {
      const { data: insertData, error: insertError } = await serviceClient
        .from('categorized_articles')
        .insert([testRecord]);
        
      results.push({ 
        operation: 'Test Insert', 
        success: !insertError,
        error: insertError ? insertError.message : null 
      });
      
      // If insert was successful, try to delete the test record
      if (!insertError) {
        const { error: deleteError } = await serviceClient
          .from('categorized_articles')
          .delete()
          .eq('article_id', testRecord.article_id);
          
        results.push({ 
          operation: 'Test Delete', 
          success: !deleteError,
          error: deleteError ? deleteError.message : null 
        });
      }
    } catch (testError) {
      results.push({ 
        operation: 'Test Operations', 
        success: false,
        error: testError.message 
      });
    }
    
    const allSuccessful = results.every(result => result.success);
    
    return res.status(200).json({
      status: allSuccessful ? 'success' : 'partial',
      message: 'RLS policy repair attempt completed',
      results
    });
  } catch (error) {
    console.error('Error fixing RLS:', error);
    return res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

/**
 * @route GET /api/supabase/check-rls
 * @desc Check RLS policies on the categorized_articles table
 * @access Public
 */
router.get('/check-rls', async (req, res) => {
  try {
    // Check if Supabase is configured
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(503).json({
        status: 'error',
        error: 'Supabase is not configured'
      });
    }
    
    let result = {
      status: 'checking',
      rls: {
        enabled: null,
        policies: []
      }
    };
    
    // Check if RLS is enabled
    try {
      const { data: rlsData, error: rlsError } = await serviceClient.rpc('execute_sql', { 
        sql: `
          SELECT relrowsecurity 
          FROM pg_class 
          WHERE oid = 'categorized_articles'::regclass;
        `
      });
      
      if (rlsError) {
        console.error('Error checking if RLS is enabled:', rlsError);
        result.rls.error = rlsError.message;
      } else if (rlsData && rlsData.length > 0) {
        result.rls.enabled = rlsData[0].relrowsecurity;
      }
    } catch (rlsCheckError) {
      console.error('Error in RLS check:', rlsCheckError);
      result.rls.error = rlsCheckError.message;
    }
    
    // Get existing policies
    try {
      const { data: policiesData, error: policiesError } = await serviceClient.rpc('execute_sql', { 
        sql: `
          SELECT 
            polname AS policy_name,
            polcmd AS command,
            polpermissive AS permissive,
            polroles AS roles,
            polqual AS check_expression
          FROM 
            pg_policy 
          WHERE 
            polrelid = 'categorized_articles'::regclass;
        `
      });
      
      if (policiesError) {
        console.error('Error getting policies:', policiesError);
        result.rls.policiesError = policiesError.message;
      } else {
        result.rls.policies = policiesData || [];
      }
    } catch (policiesCheckError) {
      console.error('Error in policies check:', policiesCheckError);
      result.rls.policiesError = policiesCheckError.message;
    }
    
    // Analyze RLS status
    if (result.rls.enabled === true && result.rls.policies.length > 0) {
      result.status = 'ok';
      result.message = 'RLS is enabled with policies defined.';
    } else if (result.rls.enabled === true && result.rls.policies.length === 0) {
      result.status = 'warning';
      result.message = 'RLS is enabled but no policies are defined. This may block all operations.';
    } else if (result.rls.enabled === false) {
      result.status = 'warning';
      result.message = 'RLS is disabled. All operations are allowed without restrictions.';
    } else {
      result.status = 'error';
      result.message = 'Could not determine RLS status.';
    }
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error checking RLS:', error);
    return res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    });
  }
});

module.exports = router; 