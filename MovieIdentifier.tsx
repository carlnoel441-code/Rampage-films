import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ChevronLeft, ChevronRight, Check, Search, Film, Loader2, Edit, Globe } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Movie } from "@shared/schema";

interface TMDBResult {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
}

interface TMDBDetails {
  title: string;
  description: string;
  year: string;
  rating: string;
  genres: string[];
  poster: string;
  backdrop: string;
  duration: number;
  director: string;
  cast: string[];
}

export default function MovieIdentifier() {
  const { toast } = useToast();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  
  // Web search state
  const [webSearchQuery, setWebSearchQuery] = useState("");
  const [webSearchResults, setWebSearchResults] = useState<any[]>([]);
  const [isWebSearching, setIsWebSearching] = useState(false);
  
  // Manual entry form
  const [manualForm, setManualForm] = useState({
    title: "",
    year: "",
    description: "",
    director: "",
    genres: "",
    rating: "G",
  });

  // Get all movies that need identification (have "Recovered" in title or placeholder titles)
  const { data: allMovies = [], isLoading } = useQuery<Movie[]>({
    queryKey: ["/api/movies"],
  });

  // Filter to only movies needing identification
  const unidentifiedMovies = allMovies.filter(
    (m) => m.title.includes("Recovered") || m.title.includes("(1)") || m.title.includes("(2)")
  );

  const totalMovies = unidentifiedMovies.length;
  const identifiedCount = allMovies.length - totalMovies;

  // Clamp index when list shrinks
  useEffect(() => {
    if (totalMovies > 0 && currentIndex >= totalMovies) {
      setCurrentIndex(Math.max(0, totalMovies - 1));
    }
  }, [totalMovies, currentIndex]);

  const currentMovie = unidentifiedMovies[currentIndex];

  // Fetch video URL when current movie changes
  useEffect(() => {
    const fetchVideoUrl = async () => {
      if (!currentMovie) return;
      setIsLoadingVideo(true);
      setVideoUrl("");
      
      try {
        if (currentMovie.hostedAssetKey) {
          // Fetch signed URL for hosted videos
          const res = await fetch(`/api/movies/${currentMovie.id}/hosted-video-url`);
          if (res.ok) {
            const data = await res.json();
            setVideoUrl(data.url);
          }
        } else if (currentMovie.videoUrl) {
          setVideoUrl(currentMovie.videoUrl);
        }
      } catch (error) {
        console.error("Failed to get video URL:", error);
      } finally {
        setIsLoadingVideo(false);
      }
    };
    
    fetchVideoUrl();
  }, [currentMovie?.id]);

  const searchTMDB = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch("/api/search-tmdb-multiple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: searchQuery }),
      });
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (error) {
      toast({ title: "Search failed", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const applyTMDBData = async (tmdbId: number) => {
    if (!currentMovie) return;
    setIsUpdating(true);
    try {
      // Get full TMDB details
      const detailsRes = await fetch(`/api/tmdb-details/${tmdbId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!detailsRes.ok) {
        const errorData = await detailsRes.json().catch(() => ({}));
        throw new Error(errorData.details || "Failed to get TMDB details");
      }
      const details: TMDBDetails = await detailsRes.json();

      // Build update payload with validated data
      const updatePayload: any = {
        title: details.title || "Unknown Title",
        description: details.description || "",
        year: details.year || new Date().getFullYear().toString(),
        rating: details.rating || "PG-13",
        genres: Array.isArray(details.genres) ? details.genres : [],
        duration: typeof details.duration === 'number' ? details.duration : 90,
        director: details.director || "Unknown",
        cast: Array.isArray(details.cast) ? details.cast : [],
        // Preserve video fields
        videoUrl: currentMovie.videoUrl,
        hostedAssetKey: currentMovie.hostedAssetKey,
        mobileMp4Url: currentMovie.mobileMp4Url,
        trailerUrl: currentMovie.trailerUrl,
      };

      // Only include poster/backdrop if they're valid URLs
      if (details.poster && typeof details.poster === 'string' && details.poster.startsWith('http')) {
        updatePayload.poster = details.poster;
      }
      if (details.backdrop && typeof details.backdrop === 'string' && details.backdrop.startsWith('http')) {
        updatePayload.backdrop = details.backdrop;
      }

      const updateRes = await apiRequest("PATCH", `/api/movies/${currentMovie.id}`, updatePayload);

      if (!updateRes.ok) {
        const errorData = await updateRes.json().catch(() => ({}));
        console.error("Update error:", errorData);
        // Check for duplicate error
        if (errorData.details?.includes("unique_title_year") || errorData.details?.includes("duplicate")) {
          throw new Error(`"${details.title} (${details.year})" already exists. This may be a duplicate video file - use Skip to move on.`);
        }
        throw new Error(errorData.details || "Failed to update movie");
      }

      toast({ title: `Updated: ${details.title}` });
      
      // Clear search - DON'T increment index since the identified movie
      // is removed from the list, so next movie slides into current position
      setSearchQuery("");
      setSearchResults([]);
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
    } catch (error: any) {
      console.error("TMDB update failed:", error);
      toast({ title: "Update failed", description: error.message || "Unknown error", variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  const skipMovie = () => {
    if (currentIndex < totalMovies - 1) {
      setCurrentIndex(currentIndex + 1);
      setSearchQuery("");
      setSearchResults([]);
      setWebSearchQuery("");
      setWebSearchResults([]);
      setManualForm({ title: "", year: "", description: "", director: "", genres: "", rating: "G" });
    }
  };

  const prevMovie = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSearchQuery("");
      setSearchResults([]);
      setWebSearchQuery("");
      setWebSearchResults([]);
      setManualForm({ title: "", year: "", description: "", director: "", genres: "", rating: "G" });
    }
  };

  // Web search using OpenAI
  const searchWeb = async () => {
    if (!webSearchQuery.trim()) return;
    setIsWebSearching(true);
    try {
      const res = await fetch("/api/search-movie-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ query: webSearchQuery }),
      });
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setWebSearchResults(data.results || []);
      if (data.results?.length === 0) {
        toast({ title: "No results found", description: "Try a different search term" });
      }
    } catch (error) {
      toast({ title: "Web search failed", variant: "destructive" });
    } finally {
      setIsWebSearching(false);
    }
  };

  // Apply web search result
  const applyWebResult = async (result: any) => {
    if (!currentMovie) return;
    setIsUpdating(true);
    try {
      // Build update payload - only include valid data
      const updatePayload: any = {
        title: result.title,
        description: result.description || result.overview || "",
        year: result.year?.toString() || new Date().getFullYear().toString(),
        rating: result.rating || "PG-13",
        genres: Array.isArray(result.genres) ? result.genres : [],
        director: result.director || "Unknown",
        cast: Array.isArray(result.cast) ? result.cast : [],
        duration: typeof result.duration === 'number' ? result.duration : 90,
        // Preserve existing video fields
        videoUrl: currentMovie.videoUrl,
        hostedAssetKey: currentMovie.hostedAssetKey,
        mobileMp4Url: currentMovie.mobileMp4Url,
        trailerUrl: currentMovie.trailerUrl,
      };
      
      // Only update poster/backdrop if we have valid URLs
      if (result.poster && typeof result.poster === 'string' && result.poster.startsWith('http')) {
        updatePayload.poster = result.poster;
      }
      if (result.backdrop && typeof result.backdrop === 'string' && result.backdrop.startsWith('http')) {
        updatePayload.backdrop = result.backdrop;
      }

      const updateRes = await apiRequest("PATCH", `/api/movies/${currentMovie.id}`, updatePayload);

      if (!updateRes.ok) {
        const errorData = await updateRes.json().catch(() => ({}));
        console.error("Update error:", errorData);
        if (errorData.details?.includes("unique_title_year") || errorData.details?.includes("duplicate")) {
          throw new Error(`"${result.title} (${result.year})" already exists. This may be a duplicate video file - use Skip to move on.`);
        }
        throw new Error(errorData.details || "Failed to update movie");
      }

      toast({ title: `Updated: ${result.title}` });
      setWebSearchQuery("");
      setWebSearchResults([]);
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
    } catch (error: any) {
      console.error("Update failed:", error);
      toast({ title: "Update failed", description: error.message || "Unknown error", variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  // Manual entry save
  const saveManualEntry = async () => {
    if (!currentMovie || !manualForm.title.trim()) {
      toast({ title: "Please enter a title", variant: "destructive" });
      return;
    }
    setIsUpdating(true);
    try {
      const updateRes = await apiRequest("PATCH", `/api/movies/${currentMovie.id}`, {
        title: manualForm.title,
        description: manualForm.description,
        year: manualForm.year,
        rating: manualForm.rating,
        genres: manualForm.genres.split(",").map(g => g.trim()).filter(Boolean),
        director: manualForm.director,
        videoUrl: currentMovie.videoUrl,
        hostedAssetKey: currentMovie.hostedAssetKey,
        mobileMp4Url: currentMovie.mobileMp4Url,
        trailerUrl: currentMovie.trailerUrl,
      });

      if (!updateRes.ok) {
        const errorData = await updateRes.json().catch(() => ({}));
        if (errorData.details?.includes("unique_title_year") || errorData.details?.includes("duplicate")) {
          throw new Error(`"${manualForm.title} (${manualForm.year})" already exists. This may be a duplicate video file - use Skip to move on.`);
        }
        throw new Error(errorData.details || "Failed to update movie");
      }

      toast({ title: `Updated: ${manualForm.title}` });
      setManualForm({ title: "", year: "", description: "", director: "", genres: "", rating: "G" });
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
    } catch (error: any) {
      toast({ title: "Update failed", description: error.message || "Unknown error", variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (totalMovies === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">All Done!</h1>
          <p className="text-foreground/70 mb-4">
            All {allMovies.length} movies have been identified.
          </p>
          <Button onClick={() => window.location.href = "/admin"} data-testid="button-back-admin">
            Back to Admin
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Movie Identifier</h1>
            <p className="text-foreground/70">
              Watch a few seconds, then search TMDB to update the info
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold" data-testid="text-progress">
              {currentIndex + 1} / {totalMovies}
            </div>
            <div className="text-sm text-foreground/70">
              {identifiedCount} already identified
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-secondary rounded-full h-2 mb-6">
          <div
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${((currentIndex + 1) / totalMovies) * 100}%` }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Video Player */}
          <Card className="p-4">
            <div className="mb-4">
              <h2 className="font-semibold text-lg" data-testid="text-current-title">
                {currentMovie?.title}
              </h2>
              <p className="text-sm text-foreground/70">
                ID: {currentMovie?.id.slice(0, 8)}...
              </p>
            </div>
            
            <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4 flex items-center justify-center">
              {isLoadingVideo ? (
                <Loader2 className="w-8 h-8 animate-spin text-white" />
              ) : videoUrl ? (
                <video
                  key={currentMovie?.id}
                  src={videoUrl}
                  controls
                  className="w-full h-full"
                  data-testid="video-preview"
                >
                  Your browser does not support video playback.
                </video>
              ) : (
                <p className="text-white/50">No video available</p>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                onClick={prevMovie}
                disabled={currentIndex === 0}
                data-testid="button-prev"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="ghost"
                onClick={skipMovie}
                disabled={currentIndex >= totalMovies - 1}
                data-testid="button-skip"
              >
                Skip for now
              </Button>
              <Button
                variant="outline"
                onClick={skipMovie}
                disabled={currentIndex >= totalMovies - 1}
                data-testid="button-next"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </Card>

          {/* Search Tabs */}
          <Card className="p-4">
            <Tabs defaultValue="tmdb" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="tmdb" className="flex items-center gap-1">
                  <Search className="w-4 h-4" />
                  TMDB
                </TabsTrigger>
                <TabsTrigger value="web" className="flex items-center gap-1">
                  <Globe className="w-4 h-4" />
                  Web Search
                </TabsTrigger>
                <TabsTrigger value="manual" className="flex items-center gap-1">
                  <Edit className="w-4 h-4" />
                  Manual
                </TabsTrigger>
              </TabsList>

              {/* TMDB Search Tab */}
              <TabsContent value="tmdb" className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && searchTMDB()}
                    placeholder="Type the movie title..."
                    data-testid="input-search"
                  />
                  <Button
                    onClick={searchTMDB}
                    disabled={isSearching || !searchQuery.trim()}
                    data-testid="button-search"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                  </Button>
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {searchResults.length === 0 && !isSearching && (
                    <div className="text-center py-8 text-foreground/50">
                      <Film className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Search TMDB for popular movies</p>
                    </div>
                  )}

                  {searchResults.map((movie) => (
                    <Card
                      key={movie.id}
                      className="p-3 cursor-pointer hover-elevate active-elevate-2"
                      onClick={() => !isUpdating && applyTMDBData(movie.id)}
                      data-testid={`result-${movie.id}`}
                    >
                      <div className="flex gap-3">
                        {movie.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                            alt={movie.title}
                            className="w-16 h-24 object-cover rounded"
                          />
                        ) : (
                          <div className="w-16 h-24 bg-secondary rounded flex items-center justify-center">
                            <Film className="w-6 h-6 opacity-50" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{movie.title}</h3>
                          <p className="text-sm text-foreground/70">
                            {movie.release_date ? new Date(movie.release_date).getFullYear() : "N/A"} |{" "}
                            {movie.vote_average.toFixed(1)}
                          </p>
                          <p className="text-xs text-foreground/60 line-clamp-2 mt-1">
                            {movie.overview || "No description"}
                          </p>
                        </div>
                        {isUpdating ? (
                          <Loader2 className="w-5 h-5 animate-spin self-center" />
                        ) : (
                          <Check className="w-5 h-5 text-green-500 self-center opacity-0 group-hover:opacity-100" />
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Web Search Tab */}
              <TabsContent value="web" className="space-y-4">
                <p className="text-sm text-foreground/70">
                  Search the web using AI to find any movie, even obscure ones not in TMDB.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={webSearchQuery}
                    onChange={(e) => setWebSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && searchWeb()}
                    placeholder="Search for any movie..."
                    data-testid="input-web-search"
                  />
                  <Button
                    onClick={searchWeb}
                    disabled={isWebSearching || !webSearchQuery.trim()}
                    data-testid="button-web-search"
                  >
                    {isWebSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
                  </Button>
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {webSearchResults.length === 0 && !isWebSearching && (
                    <div className="text-center py-8 text-foreground/50">
                      <Globe className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>AI-powered search for obscure movies</p>
                    </div>
                  )}

                  {webSearchResults.map((movie, idx) => (
                    <Card
                      key={idx}
                      className="p-3 cursor-pointer hover-elevate active-elevate-2"
                      onClick={() => !isUpdating && applyWebResult(movie)}
                      data-testid={`web-result-${idx}`}
                    >
                      <div className="flex gap-3">
                        {movie.poster ? (
                          <img
                            src={movie.poster}
                            alt={movie.title}
                            className="w-16 h-24 object-cover rounded"
                          />
                        ) : (
                          <div className="w-16 h-24 bg-secondary rounded flex items-center justify-center">
                            <Film className="w-6 h-6 opacity-50" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{movie.title}</h3>
                          <p className="text-sm text-foreground/70">
                            {movie.year || "N/A"} {movie.director && `| ${movie.director}`}
                          </p>
                          <p className="text-xs text-foreground/60 line-clamp-2 mt-1">
                            {movie.description || "No description"}
                          </p>
                        </div>
                        {isUpdating ? (
                          <Loader2 className="w-5 h-5 animate-spin self-center" />
                        ) : (
                          <Check className="w-5 h-5 text-green-500 self-center" />
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Manual Entry Tab */}
              <TabsContent value="manual" className="space-y-4">
                <p className="text-sm text-foreground/70">
                  Manually enter movie details if you can't find it anywhere else.
                </p>
                
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="manual-title">Title *</Label>
                    <Input
                      id="manual-title"
                      value={manualForm.title}
                      onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                      placeholder="Movie title"
                      data-testid="input-manual-title"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="manual-year">Year</Label>
                      <Input
                        id="manual-year"
                        value={manualForm.year}
                        onChange={(e) => setManualForm({ ...manualForm, year: e.target.value })}
                        placeholder="1990"
                        data-testid="input-manual-year"
                      />
                    </div>
                    <div>
                      <Label htmlFor="manual-rating">Rating</Label>
                      <Input
                        id="manual-rating"
                        value={manualForm.rating}
                        onChange={(e) => setManualForm({ ...manualForm, rating: e.target.value })}
                        placeholder="G, PG, PG-13, R"
                        data-testid="input-manual-rating"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="manual-director">Director</Label>
                    <Input
                      id="manual-director"
                      value={manualForm.director}
                      onChange={(e) => setManualForm({ ...manualForm, director: e.target.value })}
                      placeholder="Director name"
                      data-testid="input-manual-director"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="manual-genres">Genres (comma separated)</Label>
                    <Input
                      id="manual-genres"
                      value={manualForm.genres}
                      onChange={(e) => setManualForm({ ...manualForm, genres: e.target.value })}
                      placeholder="Action, Horror, Comedy"
                      data-testid="input-manual-genres"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="manual-description">Description</Label>
                    <Textarea
                      id="manual-description"
                      value={manualForm.description}
                      onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                      placeholder="Brief movie description..."
                      rows={3}
                      data-testid="input-manual-description"
                    />
                  </div>
                  
                  <Button
                    onClick={saveManualEntry}
                    disabled={isUpdating || !manualForm.title.trim()}
                    className="w-full"
                    data-testid="button-save-manual"
                  >
                    {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                    Save Movie Info
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  );
}
