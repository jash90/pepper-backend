import cron, { ScheduledTask } from 'node-cron';
import axios from 'axios';
import config from '../config';

// Flaga lockująca, aby zapobiec równoczesnemu uruchomieniu wielu instancji zadania
let isJobRunning = false;

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
    // Jeśli zadanie jest już uruchomione, pomijamy tę iterację
    if (isJobRunning) {
      console.log('Previous fetch-categorize-cache job is still running. Skipping this execution.');
      return;
    }
    
    isJobRunning = true;
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Running scheduled fetch-categorize-cache job...`);
    
    try {
      // Determine the server URL (localhost for development)
      const baseUrl = config.SERVER_BASE_URL || `http://localhost:${config.PORT}`;
      
      // Pobieramy tylko 1 stronę artykułów zamiast domyślnych 3, żeby zaoszczędzić zasoby
      const pagesParam = Math.min(config.SCHEDULER_FETCH_PAGES || 1, 2); // Maksymalnie 2 strony w zadaniu cron
      const endpoint = `/api/articles/fetch-categorize-cache?maxPages=${pagesParam}`;
      const url = `${baseUrl}${endpoint}`;
      
      console.log(`Making request to ${url}`);
      
      // Make the HTTP request to the endpoint, z timeoutem
      const response = await axios.get(url, {
        timeout: 60000, // 60 sekund timeoutu
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        }
      });
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`Scheduled job completed successfully in ${duration}s. Fetched and categorized ${
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
    } finally {
      // Zwalniamy lock, niezależnie od wyniku
      isJobRunning = false;
      
      // Wymuszamy garbage collection, jeśli jest dostępne
      if (global.gc) {
        try {
          global.gc();
        } catch (gcError) {
          console.warn('Error during manual garbage collection:', gcError);
        }
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

/**
 * Zatrzymaj wszystkie zadania cron
 * @param jobs Obiekt zawierający zadania cron
 */
export function stopScheduler(jobs: Record<string, ScheduledTask>): void {
  if (!jobs || Object.keys(jobs).length === 0) {
    console.log('No scheduled jobs to stop');
    return;
  }
  
  console.log(`Stopping ${Object.keys(jobs).length} scheduled jobs...`);
  
  for (const [name, job] of Object.entries(jobs)) {
    try {
      job.stop();
      console.log(`Stopped ${name} job`);
    } catch (error) {
      console.error(`Error stopping ${name} job:`, error);
    }
  }
  
  console.log('All scheduled jobs stopped');
}

export { scheduleFetchCategorizeCache }; 