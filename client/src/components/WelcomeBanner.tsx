import { Film, Play, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { type Movie } from "@shared/schema";

interface WelcomeBannerProps {
  featuredMovies: Movie[];
}

export default function WelcomeBanner({ featuredMovies }: WelcomeBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem("rampage-welcome-seen");
    if (!hasSeenWelcome) {
      setIsVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("rampage-welcome-seen", "true");
    setIsVisible(false);
  };

  const handleWatchMovie = (movieId: string) => {
    handleDismiss();
    setLocation(`/movie/${movieId}`);
  };

  if (!isVisible || featuredMovies.length === 0) return null;

  const topPicks = featuredMovies.slice(0, 3);

  return (
    <div className="px-4 md:px-8 lg:px-12 py-6">
      <Card className="relative bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20 p-6 md:p-8">
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-4 right-4"
          onClick={handleDismiss}
          data-testid="button-dismiss-welcome"
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="flex items-start gap-4 mb-6">
          <div className="bg-primary/20 rounded-full p-3">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
              Welcome to Rampage Films!
            </h2>
            <p className="text-foreground/70 max-w-2xl">
              You've discovered the home of rare and hard-to-find movies. 
              Click on any movie poster to start watching - it's completely free!
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Film className="h-5 w-5 text-primary" />
            Start with one of our staff picks:
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {topPicks.map((movie) => (
              <button
                key={movie.id}
                onClick={() => handleWatchMovie(movie.id)}
                className="flex items-center gap-4 p-3 rounded-md bg-background/50 hover-elevate active-elevate-2 transition-all text-left"
                data-testid={`button-staff-pick-${movie.id}`}
              >
                <img
                  src={movie.poster}
                  alt={movie.title}
                  className="w-16 h-24 object-cover rounded-md"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-foreground truncate">{movie.title}</h4>
                  <p className="text-sm text-foreground/60">{movie.year} • {movie.genres[0]}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Play className="h-4 w-4 text-primary" fill="currentColor" />
                    <span className="text-sm text-primary font-medium">Watch Now</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
