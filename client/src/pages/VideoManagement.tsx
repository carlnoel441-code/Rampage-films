import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { 
  Download, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Server,
  Film,
  ArrowLeft,
  HardDrive,
  RotateCcw,
  Youtube,
  Cookie,
  Trash2
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type Movie = {
  id: string;
  title: string;
  year: string;
  poster: string;
  videoUrl: string | null;
  hostedAssetKey: string | null;
  transcodingStatus: string | null;
  transcodingError: string | null;
};

type Job = {
  id: number;
  type: string;
  status: string;
  movieId: string;
  progress: number;
  error: string | null;
  metadata: any;
  progressDetail?: {
    phase?: string;
    message?: string;
    eta?: number;
    speed?: number;
    downloadPercent?: number;
    estimatedFileSize?: number;
    videoDuration?: number;
  };
};

type JobsResponse = {
  jobs: Job[];
  count: number;
};

export default function VideoManagement() {
  const { toast } = useToast();
  const { isAuthorized, login: adminLogin } = useAdminAuth();
  const [adminSecret, setAdminSecret] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [selectedQualities, setSelectedQualities] = useState<Record<string, string>>({});
  const [cookiesContent, setCookiesContent] = useState("");
  const [showCookiesSection, setShowCookiesSection] = useState(false);
  const [cookieInputMode, setCookieInputMode] = useState<"simple" | "advanced">("simple");
  const [simpleCookies, setSimpleCookies] = useState({
    LOGIN_INFO: "",
    SID: "",
    HSID: "",
    SSID: "",
    APISID: "",
    SAPISID: "",
  });

  const { data: movies, isLoading: moviesLoading } = useQuery<Movie[]>({
    queryKey: ["/api/movies"],
    enabled: isAuthorized,
  });

  const { data: jobsData } = useQuery<JobsResponse>({
    queryKey: ["/api/admin/jobs"],
    enabled: isAuthorized,
    refetchInterval: 3000,
  });
  
  const jobs = jobsData?.jobs || [];

  // YouTube cookies status query
  const { data: cookiesStatus } = useQuery<{
    configured: boolean;
    size: number;
    modified: string | null;
    message: string;
  }>({
    queryKey: ["/api/admin/youtube-cookies/status"],
    enabled: isAuthorized,
  });

  // Helper to generate Netscape cookie format from simple inputs
  const generateNetscapeCookies = () => {
    const lines = ["# Netscape HTTP Cookie File"];
    const expiry = Math.floor(Date.now() / 1000) + 86400 * 365; // 1 year from now
    
    Object.entries(simpleCookies).forEach(([name, value]) => {
      if (value.trim()) {
        // Format: domain, flag, path, secure, expiration, name, value
        lines.push(`.youtube.com\tTRUE\t/\tTRUE\t${expiry}\t${name}\t${value.trim()}`);
      }
    });
    
    return lines.join("\n");
  };

  // Upload YouTube cookies mutation
  const uploadCookiesMutation = useMutation({
    mutationFn: async (cookies: string) => {
      const res = await apiRequest("POST", "/api/admin/youtube-cookies", { cookies });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/youtube-cookies/status"] });
      setCookiesContent("");
      setSimpleCookies({
        LOGIN_INFO: "",
        SID: "",
        HSID: "",
        SSID: "",
        APISID: "",
        SAPISID: "",
      });
      toast({
        title: "Cookies Uploaded",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete YouTube cookies mutation
  const deleteCookiesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/admin/youtube-cookies");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/youtube-cookies/status"] });
      toast({
        title: "Cookies Deleted",
        description: "YouTube cookies have been removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadAndHostMutation = useMutation({
    mutationFn: async ({ movieId, quality }: { movieId: string; quality: string }) => {
      const res = await apiRequest("POST", `/api/movies/${movieId}/download-and-host`, { quality });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      toast({
        title: "Download Started",
        description: `Job #${data.jobId} created. Video is being downloaded and uploaded to storage.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Download Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const downloadAllToR2Mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/storage/download-all-to-r2`);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      const { summary } = data;
      toast({
        title: "Bulk Download Started",
        description: `${summary.downloadQueued} downloads queued, ${summary.alreadyOnR2} already on R2, ${summary.skipped} skipped (YouTube/Vimeo)`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Download Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetHostingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/storage/reset-hosting-status`);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      toast({
        title: "Hosting Status Reset",
        description: `Reset ${data.resetCount} movies, cancelled ${data.cancelledJobs} pending jobs. Ready for fresh downloads!`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const success = await adminLogin(adminSecret);
      if (success) {
        toast({
          title: "Login Successful",
          description: "Welcome to Video Management",
        });
      } else {
        toast({
          title: "Login Failed",
          description: "Invalid admin secret",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-6 h-6 text-primary" />
              Video Management - Admin Access
            </CardTitle>
            <CardDescription>
              Enter admin secret to manage video hosting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-secret">Admin Secret</Label>
                <Input
                  id="admin-secret"
                  type="password"
                  placeholder="Enter admin secret"
                  value={adminSecret}
                  onChange={(e) => setAdminSecret(e.target.value)}
                  data-testid="input-admin-secret"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoggingIn || !adminSecret}
                data-testid="button-admin-login"
              >
                {isLoggingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const moviesWithVideo = movies?.filter(m => m.videoUrl) || [];
  
  const notHosted = moviesWithVideo.filter(m => !m.hostedAssetKey && m.transcodingStatus !== "downloading" && m.transcodingStatus !== "uploading");
  const currentlyHosting = moviesWithVideo.filter(m => m.transcodingStatus === "downloading" || m.transcodingStatus === "uploading");
  const hosted = moviesWithVideo.filter(m => m.hostedAssetKey);

  const activeJobs = jobs.filter(j => j.status === "pending" || j.status === "processing");
  const downloadJobs = activeJobs.filter(j => j.type === "video_download");

  const getJobForMovie = (movieId: string, type: string) => {
    return activeJobs.find(j => j.movieId === movieId && j.type === type);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Server className="w-8 h-8 text-primary" />
              Video Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Download and host your movies in cloud storage
            </p>
          </div>
          <Link href="/admin">
            <Button variant="outline" data-testid="button-back-admin">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Film className="w-8 h-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{moviesWithVideo.length}</p>
                <p className="text-sm text-muted-foreground">Total Movies</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <HardDrive className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{hosted.length}</p>
                <p className="text-sm text-muted-foreground">Self-Hosted</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Loader2 className={`w-8 h-8 text-yellow-500 ${activeJobs.length > 0 ? 'animate-spin' : ''}`} />
              <div>
                <p className="text-2xl font-bold">{activeJobs.length}</p>
                <p className="text-sm text-muted-foreground">Active Jobs</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admin Actions */}
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg">Quick Actions</h3>
                <p className="text-sm text-muted-foreground">
                  Manage all videos at once
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => resetHostingMutation.mutate()}
                  disabled={resetHostingMutation.isPending || hosted.length === 0}
                  className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                  data-testid="button-reset-hosting"
                >
                  {resetHostingMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4 mr-2" />
                  )}
                  Reset All Hosting ({hosted.length})
                </Button>
                <Button 
                  onClick={() => downloadAllToR2Mutation.mutate()}
                  disabled={downloadAllToR2Mutation.isPending || notHosted.length === 0}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  data-testid="button-download-all-r2-top"
                >
                  {downloadAllToR2Mutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Download All to R2 ({notHosted.length})
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* YouTube Cookies Section */}
        <Collapsible open={showCookiesSection} onOpenChange={setShowCookiesSection}>
          <Card className="border-red-500/30 bg-red-500/5">
            <CardHeader className="pb-2">
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-3">
                    <Youtube className="w-6 h-6 text-red-500" />
                    <div>
                      <CardTitle className="text-lg">YouTube Downloads</CardTitle>
                      <CardDescription>
                        {cookiesStatus?.configured 
                          ? "YouTube cookies configured - downloads enabled!" 
                          : "Upload cookies to enable YouTube video downloads"}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={cookiesStatus?.configured ? "default" : "secondary"}
                      data-testid="badge-cookies-status"
                    >
                      {cookiesStatus?.configured ? "Enabled" : "Disabled"}
                    </Badge>
                    <Button variant="ghost" size="sm" data-testid="button-toggle-cookies">
                      {showCookiesSection ? "Hide" : "Configure"}
                    </Button>
                  </div>
                </div>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <Tabs defaultValue="mobile" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="mobile" data-testid="tab-instructions-mobile">
                      Phone Instructions
                    </TabsTrigger>
                    <TabsTrigger value="desktop" data-testid="tab-instructions-desktop">
                      Computer Instructions
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="mobile" className="space-y-3">
                    <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-lg text-sm space-y-3" data-testid="container-mobile-instructions">
                      <p className="font-medium text-green-700 dark:text-green-400">For Android phones:</p>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li>Install <strong>Kiwi Browser</strong> from Play Store (it supports extensions!)</li>
                        <li>Open Kiwi Browser and go to the Chrome Web Store</li>
                        <li>Search for and install "Get cookies.txt LOCALLY"</li>
                        <li>Go to YouTube and log in</li>
                        <li>Tap the extension icon and export cookies</li>
                        <li>Copy and paste the content below using "Advanced" mode</li>
                      </ol>
                      
                      <div className="border-t border-green-500/30 pt-3 mt-3">
                        <p className="font-medium text-blue-700 dark:text-blue-400">For iPhone/iPad:</p>
                        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                          <li>Install <strong>Orion Browser</strong> from the App Store (supports extensions)</li>
                          <li>Go to Settings → Extensions and enable Chrome extensions</li>
                          <li>Install a cookies export extension</li>
                          <li>Log into YouTube and export cookies</li>
                          <li>Paste the content below using "Advanced" mode</li>
                        </ol>
                      </div>
                      
                      <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-2">
                        Cookies expire after a few weeks and need to be refreshed
                      </p>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="desktop" className="space-y-3">
                    <div className="bg-muted/50 p-4 rounded-lg text-sm space-y-2" data-testid="container-desktop-instructions">
                      <p className="font-medium">Option 1: Using Easy Mode (no extension needed)</p>
                      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                        <li>Go to YouTube and make sure you're logged in</li>
                        <li>Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">F12</kbd> to open Developer Tools</li>
                        <li>Go to <strong>Application</strong> tab → <strong>Cookies</strong> → <strong>youtube.com</strong></li>
                        <li>Copy each cookie value and paste into the fields below</li>
                      </ol>
                      
                      <div className="border-t pt-3 mt-3">
                        <p className="font-medium">Option 2: Using a browser extension</p>
                        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                          <li>Install "cookies.txt" (Firefox) or "Get cookies.txt LOCALLY" (Chrome)</li>
                          <li>Go to YouTube and log in</li>
                          <li>Export cookies and paste in "Advanced" mode below</li>
                        </ol>
                      </div>
                      
                      <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-2">
                        Cookies expire after a few weeks and need to be refreshed
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
                
                {cookiesStatus?.configured ? (
                  <div 
                    className="flex items-center justify-between p-4 bg-green-500/10 rounded-lg border border-green-500/30"
                    data-testid="container-cookies-active"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="font-medium text-green-700 dark:text-green-400" data-testid="text-cookies-active">Cookies Active</p>
                        <p className="text-sm text-muted-foreground" data-testid="text-cookies-info">
                          Size: {Math.round((cookiesStatus.size || 0) / 1024)}KB
                          {cookiesStatus.modified && ` • Last updated: ${new Date(cookiesStatus.modified).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={() => deleteCookiesMutation.mutate()}
                      disabled={deleteCookiesMutation.isPending}
                      data-testid="button-delete-cookies"
                    >
                      {deleteCookiesMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      Delete Cookies
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Button
                        variant={cookieInputMode === "simple" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCookieInputMode("simple")}
                        data-testid="button-mode-simple"
                      >
                        Easy Mode
                      </Button>
                      <Button
                        variant={cookieInputMode === "advanced" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCookieInputMode("advanced")}
                        data-testid="button-mode-advanced"
                      >
                        Advanced (cookies.txt)
                      </Button>
                    </div>

                    {cookieInputMode === "simple" ? (
                      <div className="space-y-4">
                        <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg text-sm">
                          <p className="font-medium text-blue-700 dark:text-blue-400 mb-2">How to get these values:</p>
                          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                            <li>Go to YouTube and make sure you're logged in</li>
                            <li>Press <kbd className="px-1 py-0.5 bg-muted rounded text-xs">F12</kbd> to open Developer Tools</li>
                            <li>Go to <strong>Application</strong> tab → <strong>Cookies</strong> → <strong>youtube.com</strong></li>
                            <li>Find each cookie below and copy its <strong>Value</strong></li>
                          </ol>
                        </div>

                        <div className="grid gap-3">
                          {Object.keys(simpleCookies).map((cookieName) => (
                            <div key={cookieName} className="space-y-1">
                              <Label htmlFor={`cookie-${cookieName}`} className="text-sm font-mono">
                                {cookieName} {cookieName === "LOGIN_INFO" && <span className="text-red-500">*</span>}
                              </Label>
                              <Input
                                id={`cookie-${cookieName}`}
                                placeholder={`Paste ${cookieName} value here`}
                                value={simpleCookies[cookieName as keyof typeof simpleCookies]}
                                onChange={(e) => setSimpleCookies(prev => ({
                                  ...prev,
                                  [cookieName]: e.target.value
                                }))}
                                className="font-mono text-xs"
                                data-testid={`input-cookie-${cookieName.toLowerCase()}`}
                              />
                            </div>
                          ))}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          <span className="text-red-500">*</span> LOGIN_INFO is required. Other cookies are recommended for best results.
                        </p>

                        <Button
                          onClick={() => uploadCookiesMutation.mutate(generateNetscapeCookies())}
                          disabled={uploadCookiesMutation.isPending || !simpleCookies.LOGIN_INFO.trim()}
                          className="w-full"
                          data-testid="button-upload-cookies-simple"
                        >
                          {uploadCookiesMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Cookie className="w-4 h-4 mr-2" />
                          )}
                          Save YouTube Cookies
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Label htmlFor="cookies-content">Paste cookies.txt content:</Label>
                        <Textarea
                          id="cookies-content"
                          placeholder="# Netscape HTTP Cookie File&#10;.youtube.com     TRUE    /       TRUE    ..."
                          value={cookiesContent}
                          onChange={(e) => setCookiesContent(e.target.value)}
                          className="min-h-[150px] font-mono text-xs"
                          data-testid="textarea-cookies"
                        />
                        <Button
                          onClick={() => uploadCookiesMutation.mutate(cookiesContent)}
                          disabled={uploadCookiesMutation.isPending || !cookiesContent.trim()}
                          className="w-full"
                          data-testid="button-upload-cookies"
                        >
                          {uploadCookiesMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Cookie className="w-4 h-4 mr-2" />
                          )}
                          Save YouTube Cookies
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {moviesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="not-hosted" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="not-hosted" data-testid="tab-not-hosted">
                Not Hosted ({notHosted.length})
              </TabsTrigger>
              <TabsTrigger value="hosting" data-testid="tab-hosting">
                Hosting ({currentlyHosting.length})
              </TabsTrigger>
              <TabsTrigger value="hosted" data-testid="tab-hosted">
                Hosted ({hosted.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="not-hosted" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Download className="w-5 h-5" />
                        Movies Needing Hosting
                      </CardTitle>
                      <CardDescription>
                        These movies use external embeds. Download and host them for better streaming and dubbing.
                      </CardDescription>
                    </div>
                    {notHosted.length > 0 && (
                      <Button 
                        onClick={() => downloadAllToR2Mutation.mutate()}
                        disabled={downloadAllToR2Mutation.isPending}
                        className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                        data-testid="button-download-all-r2"
                      >
                        {downloadAllToR2Mutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2" />
                        )}
                        Download All to R2
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {notHosted.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      All movies are either hosted or being processed!
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {notHosted.map((movie) => {
                        const job = getJobForMovie(movie.id, "video_download");
                        return (
                          <Card key={movie.id} data-testid={`card-movie-${movie.id}`}>
                            <CardContent className="p-4">
                              <div className="flex gap-4">
                                <img
                                  src={movie.poster}
                                  alt={movie.title}
                                  className="w-16 h-24 object-cover rounded"
                                />
                                <div className="flex-1 space-y-2">
                                  <h3 className="font-semibold text-sm line-clamp-2">{movie.title}</h3>
                                  <p className="text-xs text-muted-foreground">{movie.year}</p>
                                  <div className="flex gap-1">
                                    <Select
                                      value={selectedQualities[movie.id] || "best"}
                                      onValueChange={(val) => setSelectedQualities(prev => ({ ...prev, [movie.id]: val }))}
                                      data-testid={`select-quality-${movie.id}`}
                                    >
                                      <SelectTrigger className="w-20 h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="best">Best</SelectItem>
                                        <SelectItem value="720p">720p</SelectItem>
                                        <SelectItem value="480p">480p</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      size="sm"
                                      className="flex-1 h-8"
                                      onClick={() => downloadAndHostMutation.mutate({ 
                                        movieId: movie.id, 
                                        quality: selectedQualities[movie.id] || "best" 
                                      })}
                                      disabled={downloadAndHostMutation.isPending || !!job}
                                      data-testid={`button-download-${movie.id}`}
                                    >
                                      {job ? (
                                        <>
                                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                          Processing
                                        </>
                                      ) : (
                                        <>
                                          <Download className="w-3 h-3 mr-1" />
                                          Download
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hosting" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Currently Processing
                  </CardTitle>
                  <CardDescription>
                    These movies are being downloaded and uploaded to storage.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {currentlyHosting.length === 0 && downloadJobs.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No downloads in progress.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {currentlyHosting.map((movie) => {
                        const job = getJobForMovie(movie.id, "video_download");
                        return (
                          <Card key={movie.id} data-testid={`card-hosting-${movie.id}`}>
                            <CardContent className="p-4">
                              <div className="flex gap-4">
                                <img
                                  src={movie.poster}
                                  alt={movie.title}
                                  className="w-16 h-24 object-cover rounded"
                                />
                                <div className="flex-1 space-y-2">
                                  <h3 className="font-semibold text-sm line-clamp-2">{movie.title}</h3>
                                  <p className="text-xs text-muted-foreground">{movie.year}</p>
                                  <Badge variant="secondary">
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    {movie.transcodingStatus === "downloading" ? "Downloading..." : "Uploading..."}
                                  </Badge>
                                  {job && (
                                    <div className="space-y-1">
                                      <div className="w-full bg-secondary rounded-full h-2">
                                        <div 
                                          className="bg-primary h-2 rounded-full transition-all" 
                                          style={{ width: `${job.progress || 0}%` }}
                                        />
                                      </div>
                                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>{job.progress}%</span>
                                        {job.progressDetail?.message && (
                                          <span className="truncate ml-2" title={job.progressDetail.message}>
                                            {job.progressDetail.message}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="hosted" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    Hosted Movies
                  </CardTitle>
                  <CardDescription>
                    These movies are hosted on your cloud storage for fast, reliable streaming.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {hosted.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      No hosted movies yet. Download some movies to get started!
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {hosted.map((movie) => (
                        <Card key={movie.id} data-testid={`card-hosted-${movie.id}`}>
                          <CardContent className="p-4">
                            <div className="flex gap-4">
                              <img
                                src={movie.poster}
                                alt={movie.title}
                                className="w-16 h-24 object-cover rounded"
                              />
                              <div className="flex-1 space-y-2">
                                <h3 className="font-semibold text-sm line-clamp-2">{movie.title}</h3>
                                <p className="text-xs text-muted-foreground">{movie.year}</p>
                                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Hosted
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-blue-500" />
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">1</div>
                  <h4 className="font-semibold">Select Quality</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Choose between Best, 720p, or 480p quality depending on your storage and bandwidth needs.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">2</div>
                  <h4 className="font-semibold">Download & Host</h4>
                </div>
                <p className="text-sm text-muted-foreground">
                  Click "Download" to save the video to Cloudflare R2 storage. This enables faster, more reliable streaming.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
