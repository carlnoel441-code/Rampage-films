import { jobQueue } from './jobQueue';
import { processJob } from './jobProcessors';

/**
 * Background worker that continuously processes jobs from the queue
 */
export class JobWorker {
  private isRunning = false;
  private pollInterval = 2000; // 2 seconds
  private currentJobIds: Set<string> = new Set();
  private shutdownRequested = false;
  private maxConcurrency = 1; // Process 1 job at a time for stability (video downloads are resource-intensive)
  private startTime: number | null = null;
  private lastTimeoutCheck: number = 0;
  private timeoutCheckInterval = 5 * 60 * 1000; // Check for timed-out jobs every 5 minutes

  constructor(private workerId: string = 'default-worker', pollInterval?: number, maxConcurrency?: number) {
    if (pollInterval) {
      this.pollInterval = pollInterval;
    }
    if (maxConcurrency) {
      this.maxConcurrency = maxConcurrency;
    }
  }

  /**
   * Start the worker loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[Worker ${this.workerId}] Already running`);
      return;
    }

    this.isRunning = true;
    this.shutdownRequested = false;
    this.startTime = Date.now();
    console.log(`[Worker ${this.workerId}] Starting worker with ${this.pollInterval}ms poll interval`);

    // Release any stuck jobs from previous crashes
    await this.releaseStuckJobs();

    // Start processing loop
    this.processLoop();
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log(`[Worker ${this.workerId}] Shutdown requested, waiting for ${this.currentJobIds.size} job(s) to finish...`);
    this.shutdownRequested = true;

    // Wait for all current jobs to finish (max 30 seconds)
    const startTime = Date.now();
    while (this.currentJobIds.size > 0 && Date.now() - startTime < 30000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isRunning = false;
    this.startTime = null;
    console.log(`[Worker ${this.workerId}] Stopped`);
  }

  /**
   * Release jobs that were locked by this worker but never completed
   * (happens after crashes or ungraceful shutdowns)
   */
  private async releaseStuckJobs(): Promise<void> {
    try {
      const releasedCount = await jobQueue.releaseStuckJobs();
      if (releasedCount > 0) {
        console.log(`[Worker ${this.workerId}] Released ${releasedCount} stuck jobs`);
      }
    } catch (error) {
      console.error(`[Worker ${this.workerId}] Error releasing stuck jobs:`, error);
    }
  }

  /**
   * Timeout jobs that have been processing for over 180 minutes
   * AI dubbing with gTTS can take 90-120 minutes for movies with 600+ segments
   */
  private async timeoutLongRunningJobs(): Promise<void> {
    try {
      const result = await jobQueue.timeoutLongRunningJobs(360); // 360 minute (6 hour) timeout for large dubbing jobs
      if (result.count > 0) {
        console.log(`[Worker ${this.workerId}] Timed out ${result.count} long-running jobs`);
      }
    } catch (error) {
      console.error(`[Worker ${this.workerId}] Error timing out long-running jobs:`, error);
    }
  }

  /**
   * Main processing loop with parallel job processing
   * Claims jobs sequentially to avoid race conditions
   */
  private async processLoop(): Promise<void> {
    while (this.isRunning && !this.shutdownRequested) {
      try {
        // Periodically check for timed-out jobs (every 5 minutes)
        const now = Date.now();
        if (now - this.lastTimeoutCheck > this.timeoutCheckInterval) {
          this.lastTimeoutCheck = now;
          await this.timeoutLongRunningJobs();
        }

        // Check how many job slots are available
        const availableSlots = this.maxConcurrency - this.currentJobIds.size;
        
        if (availableSlots <= 0) {
          // All slots full, wait a bit before checking again
          await this.sleep(500);
          continue;
        }

        // Claim jobs one at a time sequentially to avoid race conditions
        // Each getNextJob() call atomically locks the job before returning
        const claimedJobs: any[] = [];
        for (let i = 0; i < availableSlots; i++) {
          const job = await jobQueue.getNextJob();
          if (job) {
            claimedJobs.push(job);
          } else {
            // No more jobs available, stop trying
            break;
          }
        }

        if (claimedJobs.length === 0) {
          // No jobs available, wait before polling again
          if (this.currentJobIds.size === 0) {
            console.log(`[Worker ${this.workerId}] No jobs found, sleeping for ${this.pollInterval}ms`);
          }
          await this.sleep(this.pollInterval);
          continue;
        }

        // Process each claimed job in parallel
        console.log(`[Worker ${this.workerId}] Starting ${claimedJobs.length} job(s) (${this.currentJobIds.size + claimedJobs.length}/${this.maxConcurrency} slots used)`);
        
        for (const job of claimedJobs) {
          // Process job without awaiting (parallel execution)
          this.processJobAsync(job);
        }

      } catch (error: any) {
        console.error(`[Worker ${this.workerId}] Error in processing loop:`, error);
        // Wait before retrying to avoid tight error loops
        await this.sleep(this.pollInterval * 2);
      }
    }

    console.log(`[Worker ${this.workerId}] Processing loop exited`);
  }

