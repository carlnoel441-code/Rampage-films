import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  DollarSign, Film, Eye, Users, TrendingUp, Settings, 
  Clock, CheckCircle, AlertCircle, Heart, ExternalLink, Upload, Plus, Star, Zap, Share2, Copy
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

interface ReferralData {
  code: string;
  shareUrl: string;
  stats: {
    totalReferrals: number;
    qualifiedReferrals: number;
    totalEarned: number;
  };
}

function ReferralTabContent() {
  const { toast } = useToast();
  
  const { data: referralData, isLoading } = useQuery<ReferralData>({
    queryKey: ['/api/referrals/my-code'],
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard!` });
  };

  if (isLoading) {
    return (
      <TabsContent value="referrals">
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-muted-foreground mt-2">Loading referral data...</p>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    );
  }

  if (!referralData) {
    return (
      <TabsContent value="referrals">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Unable to load referral data</p>
          </CardContent>
        </Card>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="referrals">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              Grow With Referrals
            </CardTitle>
            <CardDescription>
              Earn 5% bonus on first month earnings for every filmmaker you refer who signs up with your code
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-primary">
                    {referralData.stats.totalReferrals}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Referrals</div>
                </CardContent>
              </Card>
              <Card className="bg-green-500/5 border-green-500/20">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-green-500">
                    {referralData.stats.qualifiedReferrals}
                  </div>
                  <div className="text-sm text-muted-foreground">Qualified</div>
                </CardContent>
              </Card>
              <Card className="bg-amber-500/5 border-amber-500/20">
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold text-amber-500">
                    ${(referralData.stats.totalEarned / 100).toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground">Total Earned</div>
                </CardContent>
              </Card>
            </div>

            <div className="pt-4 border-t">
              <Label className="text-sm font-medium">Your Referral Code</Label>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 bg-card border rounded-md px-4 py-3 font-mono text-lg tracking-wider">
                  {referralData.code}
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyToClipboard(referralData.code, 'Referral code')}
                  data-testid="button-copy-referral-code"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Shareable Link</Label>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 bg-card border rounded-md px-4 py-3 text-sm truncate">
                  {referralData.shareUrl}
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyToClipboard(referralData.shareUrl, 'Share link')}
                  data-testid="button-copy-share-link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="pt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => window.open(`https://twitter.com/intent/tweet?text=Check out Rampage Films for rare and hard-to-find movies!&url=${encodeURIComponent(referralData.shareUrl)}`, '_blank')}
                data-testid="button-share-twitter"
              >
                Share on X
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralData.shareUrl)}`, '_blank')}
                data-testid="button-share-facebook"
              >
                Share on Facebook
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(`mailto:?subject=Check out Rampage Films!&body=I found this amazing platform for rare films: ${referralData.shareUrl}`, '_blank')}
                data-testid="button-share-email"
              >
                Share via Email
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How Referrals Work</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                  <span className="text-lg font-bold">1</span>
                </div>
                <h4 className="font-medium mb-1">Share Your Link</h4>
                <p className="text-sm text-muted-foreground">Share your unique referral link with other filmmakers</p>
              </div>
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                  <span className="text-lg font-bold">2</span>
                </div>
                <h4 className="font-medium mb-1">They Sign Up</h4>
                <p className="text-sm text-muted-foreground">When they create an account and upload their first film</p>
              </div>
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                  <span className="text-lg font-bold">3</span>
                </div>
                <h4 className="font-medium mb-1">You Earn</h4>
                <p className="text-sm text-muted-foreground">Get 5% of their first month's earnings as a bonus</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TabsContent>
  );
}

interface FilmmakerData {
  filmmaker: {
    id: string;
    userId: string;
    displayName: string;
    bio: string | null;
    websiteUrl: string | null;
    profileImageUrl: string | null;
    status: string;
    stripeConnectId: string | null;
    stripeOnboardingComplete: number;
    totalEarnings: string;
    pendingBalance: string;
    subscriptionTier: string;
    maxFilms: number;
    revenueSharePercent: number;
    subscriptionStatus: string | null;
    subscriptionEndsAt: string | null;
    createdAt: string;
  };
  earnings: {
    total: number;
    pending: number;
    paid: number;
  };
  totalMovies: number;
  totalViews: number;
  recentTips: Array<{
    id: string;
    amount: number;
    grossAmount: number;
    tipperName: string | null;
    message: string | null;
    movieId: string | null;
    status: string;
    createdAt: string;
  }>;
  movies: Array<{
    id: string;
    title: string;
    poster: string | null;
    viewCount: number | null;
    monetizationEnabled: number | null;
  }>;
}

export default function FilmmakerDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [editMode, setEditMode] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');

  const { data: user, isLoading: userLoading } = useQuery<any>({
    queryKey: ['/api/auth/user'],
  });

  const { data: dashboard, isLoading, error } = useQuery<FilmmakerData>({
    queryKey: ['/api/filmmakers/dashboard'],
    enabled: !!user,
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { displayName?: string; bio?: string; websiteUrl?: string }) => 
      apiRequest('/api/filmmakers/me', 'PATCH', data),
    onSuccess: () => {
      toast({ title: "Profile updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/filmmakers/dashboard'] });
      setEditMode(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Error updating profile", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const handleSaveProfile = () => {
    updateMutation.mutate({
      displayName: displayName || undefined,
      bio: bio || undefined,
      websiteUrl: websiteUrl || undefined
    });
  };

  if (userLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-foreground/70">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 px-4 max-w-xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Filmmaker Dashboard</h1>
          <p className="text-muted-foreground mb-6">Please sign in to access your dashboard.</p>
          <Button onClick={() => setLocation('/login')} data-testid="button-login">
            Sign In
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 px-4 max-w-xl mx-auto text-center">
          <Film className="h-16 w-16 text-primary/50 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Become a Filmmaker</h1>
          <p className="text-muted-foreground mb-6">
            Share your films on Rampage Films and earn from viewer tips. 
            You'll receive 70% of all tips on your content.
          </p>
          <Button 
            onClick={() => setLocation('/filmmaker/register')} 
            data-testid="button-register-filmmaker"
          >
            Register as Filmmaker
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const { filmmaker, earnings, totalMovies, totalViews, recentTips, movies } = dashboard;

  const isPro = filmmaker.subscriptionTier === 'pro';
  const filmsRemaining = isPro ? 'Unlimited' : Math.max(0, (filmmaker.maxFilms || 2) - totalMovies);
  
  const upgradeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/filmmakers/upgrade', 'POST', {});
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start upgrade');
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "Upgrade failed", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const stats = [
    { 
      label: 'Total Earnings', 
      value: `$${earnings.total.toFixed(2)}`, 
      icon: DollarSign,
      color: 'text-green-500'
    },
    { 
      label: 'Pending Payout', 
      value: `$${earnings.pending.toFixed(2)}`, 
      icon: Clock,
      color: 'text-yellow-500'
    },
    { 
      label: 'Total Views', 
      value: totalViews.toLocaleString(), 
      icon: Eye,
      color: 'text-blue-500'
    },
    { 
      label: 'Movies', 
      value: totalMovies.toString(), 
      icon: Film,
      color: 'text-primary'
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 px-4 md:px-8 lg:px-12 max-w-[1400px] mx-auto py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">
              Filmmaker Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Welcome back, {filmmaker.displayName}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge 
              variant={filmmaker.status === 'approved' ? 'default' : 'secondary'}
              className={filmmaker.status === 'approved' ? 'bg-green-500/20 text-green-500' : ''}
            >
              {filmmaker.status === 'approved' ? (
                <><CheckCircle className="h-3 w-3 mr-1" /> Verified Filmmaker</>
              ) : filmmaker.status === 'pending' ? (
                <><Clock className="h-3 w-3 mr-1" /> Pending Approval</>
              ) : (
                <><AlertCircle className="h-3 w-3 mr-1" /> {filmmaker.status}</>
              )}
            </Badge>
            {filmmaker.status === 'approved' && (
              <Button 
                onClick={() => setLocation('/filmmaker/upload')}
                data-testid="button-upload-film"
              >
                <Plus className="h-4 w-4 mr-2" />
                Upload Film
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-primary/10">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full bg-primary/10 ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid={`stat-${stat.label.toLowerCase().replace(' ', '-')}`}>
                      {stat.value}
                    </p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Subscription Tier Card */}
        <Card className={`mb-8 ${isPro ? 'border-primary border-2' : 'border-border'}`}>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${isPro ? 'bg-primary/20' : 'bg-muted'}`}>
                  {isPro ? <Star className="h-6 w-6 text-primary" /> : <Zap className="h-6 w-6 text-muted-foreground" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold" data-testid="text-subscription-tier">
                      {isPro ? 'Pro Plan' : 'Free Plan'}
                    </h3>
                    <Badge variant={isPro ? 'default' : 'secondary'}>
                      {isPro ? 'Active' : 'Current'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-1 text-sm text-muted-foreground">
                    <span data-testid="text-revenue-share">
                      {filmmaker.revenueSharePercent || 70}% revenue share
                    </span>
                    <span data-testid="text-films-limit">
                      {isPro ? 'Unlimited films' : `${filmsRemaining} film${filmsRemaining !== 1 ? 's' : ''} remaining`}
                    </span>
                    {isPro && filmmaker.subscriptionEndsAt && (
                      <span>
                        Renews {format(new Date(filmmaker.subscriptionEndsAt), 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {!isPro && (
                <Button 
                  onClick={() => upgradeMutation.mutate()}
                  disabled={upgradeMutation.isPending}
                  className="shrink-0"
                  data-testid="button-upgrade-pro"
                >
                  {upgradeMutation.isPending ? (
                    <>
                      <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Star className="h-4 w-4 mr-2" />
                      Upgrade to Pro - $14.99/mo
                    </>
                  )}
                </Button>
              )}
              {isPro && (
                <Badge variant="outline" className="shrink-0 text-green-500 border-green-500/30">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Pro Member
                </Badge>
              )}
            </div>
            {!isPro && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Upgrade to Pro for <strong>unlimited films</strong>, <strong>80% revenue share</strong>, and priority support.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="earnings" className="space-y-6">
          <TabsList>
            <TabsTrigger value="earnings" data-testid="tab-earnings">
              <DollarSign className="h-4 w-4 mr-2" /> Earnings
            </TabsTrigger>
            <TabsTrigger value="movies" data-testid="tab-movies">
              <Film className="h-4 w-4 mr-2" /> My Movies
            </TabsTrigger>
            <TabsTrigger value="referrals" data-testid="tab-referrals">
              <Share2 className="h-4 w-4 mr-2" /> Referrals
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="h-4 w-4 mr-2" /> Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="earnings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  Recent Tips
                </CardTitle>
                <CardDescription>
                  Tips received from your viewers
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recentTips.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Heart className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>No tips yet. Share your movies to start earning!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentTips.map((tip) => (
                      <div 
                        key={tip.id} 
                        className="flex items-start justify-between p-4 rounded-lg bg-card border border-primary/10"
                        data-testid={`tip-row-${tip.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary font-bold text-sm">
                            ${tip.amount.toFixed(2)}
                          </div>
                          <div>
                            <p className="font-medium">
                              {tip.tipperName || 'Anonymous'}
                            </p>
                            {tip.message && (
                              <p className="text-sm text-muted-foreground mt-1">
                                "{tip.message}"
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              {format(new Date(tip.createdAt), 'PPp')}
                            </p>
                          </div>
                        </div>
                        <Badge variant={tip.status === 'completed' ? 'default' : 'secondary'}>
                          {tip.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Payment Information</CardTitle>
                <CardDescription>
                  Set up your payment method to receive your earnings
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filmmaker.stripeOnboardingComplete ? (
                  <div className="flex items-center gap-2 text-green-500">
                    <CheckCircle className="h-5 w-5" />
                    <span>Stripe Connect is set up. Payouts are automatic.</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      Connect your bank account via Stripe to receive automatic payouts.
                    </p>
                    <Button disabled>
                      Set Up Stripe Connect (Coming Soon)
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="movies">
            <Card>
              <CardHeader>
                <CardTitle>Your Movies</CardTitle>
                <CardDescription>
                  Movies you've uploaded to the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                {movies.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Film className="h-12 w-12 mx-auto mb-4 opacity-30" />
                    <p>No movies uploaded yet.</p>
                    <p className="text-sm mt-2">Contact us to add your films to the platform.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {movies.map((movie) => (
                      <Card 
                        key={movie.id} 
                        className="overflow-hidden cursor-pointer hover:border-primary/30 transition-colors"
                        onClick={() => setLocation(`/movie/${movie.id}`)}
                        data-testid={`movie-card-${movie.id}`}
                      >
                        <div className="aspect-video bg-card">
                          {movie.poster ? (
                            <img 
                              src={movie.poster} 
                              alt={movie.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-primary/5">
                              <Film className="h-8 w-8 text-primary/30" />
                            </div>
                          )}
                        </div>
                        <CardContent className="p-4">
                          <h3 className="font-medium truncate">{movie.title}</h3>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Eye className="h-4 w-4" />
                              {movie.viewCount?.toLocaleString() || 0} views
                            </div>
                            <Badge variant={movie.monetizationEnabled ? 'default' : 'secondary'}>
                              {movie.monetizationEnabled ? 'Monetized' : 'Not Monetized'}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <ReferralTabContent />

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>
                  Manage your filmmaker profile
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input 
                    id="displayName"
                    defaultValue={filmmaker.displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={!editMode}
                    data-testid="input-display-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea 
                    id="bio"
                    defaultValue={filmmaker.bio || ''}
                    onChange={(e) => setBio(e.target.value)}
                    disabled={!editMode}
                    rows={3}
                    data-testid="input-bio"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="websiteUrl">Website URL</Label>
                  <Input 
                    id="websiteUrl"
                    type="url"
                    placeholder="https://yourwebsite.com"
                    defaultValue={filmmaker.websiteUrl || ''}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    disabled={!editMode}
                    data-testid="input-website"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  {editMode ? (
                    <>
                      <Button 
                        onClick={handleSaveProfile}
                        disabled={updateMutation.isPending}
                        data-testid="button-save-profile"
                      >
                        {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => setEditMode(false)}
                        data-testid="button-cancel-edit"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button 
                      onClick={() => setEditMode(true)}
                      data-testid="button-edit-profile"
                    >
                      Edit Profile
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <Footer />
    </div>
  );
}
