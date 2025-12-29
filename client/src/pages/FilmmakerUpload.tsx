import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Film, Upload, Link as LinkIcon, Info, Clock, 
  CheckCircle, AlertCircle, ArrowLeft, Globe
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary",
  "Drama", "Family", "Fantasy", "Horror", "Mystery", "Romance",
  "Science Fiction", "Thriller", "War", "Western", "Indie", "Cult Classic"
];

const SUPPORTED_PLATFORMS = [
  { name: "Ok.ru", icon: "🇷🇺", supported: true },
  { name: "Dailymotion", icon: "📺", supported: true },
  { name: "VK Video", icon: "🇷🇺", supported: true },
  { name: "Archive.org", icon: "📚", supported: true },
  { name: "Rumble", icon: "🎬", supported: true },
  { name: "Direct MP4", icon: "📁", supported: true },
  { name: "YouTube", icon: "▶️", supported: false, note: "Requires cookies" },
  { name: "Vimeo", icon: "🎥", supported: false, note: "Not supported" },
];

interface FilmmakerData {
  filmmaker: {
    id: string;
    status: string;
    displayName: string;
  };
}

export default function FilmmakerUpload() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [year, setYear] = useState("");
  const [duration, setDuration] = useState("");
  const [director, setDirector] = useState("");
  const [cast, setCast] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [trailerUrl, setTrailerUrl] = useState("");
  const [posterUrl, setPosterUrl] = useState("");

  const { data: user, isLoading: userLoading } = useQuery<any>({
    queryKey: ['/api/auth/user'],
  });

  const { data: dashboard, isLoading: dashboardLoading, error: dashboardError } = useQuery<FilmmakerData>({
    queryKey: ['/api/filmmakers/dashboard'],
    enabled: !!user,
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('/api/filmmakers/submit-movie', 'POST', data);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Submission failed');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Movie Submitted!", 
        description: "Your film has been submitted for review. We'll notify you once it's approved."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/filmmakers/dashboard'] });
      setLocation('/filmmaker/dashboard');
    },
    onError: (error: any) => {
      toast({ 
        title: "Submission Failed", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const handleGenreToggle = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter(g => g !== genre));
    } else if (selectedGenres.length < 3) {
      setSelectedGenres([...selectedGenres, genre]);
    } else {
      toast({
        title: "Maximum 3 genres",
        description: "Please deselect a genre before adding another.",
        variant: "destructive"
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    if (!description.trim()) {
      toast({ title: "Description required", variant: "destructive" });
      return;
    }
    if (!videoUrl.trim()) {
      toast({ title: "Video URL required", variant: "destructive" });
      return;
    }
    if (selectedGenres.length === 0) {
      toast({ title: "Select at least one genre", variant: "destructive" });
      return;
    }

    submitMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      year: year ? parseInt(year) : new Date().getFullYear(),
      duration: duration ? parseInt(duration) : null,
      director: director.trim() || null,
      cast: cast.trim() ? cast.split(',').map(c => c.trim()) : [],
      genres: selectedGenres,
      videoUrl: videoUrl.trim(),
      trailerUrl: trailerUrl.trim() || null,
      posterUrl: posterUrl.trim() || null,
    });
  };

  if (userLoading || dashboardLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 flex items-center justify-center">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 px-4 max-w-xl mx-auto text-center">
          <Film className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Sign In Required</h1>
          <p className="text-muted-foreground mb-6">
            Please sign in to submit your films.
          </p>
          <Button onClick={() => window.location.href = '/api/login'} data-testid="button-signin">
            Sign In
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  if (dashboardError || !dashboard) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 px-4 max-w-xl mx-auto text-center">
          <AlertCircle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Register First</h1>
          <p className="text-muted-foreground mb-6">
            You need to register as a filmmaker before submitting films.
          </p>
          <Button onClick={() => setLocation('/filmmaker/register')} data-testid="button-register">
            Register as Filmmaker
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const { filmmaker } = dashboard;

  if (filmmaker.status === 'pending') {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 px-4 max-w-xl mx-auto text-center">
          <Clock className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Account Pending Approval</h1>
          <p className="text-muted-foreground mb-6">
            Your filmmaker account is being reviewed. Once approved, you'll be able to submit films.
          </p>
          <Button variant="outline" onClick={() => setLocation('/filmmaker/dashboard')} data-testid="button-dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  if (filmmaker.status === 'suspended') {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 px-4 max-w-xl mx-auto text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Account Suspended</h1>
          <p className="text-muted-foreground mb-6">
            Your filmmaker account has been suspended. Please contact support for assistance.
          </p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 px-4 md:px-8 lg:px-12 max-w-[1000px] mx-auto py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation('/filmmaker/dashboard')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Submit a Film</h1>
            <p className="text-muted-foreground">Share your work with our global audience</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  Film Details
                </CardTitle>
                <CardDescription>
                  Provide information about your film
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="title">Title *</Label>
                      <Input 
                        id="title"
                        placeholder="Your film's title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        data-testid="input-title"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="year">Year</Label>
                      <Input 
                        id="year"
                        type="number"
                        min="1900"
                        max={new Date().getFullYear() + 1}
                        placeholder={new Date().getFullYear().toString()}
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        data-testid="input-year"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="duration">Duration (minutes)</Label>
                      <Input 
                        id="duration"
                        type="number"
                        min="1"
                        placeholder="90"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        data-testid="input-duration"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="director">Director</Label>
                      <Input 
                        id="director"
                        placeholder="Director's name"
                        value={director}
                        onChange={(e) => setDirector(e.target.value)}
                        data-testid="input-director"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cast">Cast (comma-separated)</Label>
                      <Input 
                        id="cast"
                        placeholder="Actor 1, Actor 2, Actor 3"
                        value={cast}
                        onChange={(e) => setCast(e.target.value)}
                        data-testid="input-cast"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description *</Label>
                    <Textarea 
                      id="description"
                      placeholder="Describe your film (plot, themes, what makes it unique)..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      required
                      data-testid="input-description"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Genres * (select up to 3)</Label>
                    <div className="flex flex-wrap gap-2">
                      {GENRES.map((genre) => (
                        <Badge
                          key={genre}
                          variant={selectedGenres.includes(genre) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => handleGenreToggle(genre)}
                          data-testid={`badge-genre-${genre.toLowerCase().replace(' ', '-')}`}
                        >
                          {genre}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="border-t pt-6 mt-6">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <LinkIcon className="h-4 w-4 text-primary" />
                      Video Sources
                    </h3>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="videoUrl">Video URL * (full movie)</Label>
                        <Input 
                          id="videoUrl"
                          type="url"
                          placeholder="https://ok.ru/video/... or direct MP4 URL"
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                          required
                          data-testid="input-video-url"
                        />
                        <p className="text-xs text-muted-foreground">
                          We'll download and host this for optimal streaming
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="trailerUrl">Trailer URL (optional)</Label>
                        <Input 
                          id="trailerUrl"
                          type="url"
                          placeholder="YouTube or other trailer link"
                          value={trailerUrl}
                          onChange={(e) => setTrailerUrl(e.target.value)}
                          data-testid="input-trailer-url"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="posterUrl">Poster Image URL (optional)</Label>
                        <Input 
                          id="posterUrl"
                          type="url"
                          placeholder="https://... (high-res poster image)"
                          value={posterUrl}
                          onChange={(e) => setPosterUrl(e.target.value)}
                          data-testid="input-poster-url"
                        />
                        <p className="text-xs text-muted-foreground">
                          We can auto-generate one from the video if not provided
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-primary/5 rounded-lg p-4 border border-primary/10">
                    <div className="flex items-start gap-3">
                      <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium mb-1">What happens after submission?</p>
                        <ul className="text-muted-foreground space-y-1">
                          <li>1. Our team reviews your submission</li>
                          <li>2. Video is downloaded and hosted on our servers</li>
                          <li>3. AI dubbing is applied (16 languages)</li>
                          <li>4. Film goes live and you start earning 70% of tips</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={submitMutation.isPending}
                    data-testid="button-submit"
                  >
                    {submitMutation.isPending ? (
                      <>
                        <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin mr-2" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Submit Film for Review
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  Supported Platforms
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {SUPPORTED_PLATFORMS.map((platform) => (
                  <div 
                    key={platform.name} 
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span>{platform.icon}</span>
                      <span className="text-sm">{platform.name}</span>
                    </div>
                    {platform.supported ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <span className="text-xs text-muted-foreground">{platform.note}</span>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg">Revenue Split</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <div className="text-4xl font-bold text-primary">70%</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    of all viewer tips go directly to you
                  </p>
                </div>
                <div className="mt-4 pt-4 border-t border-primary/20 text-sm text-muted-foreground">
                  <p>Payouts via Stripe Connect (coming soon)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
