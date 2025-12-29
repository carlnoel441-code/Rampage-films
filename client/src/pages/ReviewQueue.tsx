import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Film, Video, Youtube } from "lucide-react";
import { useLocation } from "wouter";
import type { Movie } from "@shared/schema";

interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  channelTitle: string;
}

export default function ReviewQueue() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthorized, isLoading } = useAdminAuth();
  
  const [editingMovieId, setEditingMovieId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState("");
  const [youtubeResults, setYoutubeResults] = useState<YouTubeVideo[]>([]);
  const [searchingYoutube, setSearchingYoutube] = useState(false);

  const { data: movies, isLoading: moviesLoading } = useQuery<Movie[]>({
    queryKey: ["/api/movies"],
    enabled: isAuthorized,
  });

  const moviesNeedingVideo = movies?.filter((m) => !m.videoUrl) || [];

  const updateMovieMutation = useMutation({
    mutationFn: async ({ movieId, videoUrl }: { movieId: string; videoUrl: string }) => {
      return await apiRequest("PATCH", `/api/movies/${movieId}`, { videoUrl });
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      await queryClient.refetchQueries({ queryKey: ["/api/movies"] });
      setEditingMovieId(null);
      setVideoUrl("");
      setYoutubeResults([]);
      setYoutubeSearchQuery("");
      
      toast({
        title: "Video URL Added",
        description: "Movie is now ready for streaming",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const searchYoutube = async (query: string) => {
    if (!query.trim()) return;
    
    setSearchingYoutube(true);
    try {
      const res = await fetch("/api/youtube/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query, maxResults: 5 }),
      });

      if (!res.ok) {
        throw new Error("Failed to search YouTube");
      }

      const data = await res.json();
      setYoutubeResults(data.videos || []);
    } catch (error: any) {
      toast({
        title: "YouTube Search Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSearchingYoutube(false);
    }
  };

  const handleStartEditing = (movie: Movie) => {
    setEditingMovieId(movie.id);
    setVideoUrl("");
    setYoutubeSearchQuery(movie.title);
    setYoutubeResults([]);
  };

  const handleSaveVideoUrl = (movieId: string) => {
    if (!videoUrl.trim()) {
      toast({
        title: "Video URL Required",
        description: "Please enter a valid video URL",
        variant: "destructive",
      });
      return;
    }

    updateMovieMutation.mutate({ movieId, videoUrl });
  };

  const handleSelectYoutubeVideo = (video: YouTubeVideo) => {
    const url = `https://www.youtube.com/watch?v=${video.videoId}`;
    setVideoUrl(url);
  };

  if (isLoading || moviesLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Card>
            <CardHeader>
              <CardTitle>Access Denied</CardTitle>
              <CardDescription>You must be logged in as admin to access the review queue</CardDescription>
            </CardHeader>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => setLocation("/admin")}
            data-testid="button-back-to-admin"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Admin
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Review Queue</h1>
          <p className="text-muted-foreground">
            {moviesNeedingVideo.length} movie{moviesNeedingVideo.length !== 1 ? 's' : ''} waiting for video URLs
          </p>
        </div>

        {moviesNeedingVideo.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Film className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">All Set!</h3>
              <p className="text-muted-foreground">
                All movies in your catalog have video URLs assigned
              </p>
              <Button
                onClick={() => setLocation("/admin/discovery")}
                className="mt-4"
                data-testid="button-go-to-discovery"
              >
                Discover More Movies
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {moviesNeedingVideo.map((movie) => {
              const isEditing = editingMovieId === movie.id;

              return (
                <Card key={movie.id} data-testid={`card-movie-${movie.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle>{movie.title}</CardTitle>
                        <CardDescription>
                          {movie.year} • {movie.genres.join(", ")} • {movie.duration} min
                        </CardDescription>
                      </div>
                      <img
                        src={movie.poster}
                        alt={movie.title}
                        className="w-20 h-28 object-cover rounded"
                        data-testid={`img-poster-${movie.id}`}
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {!isEditing ? (
                      <Button
                        onClick={() => handleStartEditing(movie)}
                        data-testid={`button-add-video-${movie.id}`}
                      >
                        <Video className="mr-2 h-4 w-4" />
                        Add Video URL
                      </Button>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor={`video-url-${movie.id}`}>Video URL</Label>
                          <div className="flex gap-2">
                            <Input
                              id={`video-url-${movie.id}`}
                              type="url"
                              placeholder="https://youtube.com/watch?v=... or http://ok.ru/video/..."
                              value={videoUrl}
                              onChange={(e) => setVideoUrl(e.target.value)}
                              data-testid={`input-video-url-${movie.id}`}
                            />
                            <Button
                              onClick={() => handleSaveVideoUrl(movie.id)}
                              disabled={!videoUrl.trim() || updateMovieMutation.isPending}
                              data-testid={`button-save-${movie.id}`}
                            >
                              <Save className="mr-2 h-4 w-4" />
                              Save
                            </Button>
                          </div>
                        </div>

                        <div className="border-t pt-4">
                          <Label htmlFor={`youtube-search-${movie.id}`}>
                            Or search YouTube
                          </Label>
                          <div className="flex gap-2 mt-2">
                            <Input
                              id={`youtube-search-${movie.id}`}
                              placeholder={`Search for "${movie.title}"...`}
                              value={youtubeSearchQuery}
                              onChange={(e) => setYoutubeSearchQuery(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  searchYoutube(youtubeSearchQuery);
                                }
                              }}
                              data-testid={`input-youtube-search-${movie.id}`}
                            />
                            <Button
                              onClick={() => searchYoutube(youtubeSearchQuery)}
                              disabled={searchingYoutube}
                              data-testid={`button-youtube-search-${movie.id}`}
                            >
                              <Youtube className="mr-2 h-4 w-4" />
                              Search
                            </Button>
                          </div>

                          {youtubeResults.length > 0 && (
                            <div className="mt-4 space-y-2">
                              <p className="text-sm font-medium">YouTube Results:</p>
                              {youtubeResults.map((video) => (
                                <Card
                                  key={video.videoId}
                                  className="cursor-pointer hover-elevate"
                                  onClick={() => handleSelectYoutubeVideo(video)}
                                  data-testid={`card-youtube-${video.videoId}`}
                                >
                                  <CardContent className="p-3">
                                    <div className="flex gap-3">
                                      <img
                                        src={video.thumbnail}
                                        alt={video.title}
                                        className="w-32 h-20 object-cover rounded"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm line-clamp-2">
                                          {video.title}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {video.channelTitle}
                                        </p>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              ))}
                            </div>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          onClick={() => {
                            setEditingMovieId(null);
                            setVideoUrl("");
                            setYoutubeResults([]);
                          }}
                          data-testid={`button-cancel-${movie.id}`}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
