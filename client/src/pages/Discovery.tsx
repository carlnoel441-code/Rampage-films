import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, Film, ArrowLeft, Check, Clock } from "lucide-react";
import { useLocation } from "wouter";

interface TMDBSearchResult {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
}

interface Genre {
  id: number;
  name: string;
}

export default function Discovery() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthorized, isLoading } = useAdminAuth();
  
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [minRating, setMinRating] = useState("");
  const [sortBy, setSortBy] = useState("popularity.desc");
  const [discoveredMovies, setDiscoveredMovies] = useState<TMDBSearchResult[]>([]);
  const [importingIds, setImportingIds] = useState<Set<number>>(new Set());
  const [importedIds, setImportedIds] = useState<Set<number>>(new Set());

  const { data: genresData } = useQuery<{ genres: Genre[] }>({
    queryKey: ["/api/tmdb/genres"],
    enabled: isAuthorized,
  });

  const genres: Genre[] = genresData?.genres || [];

  const discoverMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tmdb/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          genreIds: selectedGenres.length > 0 ? selectedGenres : undefined,
          yearFrom: yearFrom ? parseInt(yearFrom) : undefined,
          yearTo: yearTo ? parseInt(yearTo) : undefined,
          minRating: minRating ? parseFloat(minRating) : undefined,
          sortBy,
          page: 1,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to discover movies");
      }

      return await res.json();
    },
    onSuccess: (data) => {
      setDiscoveredMovies(data.results || []);
      toast({
        title: "Discovery Complete",
        description: `Found ${data.count} movies matching your criteria`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Discovery Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const importMovieMutation = useMutation({
    mutationFn: async (tmdbId: number) => {
      const res = await fetch("/api/tmdb/import-movie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tmdbId }),
      });

      if (!res.ok) {
        const error = await res.json();
        if (error.error === "Movie already exists") {
          throw new Error("ALREADY_EXISTS");
        }
        throw new Error(error.error || "Failed to import movie");
      }

      return await res.json();
    },
    onSuccess: (data, tmdbId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      setImportingIds((prev) => {
        const next = new Set(prev);
        next.delete(tmdbId);
        return next;
      });
      setImportedIds((prev) => new Set(prev).add(tmdbId));
      
      toast({
        title: "Movie Imported!",
        description: `${data.movie.title} added to your catalog${data.needsVideo ? ' (needs video URL)' : ''}`,
      });
    },
    onError: (error: any, tmdbId) => {
      setImportingIds((prev) => {
        const next = new Set(prev);
        next.delete(tmdbId);
        return next;
      });

      if (error.message === "ALREADY_EXISTS") {
        setImportedIds((prev) => new Set(prev).add(tmdbId));
        toast({
          title: "Already Imported",
          description: "This movie is already in your catalog",
        });
      } else {
        toast({
          title: "Import Failed",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  const handleImport = (movie: TMDBSearchResult) => {
    setImportingIds((prev) => new Set(prev).add(movie.id));
    importMovieMutation.mutate(movie.id);
  };

  const handleDiscover = () => {
    setDiscoveredMovies([]);
    setImportedIds(new Set());
    setImportingIds(new Set());
    discoverMutation.mutate();
  };

  if (isLoading) {
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
              <CardDescription>You must be logged in as admin to access discovery</CardDescription>
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
          <h1 className="text-3xl font-bold mb-2">Discover Movies</h1>
          <p className="text-muted-foreground">
            Search TMDB's catalog and import movies with complete metadata
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Discovery Filters</CardTitle>
            <CardDescription>Set criteria to find the perfect movies for your catalog</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="genre-select">Genres (optional)</Label>
                <Select
                  value={selectedGenres.join(",")}
                  onValueChange={(value) => {
                    if (value) {
                      const genreId = parseInt(value);
                      if (!selectedGenres.includes(genreId)) {
                        setSelectedGenres([...selectedGenres, genreId]);
                      }
                    }
                  }}
                >
                  <SelectTrigger id="genre-select" data-testid="select-genre">
                    <SelectValue placeholder="Add genre filter" />
                  </SelectTrigger>
                  <SelectContent>
                    {genres.map((genre) => (
                      <SelectItem key={genre.id} value={String(genre.id)}>
                        {genre.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-2">
                  {selectedGenres.map((genreId) => {
                    const genre = genres.find((g) => g.id === genreId);
                    return genre ? (
                      <Button
                        key={genreId}
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedGenres(selectedGenres.filter((id) => id !== genreId))}
                        data-testid={`badge-genre-${genreId}`}
                      >
                        {genre.name} ×
                      </Button>
                    ) : null;
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sort-by">Sort By</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger id="sort-by" data-testid="select-sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popularity.desc">Most Popular</SelectItem>
                    <SelectItem value="vote_average.desc">Highest Rated</SelectItem>
                    <SelectItem value="release_date.desc">Newest First</SelectItem>
                    <SelectItem value="release_date.asc">Oldest First</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="year-from">Year From</Label>
                <Input
                  id="year-from"
                  type="number"
                  placeholder="1970"
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  data-testid="input-year-from"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="year-to">Year To</Label>
                <Input
                  id="year-to"
                  type="number"
                  placeholder="2024"
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  data-testid="input-year-to"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="min-rating">Minimum Rating (0-10)</Label>
                <Input
                  id="min-rating"
                  type="number"
                  step="0.1"
                  placeholder="7.0"
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                  data-testid="input-min-rating"
                />
              </div>
            </div>

            <Button
              onClick={handleDiscover}
              disabled={discoverMutation.isPending}
              className="w-full"
              data-testid="button-discover"
            >
              {discoverMutation.isPending ? (
                <>
                  <Clock className="mr-2 h-4 w-4 animate-spin" />
                  Searching TMDB...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Discover Movies
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {discoveredMovies.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-4">
              Discovered Movies ({discoveredMovies.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {discoveredMovies.map((movie) => {
                const isImporting = importingIds.has(movie.id);
                const isImported = importedIds.has(movie.id);
                const posterUrl = movie.poster_path
                  ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
                  : "/api/placeholder/400/600";
                const year = movie.release_date
                  ? new Date(movie.release_date).getFullYear()
                  : "N/A";

                return (
                  <Card key={movie.id} data-testid={`card-movie-${movie.id}`}>
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <img
                          src={posterUrl}
                          alt={movie.title}
                          className="w-24 h-36 object-cover rounded"
                          data-testid={`img-poster-${movie.id}`}
                        />
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-1" data-testid={`text-title-${movie.id}`}>
                            {movie.title}
                          </h3>
                          <p className="text-sm text-muted-foreground mb-2">
                            {year} • ⭐ {movie.vote_average.toFixed(1)}
                          </p>
                          <p className="text-sm line-clamp-3 mb-3">{movie.overview}</p>
                          <Button
                            size="sm"
                            onClick={() => handleImport(movie)}
                            disabled={isImporting || isImported}
                            variant={isImported ? "secondary" : "default"}
                            data-testid={`button-import-${movie.id}`}
                          >
                            {isImported ? (
                              <>
                                <Check className="mr-2 h-4 w-4" />
                                Imported
                              </>
                            ) : isImporting ? (
                              <>
                                <Clock className="mr-2 h-4 w-4 animate-spin" />
                                Importing...
                              </>
                            ) : (
                              <>
                                <Film className="mr-2 h-4 w-4" />
                                Import
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
