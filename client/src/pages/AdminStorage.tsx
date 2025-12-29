import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Cloud, HardDrive, AlertCircle, CheckCircle2, Loader2, RefreshCw, Download, Wifi, Copy, Check, Send } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface StorageStatusMovie {
  id: string;
  title: string;
  hostedAssetKey: string;
  storageLocation: 'r2' | 'replit' | 'missing' | 'error';
  needsMigration: boolean;
  error?: string;
}

interface StorageStatus {
  summary: {
    total: number;
    onR2: number;
    onReplit: number;
    missing: number;
    errors: number;
    needsMigration: number;
  };
  movies: StorageStatusMovie[];
}

export default function AdminStorage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthorized, isLoading: authLoading, login, logout } = useAdminAuth();
  const [tempSecret, setTempSecret] = useState("");
  const [migratingId, setMigratingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isMigratingAll, setIsMigratingAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleSyncToProduction = async (movieId: string, movieTitle: string) => {
    setSyncingId(movieId);
    try {
      const response = await fetch(`/api/admin/sync-to-production/${movieId}`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.details || data.error || "Sync failed");
      }
      
      toast({
        title: "Synced to Production!",
        description: `"${movieTitle}" is now available on your live site.`,
      });
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message || "Could not sync to production",
        variant: "destructive",
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleCopyStorageKey = async (movieId: string, hostedAssetKey: string) => {
    try {
      await navigator.clipboard.writeText(hostedAssetKey);
      setCopiedId(movieId);
      toast({
        title: "Storage Key Copied!",
        description: "Now paste this in production using the instructions below.",
      });
      setTimeout(() => setCopiedId(null), 3000);
    } catch (error: any) {
      toast({
        title: "Failed to copy",
        description: error.message || "Could not copy storage key",
        variant: "destructive",
      });
    }
  };

  const { data: storageStatus, isLoading: isLoadingStatus, refetch } = useQuery<StorageStatus>({
    queryKey: ["/api/admin/storage/status"],
    enabled: isAuthorized,
    refetchInterval: isMigratingAll ? 5000 : false,
  });

  const migrateMutation = useMutation({
    mutationFn: async (movieId: string) => {
      // Use AbortController with 10 minute timeout for large files
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);
      
      try {
        const res = await fetch(`/api/admin/storage/migrate/${movieId}`, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.details || data.error || "Migration failed");
        }
        return data;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error("Migration timed out after 10 minutes. The file may be too large.");
        }
        if (error.message === 'Failed to fetch' || error.message === 'Load failed') {
          throw new Error("Network error - please check your connection and try again");
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      toast({
        title: data.migrated ? "Migration Complete" : "Already on R2",
        description: data.message,
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Migration Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setMigratingId(null);
    },
  });

  const migrateAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/storage/migrate-all");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || "Migration failed");
      }
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Bulk Migration Complete",
        description: `Migrated: ${data.summary.migrated}, Already on R2: ${data.summary.alreadyOnR2}, Errors: ${data.summary.errors}`,
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Migration Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsMigratingAll(false);
    },
  });

  const downloadAndMigrateMutation = useMutation({
    mutationFn: async (movieId: string) => {
      const res = await fetch(`/api/admin/storage/download-and-migrate/${movieId}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || "Failed to start download");
      }
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Download Started",
        description: data.message || "Video is downloading and will be migrated to R2 automatically",
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Download Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setDownloadingId(null);
    },
  });

  const handleMigrate = (movieId: string) => {
    setMigratingId(movieId);
    migrateMutation.mutate(movieId);
  };

  const handleDownloadAndMigrate = (movieId: string) => {
    setDownloadingId(movieId);
    downloadAndMigrateMutation.mutate(movieId);
  };

  const downloadAndMigrateAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/storage/download-and-migrate-all", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details || data.error || "Failed to start bulk download");
      }
      return data;
    },
    onSuccess: (data) => {
      const s = data.summary;
      toast({
        title: "Bulk Operation Complete",
        description: `On R2: ${s.alreadyOnR2}, Migrated: ${s.migrated}, Downloads Queued: ${s.downloadQueued}, Errors: ${s.errors}`,
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Operation Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsMigratingAll(false);
    },
  });

  const handleMigrateAll = () => {
    setIsMigratingAll(true);
    migrateAllMutation.mutate();
  };

  const handleDownloadAndMigrateAll = () => {
    setIsMigratingAll(true);
    downloadAndMigrateAllMutation.mutate();
  };

  const [isTestingR2, setIsTestingR2] = useState(false);
  const testR2Mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/storage/test-r2", {
        method: "GET",
        credentials: "include",
      });
      const data = await res.json();
      return data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "R2 Connection Successful",
          description: `Bucket: ${data.bucketName} - ${data.message}`,
        });
      } else {
        toast({
          title: "R2 Connection Failed",
          description: data.error || data.r2Error || "Unknown error",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "R2 Test Failed",
        description: error.message || "Could not test R2 connection",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsTestingR2(false);
    },
  });

  const handleTestR2 = () => {
    setIsTestingR2(true);
    testR2Mutation.mutate();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 px-4 max-w-md mx-auto">
          <Card className="p-6">
            <h1 className="text-2xl font-bold mb-4">Admin Login</h1>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                login(tempSecret);
              }}
              className="space-y-4"
            >
              <Input
                type="password"
                placeholder="Enter admin password"
                value={tempSecret}
                onChange={(e) => setTempSecret(e.target.value)}
                data-testid="input-admin-password"
              />
              <Button type="submit" className="w-full" data-testid="button-admin-login">
                Login
              </Button>
            </form>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 px-4 md:px-8 lg:px-12 pb-12">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation("/admin")}
              data-testid="button-back-admin"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-3xl font-bold">Storage Migration</h1>
          </div>

          <Card className="p-6 mb-6 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
            <div className="flex items-start gap-4">
              <Cloud className="h-8 w-8 text-primary mt-1" />
              <div>
                <h2 className="text-xl font-semibold mb-2">Migrate Videos to Cloudflare R2</h2>
                <p className="text-foreground/70 mb-4">
                  Move your hosted videos from Replit Object Storage (costs $0.10/GB bandwidth) 
                  to Cloudflare R2 (FREE bandwidth). Your videos will continue to work seamlessly.
                </p>
                
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-md mb-4">
                  <p className="text-sm">
                    <strong>One-Click Migration:</strong> Click "Download & Migrate All to R2" to automatically:
                    <br />• Migrate existing files from Replit storage to R2
                    <br />• Queue downloads for missing files (dev/production have separate storage)
                    <br />• All downloads automatically upload to R2 when complete
                  </p>
                </div>
                
                {storageStatus && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                    <div className="text-center p-3 bg-background/50 rounded-md">
                      <div className="text-2xl font-bold">{storageStatus.summary.total}</div>
                      <div className="text-sm text-foreground/60">Total Hosted</div>
                    </div>
                    <div className="text-center p-3 bg-green-500/10 rounded-md">
                      <div className="text-2xl font-bold text-green-500">{storageStatus.summary.onR2}</div>
                      <div className="text-sm text-foreground/60">On R2 (Free)</div>
                    </div>
                    <div className="text-center p-3 bg-yellow-500/10 rounded-md">
                      <div className="text-2xl font-bold text-yellow-500">{storageStatus.summary.onReplit}</div>
                      <div className="text-sm text-foreground/60">On Replit (Paid)</div>
                    </div>
                    <div className="text-center p-3 bg-red-500/10 rounded-md">
                      <div className="text-2xl font-bold text-red-500">{storageStatus.summary.missing}</div>
                      <div className="text-sm text-foreground/60">Missing</div>
                    </div>
                    <div className="text-center p-3 bg-primary/10 rounded-md">
                      <div className="text-2xl font-bold text-primary">{storageStatus.summary.needsMigration}</div>
                      <div className="text-sm text-foreground/60">Need Migration</div>
                    </div>
                  </div>
                )}
                
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={handleDownloadAndMigrateAll}
                    disabled={isMigratingAll}
                    data-testid="button-download-migrate-all"
                  >
                    {isMigratingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Download & Migrate All to R2
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTestR2}
                    disabled={isTestingR2}
                    data-testid="button-test-r2"
                  >
                    {isTestingR2 ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Wifi className="h-4 w-4 mr-2" />
                        Test R2 Connection
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => refetch()}
                    disabled={isLoadingStatus}
                    data-testid="button-refresh-status"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingStatus ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
                <p className="text-xs text-foreground/50 mt-2">
                  This will migrate existing files and queue downloads for missing ones. Check Jobs Dashboard for progress.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-green-500/10 border-green-500/30 mb-4">
            <h4 className="font-semibold text-green-400 mb-2">One-Click Sync to Production</h4>
            <p className="text-sm text-foreground/80">
              Click the <strong>"Send to Production"</strong> button on any hosted movie below to instantly push it to your live site. 
              The movie will be created or updated on rampagefilms.net automatically!
            </p>
          </Card>

          {isLoadingStatus ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Checking storage status...</span>
            </div>
          ) : storageStatus?.movies.length === 0 ? (
            <Card className="p-8 text-center">
              <HardDrive className="h-12 w-12 mx-auto text-foreground/40 mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Hosted Videos</h3>
              <p className="text-foreground/60">
                You don't have any self-hosted videos yet. Use "Download & Host" in the main admin page to host videos.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {storageStatus?.movies.map((movie) => (
                <Card key={movie.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{movie.title}</h3>
                    <p className="text-sm text-foreground/60 truncate">{movie.hostedAssetKey}</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {movie.storageLocation === 'r2' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleSyncToProduction(movie.id, movie.title)}
                          disabled={syncingId === movie.id}
                          data-testid={`button-sync-prod-${movie.id}`}
                        >
                          {syncingId === movie.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Syncing...
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-1" />
                              Send to Production
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCopyStorageKey(movie.id, movie.hostedAssetKey)}
                          data-testid={`button-copy-key-${movie.id}`}
                        >
                          {copiedId === movie.id ? (
                            <>
                              <Check className="h-4 w-4 mr-1 text-green-500" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 mr-1" />
                              Copy Key
                            </>
                          )}
                        </Button>
                        <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          On R2
                        </Badge>
                      </>
                    )}
                    {movie.storageLocation === 'replit' && (
                      <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                        <HardDrive className="h-3 w-3 mr-1" />
                        On Replit (Paid)
                      </Badge>
                    )}
                    {movie.storageLocation === 'missing' && (
                      <>
                        <Badge className="bg-red-500/20 text-red-500 border-red-500/30">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Missing
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadAndMigrate(movie.id)}
                          disabled={downloadingId === movie.id}
                          data-testid={`button-download-migrate-${movie.id}`}
                        >
                          {downloadingId === movie.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-1" />
                              Download & Migrate
                            </>
                          )}
                        </Button>
                      </>
                    )}
                    {movie.storageLocation === 'error' && (
                      <Badge className="bg-red-500/20 text-red-500 border-red-500/30">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Error
                      </Badge>
                    )}
                    
                    {movie.needsMigration && (
                      <Button
                        size="sm"
                        onClick={() => handleMigrate(movie.id)}
                        disabled={migratingId === movie.id || isMigratingAll}
                        data-testid={`button-migrate-${movie.id}`}
                      >
                        {migratingId === movie.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Cloud className="h-4 w-4 mr-1" />
                            Migrate
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
