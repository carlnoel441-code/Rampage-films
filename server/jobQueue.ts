// Job Queue Service - Manages background job processing
// Supports video downloads and future job types

import { db } from "@db";
import { jobs, type Job, type InsertJob } from "@shared/schema";
import { eq, and, or, isNull, inArray, lte, desc, asc, sql } from "drizzle-orm";

// Job metadata types for different job kinds
export type VideoDownloadMetadata = {
  sourceUrl: string;
  targetFormat: string;
  quality?: 'best' | '720p' | '480p';
};

export type JobMetadata = VideoDownloadMetadata | Record<string, any>;

// Job creation options
export interface CreateJobOptions {
  priority?: number;
  scheduledAt?: Date;
  runAt?: Date;
  maxRetries?: number;
}

// Job filter options
export interface JobFilters {
  type?: string;
  status?: string | string[]; // Support single status or array of statuses
  movieId?: string;
  limit?: number;
  offset?: number;
}

export class JobQueue {
  private workerId: string;
  private lockTimeout: number; // milliseconds

  constructor(workerId: string = 'default-worker', lockTimeout: number = 300000) { // 5 minute lock timeout
    this.workerId = workerId;
    this.lockTimeout = lockTimeout;
  }

  /**
   * Create a new job
   */
  async createJob(
    type: string,
    movieId: string | null,
    metadata: JobMetadata,
    options: CreateJobOptions = {}
  ): Promise<Job> {
    const now = new Date();
    
    const jobData: InsertJob = {
      type,
      movieId: movieId || null,
      metadata,
      status: 'pending',
      priority: options.priority ?? 0,
      scheduledAt: options.scheduledAt ?? now,
      runAt: options.runAt ?? now,
      maxRetries: options.maxRetries ?? 5,  // More retries for better reliability
      progress: 0,
      retryCount: 0,
      startedAt: null,
      completedAt: null,
      error: null,
      lockedBy: null,
      lockedAt: null,
      lastAttemptAt: null,
      retryAfter: null,
      progressDetail: null,
    };

    const [job] = await db.insert(jobs).values(jobData).returning();
    console.log(`[JobQueue] Created job ${job.id} (type: ${type}, priority: ${job.priority})`);
    
    return job;
  }

  /**
   * Get the next available job and lock it for processing
   * Returns null if no jobs are available
   */
  async getNextJob(): Promise<Job | null> {
    const now = new Date();

    // Find the next job that is:
    // 1. Status = 'pending' OR (status = 'failed' AND retryAfter <= now AND retryCount < maxRetries)
    // 2. runAt <= now (scheduled to run)
    // 3. Not locked OR locked but expired
    // Order by: priority DESC, scheduledAt ASC, createdAt ASC

    const eligibleJob = await db
      .select()
      .from(jobs)
      .where(
        and(
          // Status conditions
          or(
            eq(jobs.status, 'pending'),
            and(
              eq(jobs.status, 'failed'),
              or(
                isNull(jobs.retryAfter),
                lte(jobs.retryAfter, now)
              ),
              sql`${jobs.retryCount} < ${jobs.maxRetries}`
            )
          ),
          // Scheduling conditions
          lte(jobs.runAt, now),
          // Lock conditions (not locked or lock expired)
          or(
            isNull(jobs.lockedBy),
            and(
              sql`${jobs.lockedAt} IS NOT NULL`,
              sql`${jobs.lockedAt} < ${new Date(now.getTime() - this.lockTimeout)}`
            )
          )
        )
      )
      .orderBy(
        desc(jobs.priority),
        asc(jobs.scheduledAt),
        asc(jobs.createdAt)
      )
      .limit(1);

    if (eligibleJob.length === 0) {
      return null;
    }

    const job = eligibleJob[0];

    // Lock the job
    const [lockedJob] = await db
      .update(jobs)
      .set({
        status: 'processing',
        lockedBy: this.workerId,
        lockedAt: now,
        startedAt: job.startedAt || now,
        lastAttemptAt: now,
        updatedAt: now,
        error: null, // Clear stale error from previous attempts
      })
      .where(
        and(
          eq(jobs.id, job.id),
          // Ensure job is still available (prevent race conditions)
          or(
            isNull(jobs.lockedBy),
            and(
              sql`${jobs.lockedAt} IS NOT NULL`,
              sql`${jobs.lockedAt} < ${new Date(now.getTime() - this.lockTimeout)}`
            )
          )
        )
      )
      .returning();

    if (!lockedJob) {
      // Job was claimed by another worker
      console.log(`[JobQueue] Job ${job.id} was claimed by another worker`);
      return this.getNextJob(); // Try again
    }

    console.log(`[JobQueue] Locked job ${lockedJob.id} (type: ${lockedJob.type}, worker: ${this.workerId})`);
    return lockedJob;
  }

