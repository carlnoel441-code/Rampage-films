import { Play, Plus, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface Movie {
  id?: string;
  title: string;
  description: string;
  year: string;
  rating: string;
  genres: string[];
  backdrop: string;
}

interface HeroSectionProps {
  movies: Movie[];
}

export default function HeroSection({ movies }: HeroSectionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % movies.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [movies.length]);

  const currentMovie = movies[currentIndex];

  const handleWatchNow = () => {
    if (currentMovie.id) {
      setLocation(`/movie/${currentMovie.id}`);
    }
  };

  const handleMoreInfo = () => {
    if (currentMovie.id) {
      setLocation(`/movie/${currentMovie.id}`);
    }
  };

  return (
    <div className="relative h-[70vh] w-full overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={currentMovie.backdrop}
          alt={currentMovie.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />
      </div>

      <div className="relative h-full flex items-end pb-16 md:pb-24 px-4 md:px-8 lg:px-12 max-w-[1920px] mx-auto">
        <div className="max-w-2xl space-y-4">
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-serif font-bold text-foreground">
            {currentMovie.title}
          </h2>
          
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className="border-primary text-primary">
              {currentMovie.rating}
            </Badge>
            <span className="text-foreground/70">{currentMovie.year}</span>
            <div className="flex gap-2">
              {currentMovie.genres.map((genre) => (
                <Badge key={genre} variant="secondary" className="text-xs">
                  {genre}
                </Badge>
              ))}
            </div>
          </div>

          <p className="text-base md:text-lg text-foreground/80 max-w-xl line-clamp-3">
            {currentMovie.description}
          </p>

          <div className="flex gap-3 pt-2">
            <Button 
              size="lg" 
              variant="default" 
              className="gap-2 text-lg px-8" 
              onClick={handleWatchNow}
              data-testid="button-play"
            >
              <Play className="h-6 w-6" fill="currentColor" />
              Watch Now
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="gap-2 backdrop-blur-md bg-background/20" 
              onClick={handleMoreInfo}
              data-testid="button-info"
            >
              <Info className="h-5 w-5" />
              More Info
            </Button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-4 right-4 flex gap-2">
        {movies.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`h-1 rounded-full transition-all ${
              index === currentIndex ? "w-8 bg-primary" : "w-4 bg-foreground/30"
            }`}
            data-testid={`button-hero-indicator-${index}`}
          />
        ))}
      </div>
    </div>
  );
}
