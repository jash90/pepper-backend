const cron = require('node-cron');
const axios = require('axios');
const config = require('../config');

/**
 * Schedule a cron job to fetch and categorize articles every 10 minutes
 */
function scheduleFetchCategorizeCache() {
  // Check if this specific scheduler is enabled
  if (!config.SCHEDULER.FETCH_CATEGORIZE.ENABLED) {
    console.log('Fetch-categorize scheduler is disabled');
    return null;
  }
  
  // Get the cron expression from config (default: every 10 minutes)
  const cronExpression = config.SCHEDULER.FETCH_CATEGORIZE.CRON_EXPRESSION;
  console.log(`Setting up cron job to fetch and categorize articles with schedule: ${cronExpression}`);
  
  const cronJob = cron.schedule(cronExpression, async () => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Running scheduled fetch-categorize-cache job...`);
    
    try {
      // Determine the server URL (localhost for development)
      const baseUrl = config.SERVER.BASE_URL || `http://localhost:${config.SERVER.PORT}`;
      const endpoint = '/api/articles/fetch-categorize-cache';
      const url = `${baseUrl}${endpoint}`;
    
      
      console.log(`Making request to ${url}`);
      
      // Make the HTTP request to the endpoint
      const response = await axios.get(url);
      
      console.log(`Scheduled job completed successfully. Fetched and categorized ${
        response.data.stats?.totalCategorized || 0
      } articles.`);
    } catch (error) {
      console.error('Error in scheduled fetch-categorize-cache job:', error.message);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
      }
    }
  });
  
  // Return the cron job so it can be stopped if needed
  return cronJob;
}

/**
 * Start all scheduled tasks
 */
function startScheduler() {
  const jobs = {};
  
  // Start fetch-categorize scheduler if enabled
  const fetchCategorizeJob = scheduleFetchCategorizeCache();
  if (fetchCategorizeJob) {
    jobs.fetchCategorizeCache = fetchCategorizeJob;
  }
  
  if (Object.keys(jobs).length > 0) {
    console.log('Scheduler started successfully');
  } else {
    console.log('No scheduled jobs were started');
  }
  
  return jobs;
}

module.exports = {
  startScheduler,
  scheduleFetchCategorizeCache
}; 