  /**
   * Update job progress
   * @param merge - If true (default), merges progressDetail with existing data, preserving checkpoint info
   */
  async updateProgress(
    jobId: string,
    progress: number,
    progressDetail?: any,
    merge: boolean = true
  ): Promise<void> {
    const updateData: any = {
      progress: Math.min(100, Math.max(0, progress)),
      updatedAt: new Date(),
    };

    if (progressDetail !== undefined) {
      if (merge) {
        // Merge with existing progressDetail to preserve checkpoint data
        const job = await this.getJob(jobId);
        const existingDetail = (job?.progressDetail as any) || {};
        updateData.progressDetail = { ...existingDetail, ...progressDetail };
      } else {
        updateData.progressDetail = progressDetail;
      }
    }

    await db
      .update(jobs)
      .set(updateData)
      .where(eq(jobs.id, jobId));

    console.log(`[JobQueue] Updated job ${jobId} progress: ${progress}%`);
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId: string): Promise<void> {
    const now = new Date();

    await db
      .update(jobs)
      .set({
        status: 'completed',
        progress: 100,
        completedAt: now,
        updatedAt: now,
        error: null,
      })
      .where(eq(jobs.id, jobId));

    console.log(`[JobQueue] Completed job ${jobId}`);
  }

  /**
   * Mark job as failed
   * Optionally schedule for retry with exponential backoff
   * @param customRetryDelaySeconds - Override the default backoff with a custom delay (e.g., for rate limits)
   */
  async failJob(jobId: string, error: string, shouldRetry: boolean = true, customRetryDelaySeconds?: number): Promise<void> {
    const now = new Date();
    const job = await this.getJob(jobId);

    if (!job) {
      console.error(`[JobQueue] Cannot fail job ${jobId}: job not found`);
      return;
    }

    const newRetryCount = job.retryCount + 1;
    const canRetry = shouldRetry && newRetryCount < job.maxRetries;

    let retryAfter: Date | null = null;
    if (canRetry) {
      // Use custom delay if provided (e.g., for rate limits), otherwise use exponential backoff
      let backoffSeconds: number;
      if (customRetryDelaySeconds && customRetryDelaySeconds > 0) {
        backoffSeconds = customRetryDelaySeconds;
        console.log(`[JobQueue] Job ${jobId} using custom retry delay: ${backoffSeconds}s (rate limit)`);
      } else {
        // Fast retries: 30s, 1m, 2m, 3m, 5m (then caps at 5m)
        backoffSeconds = [30, 60, 120, 180, 300][Math.min(newRetryCount - 1, 4)];
      }
      retryAfter = new Date(now.getTime() + backoffSeconds * 1000);
      console.log(`[JobQueue] Job ${jobId} will retry after ${backoffSeconds}s (attempt ${newRetryCount}/${job.maxRetries})`);
    }

    await db
      .update(jobs)
      .set({
        status: 'failed',
        error,
        // Set retryCount to maxRetries for terminal failures to prevent getNextJob() from re-fetching
        retryCount: canRetry ? newRetryCount : job.maxRetries,
        retryAfter,
        updatedAt: now,
        lockedBy: null,
        lockedAt: null,
      })
      .where(eq(jobs.id, jobId));

    if (!canRetry) {
      console.log(`[JobQueue] Failed job ${jobId} (terminal failure - will not retry)`);
      // Note: Temp directory cleanup is handled by individual job processors
      // when they detect final failure to ensure proper timing
    }
  }

