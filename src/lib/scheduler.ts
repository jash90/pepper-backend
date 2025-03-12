import cron, { ScheduledTask } from 'node-cron';
import axios from 'axios';
import config from '../config';

/**
 * Schedule a cron job to fetch and categorize articles every 10 minutes
 * @returns The scheduled cron job or null if disabled
 */
function scheduleFetchCategorizeCache(): ScheduledTask | null {
  // Check if this specific scheduler is enabled
  if (!config.ENABLE_FETCH_CATEGORIZE_SCHEDULER) {
    console.log('Fetch-categorize scheduler is disabled');
    return null;
  }
  
  // Get the cron expression from config (default: every 10 minutes)
  const cronExpression = config.FETCH_CATEGORIZE_CRON;
  console.log(`Setting up cron job to fetch and categorize articles with schedule: ${cronExpression}`);
  
  const cronJob = cron.schedule(cronExpression, async () => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Running scheduled fetch-categorize-cache job...`);
    
    try {
      // Determine the server URL (localhost for development)
      const baseUrl = config.SERVER_BASE_URL || `http://localhost:${config.PORT}`;
      const endpoint = '/api/articles/fetch-categorize-cache';
      const url = `${baseUrl}${endpoint}`;
      
      console.log(`Making request to ${url}`);
      
      // Make the HTTP request to the endpoint
      const response = await axios.get(url);
      
      console.log(`Scheduled job completed successfully. Fetched and categorized ${
        response.data.stats?.totalCategorized || 0
      } articles.`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error in scheduled fetch-categorize-cache job:', error.message);
      } else {
        console.error('Error in scheduled fetch-categorize-cache job:', error);
      }
      
      if (axios.isAxiosError(error) && error.response) {
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
 * @returns An object containing all scheduled jobs
 */
export function startScheduler(): Record<string, ScheduledTask> {
  const jobs: Record<string, ScheduledTask> = {};
  
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

export { scheduleFetchCategorizeCache }; 