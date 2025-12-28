import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserPlus, Film, Eye, TrendingUp, Clock, CheckCircle, BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface AnalyticsData {
  totalUsers: number;
  newUsersToday: number;
  newUsersWeek: number;
  newUsersMonth: number;
  totalProfiles: number;
  totalMovies: number;
  totalViews: number;
  topMovies: Array<{ title: string; viewCount: number }>;
  userGrowth: Array<{ date: string; count: number }>;
  popularGenres: Array<{ genre: string; watchCount: number }>;
  peakViewingHours: Array<{ hour: number; watchCount: number }>;
  completionRate: number;
}

export default function Analytics() {
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['/api/admin/analytics'],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <Skeleton className="h-10 w-64 mb-2" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-background p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load analytics</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-analytics">
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground">
            Track your platform's growth and performance
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-total-users">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-users">
                {analytics.totalUsers.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Registered accounts
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-new-users">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New This Month</CardTitle>
              <UserPlus className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-new-users-month">
                {analytics.newUsersMonth.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                +{analytics.newUsersWeek} this week, +{analytics.newUsersToday} today
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-total-profiles">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Profiles</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-profiles">
                {analytics.totalProfiles.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                {(analytics.totalProfiles / Math.max(analytics.totalUsers, 1)).toFixed(1)} per user avg
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-total-views">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Views</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-views">
                {analytics.totalViews.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Across {analytics.totalMovies} movies
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Top Movies */}
          <Card data-testid="card-top-movies">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Film className="h-5 w-5" />
                Top Movies by Views
              </CardTitle>
              <CardDescription>Most popular content on your platform</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.topMovies.length > 0 ? (
                <div className="space-y-4">
                  {analytics.topMovies.map((movie, index) => (
                    <div key={index} className="flex items-center gap-4" data-testid={`movie-${index}`}>
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">{movie.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {movie.viewCount.toLocaleString()} views
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No views yet</p>
              )}
            </CardContent>
          </Card>

          {/* User Growth */}
          <Card data-testid="card-user-growth">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                User Growth (Last 30 Days)
              </CardTitle>
              <CardDescription>Daily new signups</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.userGrowth.length > 0 ? (
                <div className="space-y-2">
                  {analytics.userGrowth.slice(-10).map((day, index) => (
                    <div key={index} className="flex items-center gap-4" data-testid={`growth-${index}`}>
                      <div className="text-sm text-muted-foreground w-24">
                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="flex-1">
                        <div 
                          className="h-6 bg-primary rounded-sm" 
                          style={{ 
                            width: `${Math.max((day.count / Math.max(...analytics.userGrowth.map(d => d.count))) * 100, 5)}%` 
                          }}
                        />
                      </div>
                      <div className="text-sm font-medium w-12 text-right">
                        {day.count}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No signup data yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Viewing Insights */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Popular Genres */}
          <Card data-testid="card-popular-genres">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Popular Genres
              </CardTitle>
              <CardDescription>Most watched categories</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.popularGenres && analytics.popularGenres.length > 0 ? (
                <div className="space-y-3">
                  {analytics.popularGenres.map((genre, index) => {
                    const maxCount = analytics.popularGenres[0]?.watchCount || 1;
                    return (
                      <div key={index} className="flex items-center gap-3" data-testid={`genre-${index}`}>
                        <div className="flex-1 space-y-1">
                          <p className="text-sm font-medium">{genre.genre}</p>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full"
                              style={{ 
                                width: `${Math.min((genre.watchCount / maxCount) * 100, 100)}%` 
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground w-12 text-right">
                          {genre.watchCount}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No viewing data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Peak Viewing Hours */}
          <Card data-testid="card-peak-hours">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Peak Hours
              </CardTitle>
              <CardDescription>When users watch most</CardDescription>
            </CardHeader>
            <CardContent>
              {analytics.peakViewingHours && analytics.peakViewingHours.length > 0 ? (
                <div className="space-y-3">
                  {analytics.peakViewingHours.map((hour, index) => {
                    const displayHour = hour.hour === 0 ? '12 AM' : 
                                       hour.hour < 12 ? `${hour.hour} AM` :
                                       hour.hour === 12 ? '12 PM' :
                                       `${hour.hour - 12} PM`;
                    const maxCount = analytics.peakViewingHours[0]?.watchCount || 1;
                    return (
                      <div key={index} className="flex items-center justify-between" data-testid={`hour-${index}`}>
                        <p className="text-sm font-medium">{displayHour}</p>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full"
                              style={{ 
                                width: `${Math.min((hour.watchCount / maxCount) * 100, 100)}%` 
                              }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-8 text-right">
                            {hour.watchCount}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No viewing data yet</p>
              )}
            </CardContent>
          </Card>

          {/* Completion Rate */}
          <Card data-testid="card-completion-rate">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Completion Rate
              </CardTitle>
              <CardDescription>Movies watched to the end</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-4">
                <div className="relative inline-flex">
                  <svg className="w-32 h-32">
                    <circle
                      className="text-muted"
                      strokeWidth="10"
                      stroke="currentColor"
                      fill="transparent"
                      r="56"
                      cx="64"
                      cy="64"
                    />
                    <circle
                      className="text-primary"
                      strokeWidth="10"
                      strokeDasharray={2 * Math.PI * 56}
                      strokeDashoffset={2 * Math.PI * 56 * (1 - (analytics.completionRate / 100))}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                      r="56"
                      cx="64"
                      cy="64"
                      style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-bold">{analytics.completionRate}%</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  of viewers finish the movies they start
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats Summary */}
        <Card data-testid="card-summary">
          <CardHeader>
            <CardTitle>Platform Summary</CardTitle>
            <CardDescription>Key metrics at a glance</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Movies in Library</p>
              <p className="text-2xl font-bold">{analytics.totalMovies}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Avg Views per Movie</p>
              <p className="text-2xl font-bold">
                {analytics.totalMovies > 0 
                  ? (analytics.totalViews / analytics.totalMovies).toFixed(1) 
                  : '0'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Engagement Rate</p>
              <p className="text-2xl font-bold">
                {analytics.totalUsers > 0 
                  ? ((analytics.totalViews / analytics.totalUsers)).toFixed(1)
                  : '0'}
                <span className="text-sm text-muted-foreground ml-1">views/user</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