  /**
   * Process a single job asynchronously
   */
  private async processJobAsync(job: any): Promise<void> {
    this.currentJobIds.add(job.id);
    const startTime = Date.now();
    console.log(`[Worker ${this.workerId}] Processing job ${job.id} (type: ${job.type}, retry: ${job.retryCount}/${job.maxRetries})`);

    try {
      // Process the job
      await processJob(job, jobQueue);

      // Mark as completed
      await jobQueue.completeJob(job.id);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[Worker ${this.workerId}] ✓ Job ${job.id} completed successfully in ${duration}s`);

    } catch (error: any) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`[Worker ${this.workerId}] ✗ Job ${job.id} failed after ${duration}s:`, error.message);
      console.error(`[Worker ${this.workerId}] Error stack:`, error.stack);

      // Determine if error is retryable
      const errorMsg = error.message || 'Unknown error';
      // Don't retry: "not yet implemented" errors or explicit "SKIP_RETRY:" prefix
      const isRetryable = !errorMsg.includes('not yet implemented') && !errorMsg.startsWith('SKIP_RETRY:');

      // Check for structured rate limit hint from processor (via error.retryAfter property)
      // Only apply custom retry delay if processor marked error as retryable
      let customRetryDelay: number | undefined;
      if (isRetryable && (error as any).retryAfter) {
        customRetryDelay = (error as any).retryAfter;
        console.log(`[Worker ${this.workerId}] Processor requested ${customRetryDelay}s retry delay`);
      }

      // failJob() will handle retry logic internally
      await jobQueue.failJob(job.id, errorMsg, isRetryable, customRetryDelay);
      
      if (isRetryable) {
        const delayInfo = customRetryDelay ? ` (${customRetryDelay}s delay)` : '';
        console.log(`[Worker ${this.workerId}] Job ${job.id} will retry (attempt ${job.retryCount + 1}/${job.maxRetries})${delayInfo}`);
      } else {
        console.log(`[Worker ${this.workerId}] Job ${job.id} permanently failed (non-retryable error)`);
      }
    } finally {
      this.currentJobIds.delete(job.id);
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get worker status
   */
  getStatus(): {
    isRunning: boolean;
    currentJobIds: string[];
    activeJobCount: number;
    maxConcurrency: number;
    workerId: string;
    pollInterval: number;
    uptimeSeconds: number | null;
  } {
    return {
      isRunning: this.isRunning,
      currentJobIds: Array.from(this.currentJobIds),
      activeJobCount: this.currentJobIds.size,
      maxConcurrency: this.maxConcurrency,
      workerId: this.workerId,
      pollInterval: this.pollInterval,
      uptimeSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : null,
    };
  }
}

// Singleton worker instance
let workerInstance: JobWorker | null = null;

/**
 * Start the background worker
 */
export function startWorker(workerId?: string, pollInterval?: number, maxConcurrency?: number): JobWorker {
  if (workerInstance) {
    console.log('[JobWorker] Worker already started');
    return workerInstance;
  }

  // Default to 3 concurrent jobs for faster processing while staying stable
  const concurrency = maxConcurrency ?? 3;
  workerInstance = new JobWorker(workerId || 'main-worker', pollInterval, concurrency);
  workerInstance.start();

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[JobWorker] SIGTERM received, shutting down worker...');
    if (workerInstance) {
      await workerInstance.stop();
    }
  });

  process.on('SIGINT', async () => {
    console.log('[JobWorker] SIGINT received, shutting down worker...');
    if (workerInstance) {
      await workerInstance.stop();
    }
  });

  return workerInstance;
}

/**
 * Get the current worker instance
 */
export function getWorker(): JobWorker | null {
  return workerInstance;
}

/**
 * Get worker status for diagnostics
 */
export function getWorkerStatus(): {
  isRunning: boolean;
  currentJobIds: string[];
  activeJobCount: number;
  maxConcurrency: number;
  workerId: string;
  pollInterval: number;
  uptimeSeconds: number | null;
} | null {
  if (!workerInstance) {
    return null;
  }
  return workerInstance.getStatus();
}

/**
 * Stop the worker
 */
export async function stopWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.stop();
    workerInstance = null;
  }
}
