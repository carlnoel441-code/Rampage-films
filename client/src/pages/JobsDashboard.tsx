import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { queryClient } from "@/lib/queryClient";
import { type Job } from "@shared/schema";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, RotateCcw, XCircle, Clock, CheckCircle2, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type JobStats = {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
};

type WorkerStatus = {
  worker: {
    isRunning: boolean;
    workerId: string;
    activeJobCount: number;
    maxConcurrency: number;
    pollInterval: number;
    uptimeSeconds: number | null;
  } | null;
  stats: JobStats;
  pendingJobs: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: string;
    runAt: string;
    lockedBy: string | null;
    lockedAt: string | null;
  }>;
  serverTime: string;
  environment: string;
};

function getProgressMessage(progressDetail: unknown): string | null {
  if (!progressDetail || typeof progressDetail !== 'object') return null;
  const detail = progressDetail as Record<string, unknown>;
  if ('message' in detail && typeof detail.message === 'string') {
    return detail.message;
  }
  return null;
}

export default function JobsDashboard() {
  const { isAuthorized } = useAdminAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  // Track previous job statuses to detect completions
  const prevJobStatusesRef = useRef<Map<string, string>>(new Map());

  const { data: jobsData, isLoading } = useQuery<{ jobs: Job[]; count: number }>({
    queryKey: ["/api/admin/jobs", statusFilter, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (typeFilter !== "all") params.append("type", typeFilter);
      
      const url = `/api/admin/jobs${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
    enabled: isAuthorized,
    refetchInterval: autoRefresh ? 5000 : false,
    staleTime: 0, // Always refetch - override global staleTime: Infinity
  });

  const { data: stats } = useQuery<JobStats>({
    queryKey: ["/api/admin/jobs/stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/jobs/stats", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: isAuthorized,
    refetchInterval: autoRefresh ? 5000 : false,
    staleTime: 0,
  });

  const { data: workerStatus } = useQuery<WorkerStatus>({
    queryKey: ["/api/admin/worker/status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/worker/status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch worker status");
      return res.json();
    },
    enabled: isAuthorized,
    refetchInterval: autoRefresh ? 5000 : false,
    staleTime: 0,
  });

  const jobs = jobsData?.jobs || [];

  // Detect when jobs complete and invalidate movie cache
  useEffect(() => {
    if (!jobs.length) return;

    const prevStatuses = prevJobStatusesRef.current;
    const newlyCompletedMovieIds: string[] = [];

    for (const job of jobs) {
      const prevStatus = prevStatuses.get(job.id);
      // Check if job just completed (was something else, now completed)
      if (prevStatus && prevStatus !== 'completed' && job.status === 'completed' && job.movieId) {
        newlyCompletedMovieIds.push(job.movieId);
        console.log(`[JobsDashboard] Job ${job.id} completed for movie ${job.movieId}, invalidating cache`);
      }
      // Update tracking
      prevStatuses.set(job.id, job.status);
    }

    // Invalidate movie queries for newly completed jobs
    if (newlyCompletedMovieIds.length > 0) {
      // Invalidate all movies list
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      // Invalidate individual movie queries (match the exact format used in MovieDetail)
      for (const movieId of newlyCompletedMovieIds) {
        queryClient.invalidateQueries({ queryKey: [`/api/movies/${movieId}`] });
      }
    }
  }, [jobs]);

  const handleRetry = async (jobId: string) => {
    try {
      await fetch(`/api/admin/jobs/${jobId}/retry`, {
        method: "POST",
        credentials: "include",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs/stats"] });
      
      toast({
        title: "Job Retried",
        description: "Job has been queued for retry",
      });
    } catch (error: any) {
      toast({
        title: "Retry Failed",
        description: error.message || "Failed to retry job",
        variant: "destructive",
      });
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      await fetch(`/api/admin/jobs/${jobId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs/stats"] });
      
      toast({
        title: "Job Cancelled",
        description: "Job has been cancelled successfully",
      });
    } catch (error: any) {
      toast({
        title: "Cancel Failed",
        description: error.message || "Failed to cancel job",
        variant: "destructive",
      });
    }
  };

  const handleBulkDeleteCompleted = async () => {
    try {
      const response = await fetch("/api/admin/jobs/bulk/delete-completed", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs/stats"] });
      
      toast({
        title: "Completed Jobs Deleted",
        description: `Successfully deleted ${data.count} completed jobs`,
      });
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete completed jobs",
        variant: "destructive",
      });
    }
  };

  const handleBulkDeleteFailed = async () => {
    try {
      const response = await fetch("/api/admin/jobs/bulk/delete-failed", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs/stats"] });
      
      toast({
        title: "Failed Jobs Deleted",
        description: `Successfully deleted ${data.count} failed jobs`,
      });
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete failed jobs",
        variant: "destructive",
      });
    }
  };

  const handleBulkCancelPending = async () => {
    try {
      const response = await fetch("/api/admin/jobs/bulk/cancel-pending", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs/stats"] });
      
      toast({
        title: "Pending Jobs Cancelled",
        description: `Successfully cancelled ${data.count} pending jobs`,
      });
    } catch (error: any) {
      toast({
        title: "Cancel Failed",
        description: error.message || "Failed to cancel pending jobs",
        variant: "destructive",
      });
    }
  };

  const handleReleaseStuckJobs = async () => {
    try {
      const response = await fetch("/api/admin/jobs/bulk/release-stuck", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs/stats"] });
      
      toast({
        title: "Stuck Jobs Released",
        description: `Successfully released ${data.count} stuck jobs back to pending`,
      });
    } catch (error: any) {
      toast({
        title: "Release Failed",
        description: error.message || "Failed to release stuck jobs",
        variant: "destructive",
      });
    }
  };

  const handleBulkDeleteCancelled = async () => {
    try {
      const response = await fetch("/api/admin/jobs/bulk/delete-cancelled", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs/stats"] });
      
      toast({
        title: "Cancelled Jobs Deleted",
        description: `Successfully deleted ${data.count} cancelled jobs`,
      });
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete cancelled jobs",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAllJobs = async () => {
    if (!confirm("Are you sure you want to delete ALL jobs? This cannot be undone.")) {
      return;
    }
    try {
      const response = await fetch("/api/admin/jobs/bulk/delete-all", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs/stats"] });
      
      toast({
        title: "All Jobs Deleted",
        description: `Successfully deleted ${data.count} jobs - Dashboard reset`,
      });
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete all jobs",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4" data-testid="icon-status-completed" />;
      case "processing":
        return <Loader2 className="w-4 h-4 animate-spin" data-testid="icon-status-processing" />;
      case "failed":
        return <AlertCircle className="w-4 h-4" data-testid="icon-status-failed" />;
      case "cancelled":
        return <XCircle className="w-4 h-4" data-testid="icon-status-cancelled" />;
      case "pending":
        return <Clock className="w-4 h-4" data-testid="icon-status-pending" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "completed":
        return "default";
      case "processing":
        return "secondary";
      case "failed":
        return "destructive";
      case "cancelled":
      case "pending":
        return "outline";
      default:
        return "outline";
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Unauthorized</CardTitle>
              <CardDescription>Please log in as admin to view jobs</CardDescription>
            </CardHeader>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gold">Jobs Dashboard</h1>
            <p className="text-muted-foreground">Monitor and manage background jobs</p>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs/stats"] });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/worker/status"] });
                toast({
                  title: "Refreshed",
                  description: "Jobs data has been refreshed",
                });
              }}
              data-testid="button-refresh"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                queryClient.clear();
                window.location.reload();
              }}
              data-testid="button-hard-refresh"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Hard Refresh
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total</CardDescription>
                <CardTitle className="text-2xl" data-testid="stat-total">{stats.total}</CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pending</CardDescription>
                <CardTitle className="text-2xl text-muted-foreground" data-testid="stat-pending">{stats.pending}</CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Processing</CardDescription>
                <CardTitle className="text-2xl text-blue-500" data-testid="stat-processing">{stats.processing}</CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Completed</CardDescription>
                <CardTitle className="text-2xl text-green-500" data-testid="stat-completed">{stats.completed}</CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Failed</CardDescription>
                <CardTitle className="text-2xl text-red-500" data-testid="stat-failed">{stats.failed}</CardTitle>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Cancelled</CardDescription>
                <CardTitle className="text-2xl text-muted-foreground" data-testid="stat-cancelled">{stats.cancelled}</CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}

        {/* Worker Status Card */}
        <Card className={workerStatus?.worker?.isRunning ? "border-green-500/50" : "border-red-500/50"}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                Background Worker
                {workerStatus?.worker?.isRunning ? (
                  <Badge variant="default" className="bg-green-500">Running</Badge>
                ) : (
                  <Badge variant="destructive">Not Running</Badge>
                )}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {workerStatus?.environment || "unknown"} environment
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {workerStatus?.worker ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Worker ID:</span>
                  <p className="font-mono">{workerStatus.worker.workerId}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Active Jobs:</span>
                  <p>{workerStatus.worker.activeJobCount} / {workerStatus.worker.maxConcurrency}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Poll Interval:</span>
                  <p>{workerStatus.worker.pollInterval}ms</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Uptime:</span>
                  <p>{workerStatus.worker.uptimeSeconds != null 
                    ? `${Math.floor(workerStatus.worker.uptimeSeconds / 60)}m ${workerStatus.worker.uptimeSeconds % 60}s`
                    : "N/A"}</p>
                </div>
              </div>
            ) : (
              <p className="text-red-500">Worker not initialized - jobs will not be processed!</p>
            )}
            {workerStatus && workerStatus.pendingJobs.length > 0 && (
              <div className="mt-4 text-sm">
                <p className="text-muted-foreground mb-2">Pending jobs waiting to be processed:</p>
                <div className="space-y-1">
                  {workerStatus.pendingJobs.slice(0, 5).map(job => (
                    <div key={job.id} className="flex justify-between text-xs bg-muted p-2 rounded">
                      <span>{job.type}</span>
                      <span>Created: {new Date(job.createdAt).toLocaleTimeString()}</span>
                      {job.lockedBy && <span className="text-yellow-500">Locked by: {job.lockedBy}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {stats && (stats.completed > 0 || stats.failed > 0 || stats.pending > 0 || stats.cancelled > 0 || stats.processing > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Bulk Actions</CardTitle>
              <CardDescription>Manage multiple jobs at once</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {stats.completed > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDeleteCompleted}
                    data-testid="button-bulk-delete-completed"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete All Completed ({stats.completed})
                  </Button>
                )}
                
                {stats.failed > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDeleteFailed}
                    data-testid="button-bulk-delete-failed"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete All Failed ({stats.failed})
                  </Button>
                )}

                {stats.cancelled > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkDeleteCancelled}
                    data-testid="button-bulk-delete-cancelled"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete All Cancelled ({stats.cancelled})
                  </Button>
                )}
                
                {stats.pending > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleBulkCancelPending}
                    data-testid="button-bulk-cancel-pending"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Cancel All Pending ({stats.pending})
                  </Button>
                )}
                {stats.processing > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReleaseStuckJobs}
                    data-testid="button-release-stuck"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Release Stuck Jobs ({stats.processing})
                  </Button>
                )}

                {stats.total > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteAllJobs}
                    data-testid="button-delete-all-jobs"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete ALL Jobs ({stats.total})
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Status:</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-40" data-testid="select-status-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">Type:</label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-40" data-testid="select-type-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="video-download">Video Download</SelectItem>
                      <SelectItem value="ai-dubbing">AI Dubbing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto-refresh"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                  data-testid="checkbox-auto-refresh"
                />
                <label htmlFor="auto-refresh" className="text-sm">Auto-refresh</label>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-muted-foreground mt-2">Loading jobs...</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No jobs found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <Card key={job.id} className="hover-elevate" data-testid={`job-card-${job.id}`}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <Badge variant={getStatusBadgeVariant(job.status)} className="gap-1.5" data-testid={`badge-status-${job.id}`}>
                              {getStatusIcon(job.status)}
                              {job.status}
                            </Badge>
                            
                            <Badge variant="outline" data-testid={`badge-type-${job.id}`}>{job.type}</Badge>
                            
                            <span className="text-sm text-muted-foreground" data-testid={`text-jobid-${job.id}`}>
                              ID: {job.id.slice(0, 8)}...
                            </span>
                            
                            {job.lockedBy && (
                              <Badge variant="secondary" className="text-xs" data-testid={`badge-locked-${job.id}`}>
                                Locked by {job.lockedBy}
                              </Badge>
                            )}
                          </div>

                          {job.progress > 0 && job.status !== "completed" && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Progress</span>
                                <span className="font-medium" data-testid={`text-progress-${job.id}`}>{job.progress}%</span>
                              </div>
                              <Progress value={job.progress} className="h-2" data-testid={`progress-bar-${job.id}`} />
                              {getProgressMessage(job.progressDetail) && (
                                <p className="text-xs text-muted-foreground" data-testid={`text-progress-detail-${job.id}`}>
                                  {getProgressMessage(job.progressDetail)}
                                </p>
                              )}
                            </div>
                          )}

                          {job.error && (
                            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3" data-testid={`error-message-${job.id}`}>
                              <p className="text-sm text-destructive font-medium mb-1">Error:</p>
                              <p className="text-sm text-destructive/80">{job.error}</p>
                              {job.retryCount < job.maxRetries && job.retryAfter && (
                                <p className="text-xs text-muted-foreground mt-2" data-testid={`text-retry-info-${job.id}`}>
                                  Retry {job.retryCount}/{job.maxRetries} • Next attempt: {format(new Date(job.retryAfter), "MMM d, h:mm a")}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Created</p>
                              <p className="font-medium" data-testid={`text-created-${job.id}`}>
                                {format(new Date(job.createdAt), "MMM d, h:mm a")}
                              </p>
                            </div>
                            
                            {job.startedAt && (
                              <div>
                                <p className="text-muted-foreground">Started</p>
                                <p className="font-medium" data-testid={`text-started-${job.id}`}>
                                  {format(new Date(job.startedAt), "MMM d, h:mm a")}
                                </p>
                              </div>
                            )}
                            
                            {job.completedAt && (
                              <div>
                                <p className="text-muted-foreground">Completed</p>
                                <p className="font-medium" data-testid={`text-completed-${job.id}`}>
                                  {format(new Date(job.completedAt), "MMM d, h:mm a")}
                                </p>
                              </div>
                            )}
                            
                            <div>
                              <p className="text-muted-foreground">Priority</p>
                              <p className="font-medium" data-testid={`text-priority-${job.id}`}>{job.priority}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          {/* Show retry for failed, cancelled, OR stuck processing jobs (>10 min) */}
                          {(job.status === "failed" || job.status === "cancelled" || 
                            (job.status === "processing" && job.startedAt && 
                             new Date().getTime() - new Date(job.startedAt).getTime() > 10 * 60 * 1000)) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetry(job.id)}
                              data-testid={`button-retry-${job.id}`}
                            >
                              <RotateCcw className="w-4 h-4 mr-2" />
                              {job.status === "processing" ? "Reset & Retry" : "Retry"}
                            </Button>
                          )}
                          
                          {job.status !== "completed" && job.status !== "cancelled" && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleCancel(job.id)}
                              data-testid={`button-cancel-${job.id}`}
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Footer />
    </div>
  );
}