  /**
   * Manually retry a failed job
   * Resets retry count to give the job fresh attempts
   */
  async retryJob(jobId: string): Promise<Job> {
    const [updatedJob] = await db
      .update(jobs)
      .set({
        status: 'pending',
        error: null,
        retryCount: 0, // Reset retry count for manual retries
        retryAfter: null,
        lockedBy: null,
        lockedAt: null,
        startedAt: null, // Reset start time to prevent immediate timeout
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId))
      .returning();

    console.log(`[JobQueue] Manually retried job ${jobId} (retry count and startedAt reset)`);
    return updatedJob;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<Job> {
    const [updatedJob] = await db
      .update(jobs)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
        completedAt: new Date(),
        lockedBy: null,
        lockedAt: null,
      })
      .where(eq(jobs.id, jobId))
      .returning();

    console.log(`[JobQueue] Cancelled job ${jobId}`);
    return updatedJob;
  }

  /**
   * Get a specific job by ID
   */
  async getJob(jobId: string): Promise<Job | null> {
    const result = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get jobs with optional filters
   */
  async getJobs(filters: JobFilters = {}): Promise<Job[]> {
    let query = db.select().from(jobs);

    // Apply filters
    const conditions = [];
    if (filters.type) {
      conditions.push(eq(jobs.type, filters.type));
    }
    if (filters.status) {
      // Support both single status and array of statuses
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(jobs.status, filters.status));
      } else {
        conditions.push(eq(jobs.status, filters.status));
      }
    }
    if (filters.movieId) {
      conditions.push(eq(jobs.movieId, filters.movieId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    // Order by most recent first
    query = query.orderBy(desc(jobs.createdAt)) as any;

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters.offset) {
      query = query.offset(filters.offset) as any;
    }

    return await query;
  }

  /**
   * Release jobs that have been locked for too long OR were locked by this worker
   * This prevents jobs from being stuck if a worker crashes or restarts
   */
  async releaseStuckJobs(): Promise<number> {
    const now = new Date();
    const lockExpiry = new Date(now.getTime() - this.lockTimeout);

    // First, release any jobs locked by THIS worker (handles restarts)
    const ownJobs = await db
      .update(jobs)
      .set({
        status: 'pending',
        error: null,
        lockedBy: null,
        lockedAt: null,
        startedAt: null,
        progress: 0,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.status, 'processing'),
          eq(jobs.lockedBy, this.workerId)
        )
      )
      .returning();

    if (ownJobs.length > 0) {
      console.log(`[JobQueue] Released ${ownJobs.length} job(s) from previous worker instance`);
    }

    // Then, release any expired locks from other workers
    const expiredJobs = await db
      .update(jobs)
      .set({
        status: 'failed',
        error: 'Job lock expired - worker may have crashed',
        lockedBy: null,
        lockedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.status, 'processing'),
          sql`${jobs.lockedAt} < ${lockExpiry}`
        )
      )
      .returning();

    if (expiredJobs.length > 0) {
      console.log(`[JobQueue] Released ${expiredJobs.length} expired lock(s)`);
    }

    return ownJobs.length + expiredJobs.length;
  }

  /**
   * Timeout jobs that have been processing for too long (30 minutes default)
   * These are likely stuck due to API timeouts, rate limits, or crashes
   * Marks them as TERMINAL failed (retryCount = maxRetries) so they won't auto-retry
   * User must click "Retry" in admin panel to manually restart these jobs
   */
  async timeoutLongRunningJobs(maxProcessingMinutes: number = 30): Promise<{ count: number; jobs: string[] }> {
    const now = new Date();
    const timeoutThreshold = new Date(now.getTime() - maxProcessingMinutes * 60 * 1000);

    // First get the jobs we need to timeout (to preserve their maxRetries values)
    const stuckJobs = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.status, 'processing'),
          sql`${jobs.startedAt} < ${timeoutThreshold}`
        )
      );

    if (stuckJobs.length === 0) {
      return { count: 0, jobs: [] };
    }

    // Update each job to terminal failed state (retryCount = maxRetries prevents auto-retry)
    const timedOutIds: string[] = [];
    for (const job of stuckJobs) {
      await db
        .update(jobs)
        .set({
          status: 'failed',
          error: `Job timed out after ${maxProcessingMinutes} minutes - likely stuck due to API rate limits or network issues. Click "Retry" to try again.`,
          retryCount: job.maxRetries, // Set to max so it won't auto-retry
          retryAfter: null,
          lockedBy: null,
          lockedAt: null,
          updatedAt: now,
        })
        .where(eq(jobs.id, job.id));
      timedOutIds.push(job.id);
    }

    console.log(`[JobQueue] Timed out ${timedOutIds.length} long-running job(s) (>${maxProcessingMinutes}min) - requires manual retry`);

    return { 
      count: timedOutIds.length, 
      jobs: timedOutIds 
    };
  }

  /**
   * Release ALL stuck processing jobs back to pending status
   * This works regardless of which worker originally locked the job
   * Use for manual recovery when jobs are stuck from old deployments
   * FORCE MODE: Releases ALL processing jobs immediately, ignoring lock timeout
   */
  async releaseAllStuckJobs(): Promise<{ count: number }> {
    const now = new Date();

    // Reset ALL processing jobs back to pending - no lock timeout check
    // This is used for manual recovery when user explicitly requests it
    const result = await db
      .update(jobs)
      .set({
        status: 'pending',
        lockedBy: null,
        lockedAt: null,
        error: null,
        updatedAt: now,
        retryCount: 0, // Reset retry count for fresh start
      })
      .where(eq(jobs.status, 'processing'))
      .returning();

    console.log(`[JobQueue] FORCE released ${result.length} processing job(s) back to pending`);
    return { count: result.length };
  }

  /**
   * Get job statistics using efficient SQL COUNT queries
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    cancelled: number;
  }> {
    // Use SQL COUNT queries instead of loading all jobs into memory
    // This is much faster for large job counts (1000+)
    const result = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
      FROM jobs
    `);

    const row = result.rows[0] as any;
    return {
      total: parseInt(row.total) || 0,
      pending: parseInt(row.pending) || 0,
      processing: parseInt(row.processing) || 0,
      completed: parseInt(row.completed) || 0,
      failed: parseInt(row.failed) || 0,
      cancelled: parseInt(row.cancelled) || 0,
    };
  }

  /**
   * Bulk operations for better job management
   */
  
  async deleteCompletedJobs(): Promise<{ count: number }> {
    const result = await db
      .delete(jobs)
      .where(eq(jobs.status, 'completed'))
      .returning();
    
    console.log(`[JobQueue] Deleted ${result.length} completed jobs`);
    return { count: result.length };
  }

  async deleteFailedJobs(): Promise<{ count: number }> {
    const result = await db
      .delete(jobs)
      .where(eq(jobs.status, 'failed'))
      .returning();
    
    console.log(`[JobQueue] Deleted ${result.length} failed jobs`);
    return { count: result.length };
  }

  async cancelAllPending(): Promise<{ count: number }> {
    const now = new Date();
    const result = await db
      .update(jobs)
      .set({
        status: 'cancelled',
        updatedAt: now,
        completedAt: now,
        lockedBy: null,
        lockedAt: null,
      })
      .where(eq(jobs.status, 'pending'))
      .returning();
    
    console.log(`[JobQueue] Cancelled ${result.length} pending jobs`);
    return { count: result.length };
  }

  async deleteCancelledJobs(): Promise<{ count: number }> {
    const result = await db
      .delete(jobs)
      .where(eq(jobs.status, 'cancelled'))
      .returning();
    
    console.log(`[JobQueue] Deleted ${result.length} cancelled jobs`);
    return { count: result.length };
  }

  async deleteAllJobs(): Promise<{ count: number }> {
    const result = await db
      .delete(jobs)
      .returning();
    
    console.log(`[JobQueue] Deleted ALL ${result.length} jobs (full reset)`);
    return { count: result.length };
  }
}

// Singleton instance for the application
export const jobQueue = new JobQueue('main-worker');
