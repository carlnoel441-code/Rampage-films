import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Movie } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MovieVideoContainer from "@/components/MovieVideoContainer";
import MovieRow from "@/components/MovieRow";
import MovieSEO from "@/components/MovieSEO";
import ReviewsSection from "@/components/ReviewsSection";
import TipJar from "@/components/TipJar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Star, Share2, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function MovieDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  

  const { data: movie, isLoading } = useQuery<Movie>({
    queryKey: [`/api/movies/${id}`],
    enabled: !!id,
    staleTime: 0, // Always refetch to get latest hostedAssetKey after downloads complete
    refetchOnMount: 'always',
  });

  const viewMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/movies/${id}/view`),
  });

  useEffect(() => {
    if (id) {
      viewMutation.mutate();
    }
  }, [id]);

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/movie/${id}`;
    const shareData = {
      title: `Watch ${movie?.title} on Rampage Films`,
      text: movie?.description || `Check out this movie on Rampage Films!`,
      url: shareUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          copyToClipboard(shareUrl);
        }
      }
    } else {
      copyToClipboard(shareUrl);
    }
  };

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "Movie link copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please copy the link manually",
        variant: "destructive"
      });
    }
  };

  const { data: allMovies } = useQuery<Movie[]>({
    queryKey: ["/api/movies"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-foreground/70">Loading movie...</p>
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-foreground/70">Movie not found</p>
          <Button onClick={() => setLocation("/")} data-testid="button-home">
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  const relatedMovies = (allMovies || [])
    .filter(m => 
      m.id !== movie.id && 
      m.genres.some(g => movie.genres.includes(g))
    )
    .slice(0, 6)
    .map(m => ({
      id: m.id,
      title: m.title,
      year: m.year,
      rating: m.rating,
      poster: m.poster,
      genre: m.genres[0]
    }));

  return (
    <div className="min-h-screen bg-background">
      <MovieSEO movie={movie} />
      <Header />
      <div className="pt-16">
        <div className="px-4 md:px-8 lg:px-12 max-w-[1920px] mx-auto py-8">
          <Button
            variant="ghost"
            onClick={() => window.history.back()}
            className="mb-6 gap-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <MovieVideoContainer 
                videoUrl={movie.videoUrl || ""} 
                mobileMp4Url={movie.mobileMp4Url}
                title={movie.title} 
                subtitleUrl={movie.subtitleUrl}
                movieId={movie.id}
                hostedAssetKey={movie.hostedAssetKey}
                transcodingStatus={movie.transcodingStatus}
                skipSegments={{
                  introStart: movie.introStart,
                  introEnd: movie.introEnd,
                  creditsStart: movie.creditsStart,
                }}
              />

              <div className="space-y-4">
                <h1 className="text-3xl md:text-4xl font-serif font-bold" data-testid="text-title">
                  {movie.title}
                </h1>

                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="outline" className="border-primary text-primary">
                    {movie.rating}
                  </Badge>
                  <span className="text-foreground/70">{movie.year}</span>
                  <span className="text-foreground/70">{movie.duration} min</span>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-primary text-primary" />
                    <span className="text-foreground/70">8.5</span>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {movie.genres.map((genre) => (
                    <Badge key={genre} variant="secondary">
                      {genre}
                    </Badge>
                  ))}
                </div>

                <p className="text-foreground/80 text-lg leading-relaxed" data-testid="text-description">
                  {movie.description}
                </p>
              </div>

              <ReviewsSection movieId={movie.id} movieTitle={movie.title} />
            </div>

            <div className="space-y-6">
              <div className="bg-card rounded-md p-6 space-y-4 border border-card-border">
                <div>
                  <h3 className="text-sm font-semibold text-foreground/60 mb-2">Director</h3>
                  <p className="text-foreground" data-testid="text-director">{movie.director}</p>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-foreground/60 mb-2">Cast</h3>
                  <div className="space-y-1">
                    {movie.cast.map((actor, index) => (
                      <p key={index} className="text-foreground/80" data-testid={`text-cast-${index}`}>
                        {actor}
                      </p>
                    ))}
                  </div>
                </div>

                <Button className="w-full gap-2" data-testid="button-add-watchlist">
                  <Plus className="h-4 w-4" />
                  Add to Watchlist
                </Button>

                <Button 
                  variant="outline" 
                  className="w-full gap-2" 
                  onClick={handleShare}
                  data-testid="button-share"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                  {copied ? "Link Copied!" : "Share Movie"}
                </Button>

                {movie.isFilmmakerUploaded && movie.monetizationEnabled && (
                  <div className="pt-2 border-t border-card-border">
                    <TipJar 
                      variant="button"
                      tipType="filmmaker_split"
                      movieId={movie.id}
                      filmmakerName={movie.director}
                      buttonText="Support the Filmmaker"
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      70% goes to the filmmaker
                    </p>
                  </div>
                )}
              </div>

              <img
                src={movie.poster}
                alt={movie.title}
                className="w-full rounded-md border border-card-border"
                data-testid="img-poster"
              />
            </div>
          </div>

          {relatedMovies.length > 0 && (
            <div className="mt-12">
              <MovieRow title="More Like This" movies={relatedMovies} />
            </div>
          )}
        </div>
        <Footer />
      </div>
    </div>
  );
}
